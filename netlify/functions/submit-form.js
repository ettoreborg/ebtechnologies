exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const data        = JSON.parse(event.body);
  const { name, company, email, phone, service,
          contact_method, best_time, message,
          queue, formspree_url }  = data;

  const fqdn = 'https://ebservices.3cx.eu';

  const messageText = [
    '📋 New Website Enquiry',
    '─────────────────────',
    `Name:     ${name}`,
    company        ? `Company:  ${company}`        : null,
    `Email:    ${email}`,
    phone          ? `Phone:    ${phone}`           : null,
    service        ? `Service:  ${service}`         : null,
    contact_method ? `Contact:  ${contact_method}`  : null,
    best_time      ? `Time:     ${best_time}`       : null,
    '─────────────────────',
    `Message:  ${message}`
  ].filter(Boolean).join('\n');

  try {
    const authId   = process.env.TCX_AUTH_ID;
    const authPass = process.env.TCX_AUTH_PASS;

    if (!authId || !authPass) throw new Error('TCX_AUTH_ID / TCX_AUTH_PASS not configured');

    // ── Credential check via OAuth2 password grant ─────────────────────────
    const pwRes  = await fetch(`${fqdn}/connect/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `grant_type=password&client_id=WebClient&username=${encodeURIComponent(authId)}&password=${encodeURIComponent(authPass)}`
    });
    const pwBody = await pwRes.text();
    throw new Error(`OAuth2 cred check [${pwRes.status}]: ${pwBody.slice(0, 300)}`);
    // ── Protobuf helpers ───────────────────────────────────────────────────

    function writeVarint(value) {
      const bytes = [];
      let v = value >>> 0; // treat as unsigned 32-bit
      while (v > 127) {
        bytes.push((v & 0x7F) | 0x80);
        v >>>= 7;
      }
      bytes.push(v);
      return Buffer.from(bytes);
    }

    function encodeVarintField(fieldNumber, value) {
      return Buffer.concat([writeVarint((fieldNumber << 3) | 0), writeVarint(value)]);
    }

    function encodeString(fieldNumber, str) {
      const strBytes = Buffer.from(str, 'utf8');
      return Buffer.concat([writeVarint((fieldNumber << 3) | 2), writeVarint(strBytes.length), strBytes]);
    }

    function encodeEmbedded(fieldNumber, data) {
      return Buffer.concat([writeVarint((fieldNumber << 3) | 2), writeVarint(data.length), data]);
    }

    function readVarint(data, pos) {
      let result = 0, shift = 0;
      while (pos < data.length) {
        const b = data[pos++];
        result |= (b & 0x7F) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
      }
      return { value: result, pos };
    }

    function extractStringFromField(data, targetField) {
      let pos = 0;
      while (pos < data.length) {
        const t = readVarint(data, pos); pos = t.pos;
        const wireType = t.value & 7, fieldNum = t.value >> 3;
        if (wireType === 2) {
          const l = readVarint(data, pos); pos = l.pos;
          const len = l.value;
          if (fieldNum === targetField) return data.slice(pos, pos + len).toString('utf8');
          pos += len;
        } else if (wireType === 0) {
          const v = readVarint(data, pos); pos = v.pos;
        } else break;
      }
      return null;
    }

    function extractSessionId(data) {
      let pos = 0;
      while (pos < data.length) {
        const t = readVarint(data, pos); pos = t.pos;
        const wireType = t.value & 7, fieldNum = t.value >> 3;
        if (wireType === 2) {
          const l = readVarint(data, pos); pos = l.pos;
          const len = l.value;
          const fieldData = data.slice(pos, pos + len);
          pos += len;
          if (fieldNum === 200) return extractStringFromField(fieldData, 5); // LoginInfo.SessionId
        } else if (wireType === 0) {
          const v = readVarint(data, pos); pos = v.pos;
        } else break;
      }
      return null;
    }

    // ── Protobuf message builders ──────────────────────────────────────────

    function buildLoginRequest(username, password) {
      const inner = Buffer.concat([
        encodeString(1, username),
        encodeString(2, password),
        encodeString(3, '1.0'),
        encodeString(4, 'WebClient'),
        encodeString(5, '2'),
      ]);
      return Buffer.concat([
        encodeVarintField(1, 100),
        encodeEmbedded(100, inner),
      ]);
    }

    function buildSendChatRequest(recipientDn, text) {
      const recipient = encodeString(1, recipientDn); // ChatRecipient.DN
      const inner = Buffer.concat([
        encodeString(1, text),
        encodeEmbedded(2, recipient),
      ]);
      return Buffer.concat([
        encodeVarintField(1, 110),
        encodeEmbedded(110, inner),
      ]);
    }

    // ── Send raw binary to MyPhone endpoint ───────────────────────────────

    async function sendRaw(payload, sessionToken) {
      const headers = {
        'content-type': 'application/octet-stream',
        'accept':       'application/octet-stream',
        'ngsw-bypass':  'bypass',
      };
      if (sessionToken) headers['myphonesession'] = sessionToken;

      const res = await fetch(`${fqdn}/MyPhone/MPWebService.asmx`, {
        method: 'POST',
        headers,
        body: payload,
      });
      return res;
    }

    // ── Step 1: Login ──────────────────────────────────────────────────────

    const loginPayload = buildLoginRequest(authId, authPass);
    const loginRes     = await sendRaw(loginPayload, null);
    const loginBody    = await loginRes.arrayBuffer();

    if (!loginRes.ok) {
      throw new Error(`3CX MyPhone login failed [${loginRes.status}]`);
    }

    const loginBuf     = Buffer.from(loginBody);
    const sessionToken = extractSessionId(loginBuf);
    if (!sessionToken) throw new Error('3CX login: no session token — raw:' + loginBuf.toString('base64'));

    // ── Step 2: Send chat ──────────────────────────────────────────────────

    const recipientDn  = queue || '800';
    const chatPayload  = buildSendChatRequest(recipientDn, messageText);
    const chatRes      = await sendRaw(chatPayload, sessionToken);

    if (!chatRes.ok) {
      const chatBody = await chatRes.text();
      throw new Error(`3CX send chat failed [${chatRes.status}]: ${chatBody}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, via: '3cx' })
    };

  } catch (err) {
    // Fallback — Formspree email
    try {
      const fsRes = await fetch(formspree_url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify(data)
      });

      if (fsRes.ok) {
        return {
          statusCode: 200,
          body: JSON.stringify({ success: true, via: 'email_fallback', debug: err.message })
        };
      }
      throw new Error('Formspree also failed');

    } catch (fallbackErr) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Both failed', debug: err.message })
      };
    }
  }
};
