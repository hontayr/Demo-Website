// effects.js: the homepage's two motion effects.
//
// 1. scramble(): a heading "decrypts" from random glyphs into its real text.
// 2. revealOnScroll(): a fallback for browsers without CSS scroll-driven
//    animations. Modern browsers handle the reveal in styles.css with no JS.
//
// Both only run when the inline script in <head> added .js-motion, which means
// JavaScript works AND the visitor hasn't asked for reduced motion.

const GLYPHS = '!<>-_\\/[]{}=+*^?#01';
const SCRAMBLE_MS = 800;

function randomGlyph() {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

// Animate one heading from glyphs to its real text, left to right.
function scramble(el) {
  const text = el.textContent;

  // Screen readers read the real words from aria-label the whole time, and
  // ignore the animated span (aria-hidden), so they never hear the glyphs.
  el.setAttribute('aria-label', text);
  const span = document.createElement('span');
  span.setAttribute('aria-hidden', 'true');
  el.textContent = '';
  el.appendChild(span);

  const start = performance.now();

  function frame(now) {
    // progress runs from 0 to 1 over SCRAMBLE_MS.
    const progress = Math.min((now - start) / SCRAMBLE_MS, 1);
    // Characters before this index are settled; the rest are still glyphs.
    const settled = Math.floor(progress * text.length);

    let out = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      out += i < settled || ch === ' ' ? ch : randomGlyph();
    }
    span.textContent = out;

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      // Done: put the heading back to plain text, exactly as it was in the HTML.
      el.removeAttribute('aria-label');
      el.textContent = text;
    }
  }

  requestAnimationFrame(frame);
}

// Older browsers only: add .visible to each .reveal element as it scrolls in.
function revealOnScroll() {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);   // reveal once, then stop watching
      }
    }
  }, { threshold: 0.15 });

  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
}

function init() {
  if (!document.documentElement.classList.contains('js-motion')) return;

  document.querySelectorAll('[data-scramble]').forEach(scramble);

  if (!CSS.supports('animation-timeline: view()')) {
    revealOnScroll();
  }
}

init();
