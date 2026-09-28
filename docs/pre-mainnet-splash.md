# Pre-mainnet splash gate ("💦ing Soon")

Mint (`mint.cumzillaraptor.com`) and claim (`claim.cumzillaraptor.com`) currently serve a
temporary landing page whose only visible copy is **💦ing Soon**, and the homepage mint
button shows that same label. The full dapp design was NOT deleted — it ships inside the
same `index.html` files, hidden, and is one flag away from being live again.

## Current state

Home (`index.html`)

- Mint CTA: `<span id="mint-status">💦ing Soon</span>` inside `#btn-mint-now`, which still
  links to `https://mint.cumzillaraptor.com/`. The `.btn-mint-now` rule no longer applies
  `text-transform: uppercase`, so the label renders exactly as written.
- The launch countdown script (`LAUNCH_AT`, `updateMintCountdown`, the 250ms interval) has
  been removed; there is no timer anywhere on the page. Recover it from git history
  (`git log -p -- index.html`) if a dated CTA is ever wanted again.
- Hamburger menu: `Home · $CUM 💦 · Mint 🦖 · Claim`.

Mint + claim pages

- Visible copy: a single `<h1 class="launch-soon" id="launch-title">💦ing Soon</h1>` inside
  `<section class="launch-gate" id="launch-gate">`. No eyebrow, no headline, no snapshot note.
- `<main id="real-page" hidden inert>` still holds the **entire real mint/claim dapp**,
  unchanged.
- Gate script: `var LAUNCH_READY = false;` + `window.LAUNCH_READY = LAUNCH_READY;` and **no
  timer**. A `var` inside the gate IIFE is not global, so that `window.` assignment is what
  the rest of the page reads.
- The dapp boot block at the end of each page is wrapped in `if (window.LAUNCH_READY) { ... }`,
  so a gated page makes **no RPC calls at all**. If the flag is ever missing/undefined the
  behaviour is the same: fail-closed, no boot.

## To restore the live pages (at mainnet-ready)

1. In `cumzillaraptors/mint/index.html` and `cumzillaraptors/claim/index.html`, change
   `var LAUNCH_READY = false;` to `var LAUNCH_READY = true;`.
2. Return the homepage CTA to its launch copy (e.g. `MINT NOW`) and update its `aria-label`.
3. Update `tests/launch-countdown.test.mjs`, which pins the splash contract, and re-add the
   removed eyebrow/headline markup above the gate if the launch splash should look like the
   earlier version (git history has it verbatim).
4. Splash CSS (`.launch-gate`, `.launch-card`, `.launch-soon`) can stay; it is hidden once
   the gate opens.

Test coverage: `tests/launch-countdown.test.mjs` runs both states in JSDOM — flag `false`
keeps `#real-page` hidden + `inert` with no timer; flag `true` reveals it. The jsdom page
harnesses (`tests/fixtures/*-page-harness.mjs`) strip inline scripts, so they stub
`window.LAUNCH_READY = true` to exercise the post-launch page.

## Hamburger menu items parked until launch

Removed from **all three pages** (home, mint, claim). Restore these exact lines at the end of
the `<ul class="menu-list">` list (reverting the removal commit also works):

```html
      <li><span class="menu-link disabled" aria-disabled="true">cumzillaraptor live (18+) ▶️</span></li>
      <li><span class="menu-link disabled" aria-disabled="true">auction ⚡</span></li>
      <li><span class="menu-link disabled" aria-disabled="true">merch ☕️</span></li>
```

## Previewing without deploying

Push = deploy (Cloudflare builds from `main`). Preview locally instead: `npm run build:site`,
serve `dist/` on a local port, and front it with a `cloudflared` quick tunnel — see the
`static-site-edit-deploy-loop` skill for the exact commands.