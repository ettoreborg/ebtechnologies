'use strict';

// ===== NAVBAR =====
const navbar    = document.getElementById('navbar');
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('nav-links');

window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
  updateActiveLink();
}, { passive: true });

hamburger.addEventListener('click', () => {
  const open = hamburger.classList.toggle('open');
  navLinks.classList.toggle('open', open);
});

navLinks.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('open');
    navLinks.classList.remove('open');
  });
});

// ===== ACTIVE NAV LINK =====
function updateActiveLink() {
  const sections = document.querySelectorAll('section[id]');
  let current = '';
  sections.forEach(s => {
    if (window.scrollY >= s.offsetTop - 100) current = s.id;
  });
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
  });
}

// ===== SCROLL ANIMATIONS =====
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const delay = entry.target.dataset.delay || 0;
      setTimeout(() => entry.target.classList.add('visible'), Number(delay));
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll(
  '.service-card, .why-card, .process-step, .about-content, .about-visual, .contact-info, .contact-form-wrap, .section-header'
).forEach(el => {
  el.classList.add('fade-in');
  observer.observe(el);
});

// ===== CONTACT FORM =====
const form    = document.getElementById('contact-form');
const success = document.getElementById('form-success');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = form.querySelector('button[type="submit"]');
  const text = btn.querySelector('.btn-text');
  text.textContent = 'Sending…';
  btn.disabled = true;

  // Simulate send (replace with real endpoint/EmailJS/Formspree)
  setTimeout(() => {
    form.reset();
    success.classList.add('show');
    text.textContent = 'Send Message';
    btn.disabled = false;
    setTimeout(() => success.classList.remove('show'), 6000);
  }, 1200);
});

// ===== FOOTER YEAR =====
document.getElementById('year').textContent = new Date().getFullYear();

// ===== SMOOTH SCROLL FOR OLDER BROWSERS =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
