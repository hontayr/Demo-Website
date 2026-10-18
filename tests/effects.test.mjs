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

// Extended by /ship test coverage audit: the animated span must stay hidden from screen readers.
// Value: protects=screen readers hear the aria-label, never the random glyphs; fails_when=the span loses aria-hidden="true";
// why_new=no test read the span's attributes; seam=none; no_claim=real screen-reader behavior
test('scramble hides its glyph span from screen readers, ends on the real text and removes its aria-label', () => {
  const page = load();
  assert.equal(page.heading.getAttribute('aria-label'), HEADING);
  assert.equal(page.heading.children[0].getAttribute('aria-hidden'), 'true');
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
  // Extended by /ship test coverage audit: a missing anchor (-1) used to make afterContent true by accident.
  const reveals = [...html.matchAll(/class="[^"]*\breveal\b[^"]*"/g)];
  assert.ok(reveals.length > 0, 'step markup anchor (a .reveal element) missing');
  const afterContent = tag.index > reveals.at(-1).index;
  assert.ok(deferred || afterContent, `effects.js may run before the DOM exists: ${tag[0]}`);
});

// Helpers for the stylesheet contract tests below.
const CSS_SRC = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
// Innermost rules as { selector, body }; at-rule preludes are not part of the selector.
function cssRules(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
}
// The text inside the first at-rule block whose prelude starts with `prelude`.
function atBlock(css, prelude) {
  const start = css.indexOf(prelude);
  assert.ok(start !== -1, `missing ${prelude}`);
  let i = css.indexOf('{', start) + 1;
  const open = i;
  let depth = 1;
  for (; depth && i < css.length; i++) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0;
  assert.equal(depth, 0, `unbalanced braces after ${prelude}`);
  return css.slice(open, i - 1);
}

// Generated by /ship test coverage audit.
// Value: protects=without JS (or before effects.js proves it can reveal) the steps stay visible; only .reveal-ready hides them
// and only .js-motion starts the scroll animation; fails_when=a hiding rule (opacity: 0) or the reveal-in animation is applied
// to .reveal without that scope; why_new=effects.js tests only check which classes JS adds, not what CSS does without them;
// seam=none; no_claim=actual rendering or cascade in a browser (static stylesheet check)
test('styles.css hides or animates steps only under .reveal-ready / .js-motion', () => {
  const rules = cssRules(CSS_SRC).filter((r) => !/^(from|to|\d+%)$/.test(r.selector));
  // Every selector in a list is checked: ".reveal-ready .reveal, .reveal" must fail.
  const eachSelector = (r) => r.selector.split(',').map((s) => s.trim());
  const hiding = rules.filter((r) => /opacity:\s*0(\.0+)?\s*(!important\s*)?(;|$)|visibility:\s*hidden/m.test(r.body));
  assert.ok(hiding.length > 0, 'expected the fallback hiding rule');
  for (const r of hiding) {
    for (const s of eachSelector(r)) assert.match(s, /^\.reveal-ready\s/, `unscoped hide: ${s}`);
  }
  // Extended by /ship review: once JS adds .visible, the fallback CSS must show the step again.
  const shown = rules.find((r) => /\.reveal-ready\b/.test(r.selector) && /\.reveal\.visible\b/.test(r.selector));
  assert.ok(shown, 'no .reveal-ready .reveal.visible rule: revealed steps would stay hidden');
  assert.match(shown.body, /opacity:\s*1\s*(;|$)/m);
  assert.match(shown.body, /transform:\s*none/);
  const animating = rules.filter((r) => /animation(-name)?:[^;]*\breveal-in\b/.test(r.body));
  assert.ok(animating.length > 0, 'expected the scroll-driven reveal rule');
  for (const r of animating) {
    for (const s of eachSelector(r)) assert.match(s, /^\.js-motion\s/, `unscoped animation: ${s}`);
  }
});

