exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const data        = JSON.parse(event.body);
  const { name, company, email, phone, service,
          contact_method, best_time, message,
          queue, formspree_url }  = data;

  const fqdn         = 'https://ebservices.3cx.eu';
  const clientId     = 'webcontformit';
  const clientSecret = process.env.TCX_API_KEY;

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
    // Step 1 — Authenticate with 3CX
    const authRes = await fetch(`${fqdn}/connect/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `grant_type=client_credentials&client_id=${clientId}&client_secret=${encodeURIComponent(clientSecret)}&scope=all`
    });

    const authBody = await authRes.text();
    if (!authRes.ok) throw new Error(`3CX auth failed [${authRes.status}]: ${authBody}`);

    const { access_token } = JSON.parse(authBody);

    // Step 2 — Send chat message to queue extension
    // Try endpoints in order until one works
    // 3CX chat API endpoint not yet confirmed — throw to use email fallback
    throw new Error('3CX chat API endpoint not confirmed');

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
