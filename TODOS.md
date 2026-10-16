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

### Make the "loads after the page is parsed" test unable to pass by accident

**What:** In `tests/effects.test.mjs`, assert the step-markup anchor exists before comparing positions (`assert.ok(last !== -1, 'step markup anchor missing')`), or find it with a looser regex for any `reveal` class.

**Why:** If the steps' `class="step reveal"` markup changes, the search returns -1 and the test passes even when `defer` is removed from the effects.js tag, which is the bug it exists to catch.

**Context:** Found in the pre-ship review of the test suite. One-line change; prove it by temporarily removing `defer` and seeing the test fail.

**Effort:** S
**Priority:** P2
**Depends on:** None

## Completed
