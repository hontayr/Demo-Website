# TODOS

## Launch

### Replace the placeholder name and Discord links

**What:** Swap the stand-in name "CyberStart" for the community's real name, and point every "Join the Discord" link at a real, non-expiring invite.

**Why:** Getting people into the Discord is the whole point of the site. Right now every Join button points to `#` and goes nowhere.

**Context:** Every placeholder is marked in the code. Search for `TODO(name)` (2 spots in `index.html`: the page title and the header wordmark) and `TODO(discord)` (4 links in `index.html`, plus more on later pages). Create the invite in Discord under Invite People → Edit invite link → Expire after: Never. Do this before sending the link to friends.

**Effort:** S
**Priority:** P1
**Depends on:** Choosing the name and creating the invite (only you can do this)

## Homepage polish

### Tell the browser the page is dark-themed

**What:** Add `color-scheme: dark;` to `:root` in `css/styles.css` (and `color-scheme: light;` inside the `@media print` block), plus optionally `scrollbar-color: var(--line) var(--bg);` on `html`.

**Why:** Chrome and Edge on Windows draw a bright light-gray scrollbar next to the dark page because nothing says the page is dark.

**Context:** Found in the pre-ship review of the homepage and deferred so it could go live. Two or three lines of CSS; check the scrollbar on Windows after.

**Effort:** S
**Priority:** P2
**Depends on:** None

### Give buttons an outline in Windows High Contrast mode

**What:** Add `border: 1px solid transparent;` to `.btn` in `css/styles.css` (High Contrast mode shows transparent borders).

**Why:** High Contrast mode removes background colors, so the "Join the Discord" buttons lose their button shape and look like plain text. They still work as links.

**Context:** Found in the pre-ship review. Check with Windows Settings → Accessibility → Contrast themes, or Chrome DevTools → Rendering → "Emulate CSS forced-colors: active".

**Effort:** S
**Priority:** P2
**Depends on:** None

### Keep the page from going blank when Google Fonts hangs

**What:** Load the Google Fonts stylesheet in `index.html` without blocking the page (`media="print" onload="this.media='all'"` plus a `<noscript>` copy of the link), or self-host the two font families with `@font-face` in `css/styles.css`.

**Why:** The page waits for `fonts.googleapis.com` before it shows anything, and `effects.js` waits behind it. On a network that silently drops requests to Google (some school or work firewalls), visitors see a blank page until the request times out. `display=swap` only covers the font files, not this stylesheet.

**Context:** Found by the Red Team in the pre-ship review and deferred: the non-blocking version makes every visitor see the text switch fonts a moment after load. Self-hosting avoids both problems. Re-check the font-weight test in `tests/effects.test.mjs`, which reads the font link.

**Effort:** S
**Priority:** P2
**Depends on:** None

## Tests

### Close four gaps in the stylesheet tests

**What:** Fix four edge cases in `tests/effects.test.mjs` found in the third pre-ship review pass:
1. The `font:` shorthand weight check reads `font: normal 600 …` as weight 400. Match a number, `bold`, `bolder` or `lighter` first, and fall back to `normal` only when none is present.
2. "Every CSS custom property … is defined" also counts tokens defined only in `@media print`. Collect definitions from the top-level `:root` rule (or strip the print block first).
3. `monoSelectors` and `isMono` only recognize `font-family: var(--font-mono)`. Use one "sets the mono font" check that also matches `font: … var(--font-mono)`.
4. The value card on the reveal-scoping test still names only `opacity: 0`; mention `visibility: hidden` and the per-selector check.

**Why:** With today's CSS none of these trigger, but each lets a real future mistake slip past the tests. Item 1 is the same bug as the Space Grotesk 600 font-weight fix, written a different way.

**Context:** Deferred so the homepage could ship: fixing them would have been a third review-fix cycle. Prove each fix with a mutation in a throwaway copy (for example `font: normal 600 1rem var(--font-sans)` with 600 dropped from the font link should fail the test).

**Effort:** S
**Priority:** P2
**Depends on:** None

## Completed

### Make the "loads after the page is parsed" test unable to pass by accident

**What:** In `tests/effects.test.mjs`, assert the step-markup anchor exists before comparing positions (`assert.ok(last !== -1, 'step markup anchor missing')`), or find it with a looser regex for any `reveal` class.

**Why:** If the steps' `class="step reveal"` markup changes, the search returns -1 and the test passes even when `defer` is removed from the effects.js tag, which is the bug it exists to catch.

**Context:** Found in the pre-ship review of the test suite. One-line change; prove it by temporarily removing `defer` and seeing the test fail.

**Effort:** S
**Priority:** P2
**Depends on:** None
**Completed:** feat/homepage (2026-10-18). The test now asserts a `.reveal` anchor exists and finds it with a looser regex; removing `defer` fails it.