// Value: protects=every var(--token) the stylesheet uses is defined, so no padding, gap or offset silently drops to 0;
// fails_when=a token is renamed or removed while a rule still uses it; why_new=no test read the token list; seam=none;
// no_claim=whether the defined values look right
test('every CSS custom property styles.css uses is defined', () => {
  const defined = new Set([...CSS_SRC.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const used = [...CSS_SRC.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((m) => m[1]);   // var(--x, fallback) is safe, so skipped
  assert.ok(used.length > 0, 'expected var() references');
  for (const name of used) assert.ok(defined.has(name), `${name} is used but never defined`);
});

// Generated by /ship test coverage audit.
// Value: protects=printing shows every step, and reduced-motion visitors get every step shown with no animation, even if a
// hiding or animating class was applied; fails_when=the .reveal override (or its !important) is removed from @media print or
// @media (prefers-reduced-motion: reduce); why_new=no test read these media blocks; seam=none; no_claim=real print output or OS
// motion settings (static stylesheet check)
test('print and reduced motion force every step visible', () => {
  for (const prelude of ['@media print', '@media (prefers-reduced-motion: reduce)']) {
    const rules = cssRules(atBlock(CSS_SRC, prelude));
    const reveal = rules.find((r) => r.selector === '.reveal');
    assert.ok(reveal, `${prelude}: no .reveal override`);
    assert.match(reveal.body, /opacity:\s*1\s*!important/, `${prelude}: opacity`);
    assert.match(reveal.body, /transform:\s*none\s*!important/, `${prelude}: transform`);
    const killsAnimation = rules.some((r) => (r.selector === '.reveal' || /^\*/.test(r.selector))
      && /animation:\s*none\s*!important/.test(r.body));
    assert.ok(killsAnimation, `${prelude}: animation not disabled`);
  }
});

// Regression (fixed in 0f6a9e8): buttons asked for Space Grotesk 600, which the font link never loaded, so they rendered as
// faux/fallback bold. Generated by /ship test coverage audit.
// Value: protects=every font-weight the stylesheet uses is downloaded for that rule's font family; fails_when=a weight is added
// or changed in styles.css (or dropped from the Google Fonts URL) without the other; why_new=no test read the font link;
// seam=none; no_claim=Google Fonts availability or how a browser synthesizes missing weights
test('the Google Fonts link loads every font weight styles.css uses', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const link = html.match(/href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/);
  assert.ok(link, 'Google Fonts link missing: update this test if the fonts are now self-hosted');
  const href = link[1].replace(/&amp;/g, '&');
  const loaded = {};
  for (const [, fam, list] of href.matchAll(/family=([^:&]+):wght@([\d;]+)/g)) {
    loaded[fam.replace(/\+/g, ' ')] = new Set(list.split(';').map(Number));
  }
  // A rule is mono if it sets the mono font itself, or sits inside a rule that does
  // (".terminal-hint .prompt" inherits from ".terminal-hint").
  const rules = cssRules(CSS_SRC);
  const monoSelectors = rules.filter((r) => /font-family:\s*var\(--font-mono\)/.test(r.body))
    .flatMap((r) => r.selector.split(',').map((s) => s.trim()));
  const isMono = (r) => /font-family:\s*var\(--font-mono\)/.test(r.body)
    || r.selector.split(',').some((s) => monoSelectors.some((m) => s.trim().startsWith(m + ' ')));
  const WEIGHTS = { normal: 400, bold: 700 };
  // Body text, the mono default, and the browser's default bold for h2/h3.
  const used = [['Space Grotesk', 400], ['JetBrains Mono', 400], ['Space Grotesk', 700]];
  for (const r of rules) {
    const weight = r.body.match(/font-weight:\s*([\w-]+)/);
    // The font: shorthand may also set a weight ("font: 600 1rem var(--font-mono)"); no weight there means 400.
    const shorthand = r.body.match(/(?:^|[;\s])font:\s*([^;]+)/);
    let w = weight && weight[1];
    if (!w && shorthand) w = (shorthand[1].match(/\b([1-9]00|bold|normal|bolder|lighter)\b/) || [, 'normal'])[1];
    if (!w) continue;
    const n = Number(WEIGHTS[w] ?? w);
    assert.ok(Number.isInteger(n), `${r.selector}: font weight "${w}" is relative or unknown; use a number`);
    const mono = isMono(r) || (shorthand && /var\(--font-mono\)/.test(shorthand[1]));
    used.push([mono ? 'JetBrains Mono' : 'Space Grotesk', n]);
  }
  assert.ok(used.length > 2, 'expected font-weight declarations');
  for (const [fam, w] of used) {
    assert.ok(loaded[fam], `font link does not load ${fam}`);
    assert.ok(loaded[fam].has(w), `${fam} ${w} is used in styles.css but not loaded`);
  }
});
