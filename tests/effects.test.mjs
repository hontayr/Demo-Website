// Unit tests for js/effects.js. Run with: node --test
//
// effects.js is a plain browser script, so each test loads it into a fresh
// node:vm context with a tiny fake DOM and a hand-driven animation clock.

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../js/effects.js', import.meta.url), 'utf8');
const HEADING = 'Your first hack starts here.';

function fakeClassList(initial = []) {
  const set = new Set(initial);
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
  };
}

function fakeElement(text = '') {
  const attrs = {};
  return {
    textContent: text,
    children: [],
    classList: fakeClassList(),
    setAttribute: (k, v) => { attrs[k] = String(v); },
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    removeAttribute: (k) => { delete attrs[k]; },
    appendChild(child) { this.children.push(child); },
  };
}

// Builds the page the script sees. Options:
//   motion: whether the <head> script added .js-motion
//   scrollTimeline: what CSS.supports('animation-timeline: view()') answers
//   observer: whether IntersectionObserver exists
//   visibility: document.visibilityState ('hidden' for background tabs)
//   headingChildren: child elements inside the heading
//   text: the heading's text
function load({
  motion = true, scrollTimeline = true, observer = true,
  visibility = 'visible', headingChildren = [], text = HEADING,
} = {}) {
  const html = fakeElement();
  if (motion) html.classList.add('js-motion');
  const heading = fakeElement(text);
  heading.children.push(...headingChildren);
  const steps = [fakeElement(), fakeElement(), fakeElement()];
  const frames = [];
  const observed = [];
  const unobserved = [];
  const supportsQueries = [];
  let now = 0;

  const ctx = {
    performance: { now: () => now },
    requestAnimationFrame: (fn) => frames.push(fn),
    CSS: { supports: (q) => { supportsQueries.push(q); return scrollTimeline; } },
    document: {
      documentElement: html,
      visibilityState: visibility,
      createElement: () => fakeElement(),
      querySelectorAll: (sel) =>
        sel === '[data-scramble]' ? [heading] : sel === '.reveal' ? steps : [],
    },
  };
  if (observer) {
    ctx.IntersectionObserver = class {
      constructor(cb) { this.cb = cb; }
      observe(el) { observed.push({ el, io: this }); }
      unobserve(el) { unobserved.push(el); }
    };
  }
  ctx.window = ctx;

  vm.runInNewContext(SRC, ctx);

  return {
    html, heading, steps, observed, unobserved, frames, supportsQueries,
    // What a visitor sees in the heading right now.
    shownText() {
      return heading.children[0] ? heading.children[0].textContent : heading.textContent;
    },
    runFrames(stepMs = 100) {
      const seen = [];
      while (frames.length) {
        now += stepMs;
        frames.shift()(now);
        seen.push(heading.children[0] ? heading.children[0].textContent : heading.textContent);
      }
      return seen;
    },
  };
}

test('scramble ends on the real heading text and removes its aria-label', () => {
  const page = load();
  assert.equal(page.heading.getAttribute('aria-label'), HEADING);
  page.runFrames();
  assert.equal(page.heading.textContent, HEADING);
  assert.equal(page.heading.getAttribute('aria-label'), null);
});

test('scramble keeps spaces in place on every frame', () => {
  const page = load();
  for (const frame of page.runFrames()) {
    for (let i = 0; i < HEADING.length; i++) {
      if (HEADING[i] === ' ') assert.equal(frame[i], ' ');
    }
  }
});

test('reduced motion (no .js-motion): nothing animates or hides', () => {
  const page = load({ motion: false, scrollTimeline: false });
  assert.equal(page.frames.length, 0);
  assert.equal(page.heading.textContent, HEADING);
  assert.equal(page.observed.length, 0);
  assert.equal(page.html.classList.contains('reveal-ready'), false);
});

test('scroll-driven browsers: CSS handles the reveal, no observer', () => {
  const page = load({ scrollTimeline: true });
  assert.equal(page.observed.length, 0);
});

test('fallback browsers: observer watches each step and reveals it once', () => {
  const page = load({ scrollTimeline: false });
  assert.equal(page.observed.length, 3);
  assert.equal(page.html.classList.contains('reveal-ready'), true);
  const { el, io } = page.observed[0];
  io.cb([{ isIntersecting: true, target: el }]);
  assert.equal(el.classList.contains('visible'), true);
  assert.deepEqual(page.unobserved, [el]);   // stops watching after the reveal
});

test('fallback browsers: a step that has not scrolled in stays hidden', () => {
  const page = load({ scrollTimeline: false });
  const { el, io } = page.observed[1];
  io.cb([{ isIntersecting: false, target: el }]);
  assert.equal(el.classList.contains('visible'), false);
  assert.equal(page.unobserved.length, 0);
});

test('the JS feature check matches both @supports queries in styles.css', () => {
  const page = load({ scrollTimeline: false });
  const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
  assert.deepEqual(page.supportsQueries, ['animation-timeline: view()']);
  assert.ok(css.includes('@supports (animation-timeline: view())'));
  assert.ok(css.includes('@supports not (animation-timeline: view())'));
});

test('scramble skips headings that contain markup', () => {
  const page = load({ headingChildren: [fakeElement('em')] });
  assert.equal(page.frames.length, 0);
  assert.equal(page.heading.getAttribute('aria-label'), null);
  assert.equal(page.heading.textContent, HEADING);
});

// Regression: the heading was emptied and only filled on the first animation
// frame, so a background tab (frames paused) or a snapshot bot saw a blank h1.
test('the heading is never blank before the first animation frame', () => {
  const page = load();
  assert.equal(page.shownText().length, HEADING.length);
});

