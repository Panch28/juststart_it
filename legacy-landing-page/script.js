// ── Navbar scroll effect ──────────────────────────────
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
});

// ── Mobile hamburger ──────────────────────────────────
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('nav-links');
hamburger.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => navLinks.classList.remove('open'));
});

// ── Intersection observer — fade in on scroll ─────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.card, .two-col, .section-header, .contact-form').forEach(el => {
  el.classList.add('fade-up');
  observer.observe(el);
});

// ── Contact form submit ───────────────────────────────
document.getElementById('contact-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  btn.textContent = 'Sent ✓';
  btn.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = 'Send Message';
    btn.style.background = '';
    btn.disabled = false;
    e.target.reset();
  }, 3000);
});