// Regression: top-level const/function names leaked onto the page, so a page
// that loaded effects.js twice (or another script declaring GLYPHS) threw
// "Identifier 'GLYPHS' has already been declared" and lost its effects.
// Value: protects=effects.js can share a page with itself and other scripts; fails_when=the IIFE wrapper is removed; why_new=load() uses a fresh context per test; seam=none; no_claim=real browser script loading
test('loading effects.js twice on one page does not throw', () => {
  const ctx = vm.createContext({
    document: { documentElement: fakeElement(), querySelectorAll: () => [] },
  });
  vm.runInContext(SRC, ctx);
  assert.doesNotThrow(() => vm.runInContext(SRC, ctx));
});

test('background tab: no scramble, the real heading stays in place', () => {
  const page = load({ visibility: 'hidden' });
  assert.equal(page.frames.length, 0);
  assert.equal(page.heading.textContent, HEADING);
  assert.equal(page.heading.getAttribute('aria-label'), null);
});

// Regression: steps are only hidden (via .reveal-ready) once the script has
// proven it can reveal them. A browser without IntersectionObserver must keep
// them visible instead of throwing and leaving them at opacity 0.
test('fallback without IntersectionObserver: no crash, steps stay visible', () => {
  const page = load({ scrollTimeline: false, observer: false });
  assert.equal(page.html.classList.contains('reveal-ready'), false);
});

// Generated by /ship test coverage audit.
// Value: protects=the heading settles left to right: the real-text prefix grows frame by frame instead of snapping in at the end;
// fails_when=the settled-index math breaks (stuck at 0, reversed, or all-at-once); why_new=existing tests check spaces and the final
// text only; seam=none; no_claim=visual pacing in a real browser (fake clock, 100ms frames)
test('scramble settles characters left to right, a growing prefix each frame', () => {
  const page = load();
  const prefixLen = (s) => { let n = 0; while (n < s.length && s[n] === HEADING[n]) n++; return n; };
  const prefixes = page.runFrames().map(prefixLen);
  for (let i = 1; i < prefixes.length; i++) assert.ok(prefixes[i] >= prefixes[i - 1]);
  assert.ok(prefixes.some((n) => n > 0 && n < HEADING.length), 'some frame is partly settled');
  assert.equal(prefixes.at(-1), HEADING.length);
});

// Generated by /ship test coverage audit.
// Value: protects=a heading with emoji or other astral characters never shows a broken half-character mid-animation;
// fails_when=Array.from(text) becomes text.split('') or index-based slicing; why_new=all other tests use an ASCII heading;
// seam=none; no_claim=font rendering of the emoji (string-level check only)
test('scramble never splits an emoji into broken halves', () => {
  const text = 'Hack 🔒 the 🚩 planet';
  const page = load({ text });
  const frames = [page.shownText(), ...page.runFrames()];
  for (const f of frames) {
    assert.ok(f.isWellFormed(), `lone surrogate in frame: ${JSON.stringify(f)}`);
    assert.equal(Array.from(f).length, Array.from(text).length);
  }
  assert.equal(page.heading.textContent, text);
});

// Generated by /ship test coverage audit.
// Value: protects=when the observer reports several steps in one batch (as on first observe), every visible one is revealed;
// fails_when=the callback only handles entries[0] or stops after the first match; why_new=existing tests pass one entry per
// callback; seam=none; no_claim=real IntersectionObserver timing/thresholds (fake observer)
test('fallback browsers: one observer batch reveals every intersecting step', () => {
  const page = load({ scrollTimeline: false });
  const [a, b, c] = page.steps;
  page.observed[0].io.cb([
    { isIntersecting: true, target: a },
    { isIntersecting: false, target: b },
    { isIntersecting: true, target: c },
  ]);
  assert.equal(a.classList.contains('visible'), true);
  assert.equal(b.classList.contains('visible'), false);
  assert.equal(c.classList.contains('visible'), true);
  assert.deepEqual(page.unobserved, [a, c]);
});

// Generated by /ship test coverage audit.
// Value: protects=the <head> script turns motion on (.js-motion) only when the visitor has not asked for reduced motion;
// fails_when=the matchMedia check is inverted, removed, or queries the wrong feature; why_new=effects.js tests stub .js-motion
// directly; seam=none; no_claim=browser parsing order and real matchMedia (script text run in node:vm)
test('head script: .js-motion is added only when reduced motion is not requested', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  const inline = [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(inline.length, 1, 'one inline script in <head>');
  for (const reduce of [false, true]) {
    const queries = [];
    const root = fakeElement();
    vm.runInNewContext(inline[0], {
      window: { matchMedia: (q) => { queries.push(q); return { matches: reduce && q === '(prefers-reduced-motion: reduce)' }; } },
      document: { documentElement: root },
    });
    assert.deepEqual(queries, ['(prefers-reduced-motion: reduce)']);
    assert.equal(root.classList.contains('js-motion'), !reduce);
  }
});

// Generated by /ship test coverage audit.
// Value: protects=effects.js runs after the page is parsed, so it finds the heading and steps; else .reveal-ready hides steps
// nothing observes; fails_when=defer is dropped while the tag stays in <head>; why_new=vm tests hand the script a finished DOM;
// seam=none; no_claim=actual browser execution order (static HTML check)
test('index.html loads effects.js after the page is parsed', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const tag = html.match(/<script[^>]*\bsrc="js\/effects\.js"[^>]*>/);
  assert.ok(tag, 'effects.js is loaded');
  const deferred = /\bdefer\b|\btype="module"/.test(tag[0]);
  const afterContent = tag.index > html.lastIndexOf('class="step reveal"');
  assert.ok(deferred || afterContent, `effects.js may run before the DOM exists: ${tag[0]}`);
});
