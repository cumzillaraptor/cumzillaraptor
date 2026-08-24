# Plan: subdomain routing + page robustness fixes

**Prepared:** 2026-08-24 · Status: awaiting approval · Nothing executes until you say go.

## Diagnosis (verified in code, not guessed)

Both dead buttons share one root cause: **all page logic (menu wiring, wallet connect, mint/claim) lives inside a single `<script type="module">` whose first lines import `@solana/web3.js` from esm.sh.** If that CDN import fails or stalls — which happens inside Solflare's mobile dapp browser and behind some shields/proxies — the whole module dies silently. Result: hamburger does nothing, Connect does nothing. Same failure class as the rehearsal dapp's Buffer crash.

Secondary factor: the menu button works on the homepage (its script is inline, no remote imports) but not on subpages — consistent with the CDN-import theory, not with a CSS/z-index issue.

## Change 1 — subdomain routing (mint.cumzillaraptor.com / claim.cumzillaraptor.com)

Cloudflare Workers static assets serve one worker per zone. Options:

- **1a. Worker routes (chosen):** add `routes` entries in `wrangler.toml` binding `mint.cumzillaraptor.com/*` → the worker, with the asset manifest serving `/mint/index.html` at `/` on that host. Requires DNS records for both subdomains (proxied CNAME to the worker / apex). Pages keep working at `/mint/` and `/claim/` too (no redirect loops; canonical tags point at subdomains).
- **1b. Separate workers per subdomain** — more moving parts, two deploy targets; rejected for now.
- **1c. Redirect-only** — subdomains 301 to paths; rejected since you explicitly want the subdomains as the real homes.

Tasks:
1. DNS: create proxied `mint` + `claim` records (needs your Cloudflare dashboard access or an API token with DNS edit — I'll prepare exact records; if a token exists as a secret we can script it).
2. `wrangler.toml`: add routes for both subdomains.
3. `deploy-site.yml`: unchanged bundle (already ships `/mint/index.html`, `/claim/index.html`); add `<link rel="canonical">` per page pointing at its subdomain.
4. Update `config/site.js` `pages` map and any absolute links (`/mint/` → `https://mint.cumzillaraptor.com/`) in homepage buttons/menu.
5. Verify: both subdomains serve the pages, `/mint/` still works, no redirect loop, canonical correct.

## Change 2 — make pages immune to CDN failure (the actual bug)

Restructure both pages so **UI chrome never depends on remote code**:

1. **Extract menu + status chrome into a tiny inline script** (no imports) that runs immediately: hamburger open/close, scrim, Escape, focus handling. Menu works even if web3 never loads.
2. **Lazy-load web3 only when needed**: the module script becomes a *controller* that `import()`s `@solana/web3.js` on first user action (Connect / Roll / Check), with a loading state on the button. If the import fails → clear error message, menu and page chrome still fully functional.
3. **Vendor a local fallback**: bundle `@solana/web3.js` IIFE build into the repo (`assets/vendor/solana-web3.js`) and try local first, CDN second. Removes the CDN from the critical path entirely for the common case. (IIFE build is ~200KB gz ~60KB — acceptable, cached by CF.)
4. **Wallet connector**: already isolated in `wallet.js`; it will import web3 the same lazy way.
5. **Status bar**: homepage + subpage status reads move into the lazy controller but degrade gracefully (already do).

Tasks:
1. Vendor web3 IIFE into `assets/vendor/`, wire deploy bundle to copy it.
2. Rewrite mint page: inline chrome script + lazy controller.
3. Rewrite claim page: same structure.
4. Local smoke test: block esm.sh (hosts-file trick) → menu still works, Connect shows actionable error; unblock → full flow.
5. Deploy + verify live.

## Change 3 — verification pass

- Browser-render mint + claim with scripts disabled → nav visible, no JS errors.
- Render with esm.sh blocked → menu opens/closes, Connect shows error, page usable.
- Normal render → connect (Solflare mobile is your test device), roll, claim eligibility check.
- Subdomains live + canonical + old paths still resolve.

## Order of execution

1. **Change 2 first** (robustness) — it's the actual bug; do it before pointing subdomains at possibly-broken pages.
2. **Change 1** (subdomains) — DNS needs your action or a token; code side is ready in parallel.
3. **Change 3** after both.

## What I need from you

- **DNS**: either add two proxied CNAME/A records yourself (`mint`, `claim` → same target as apex), or confirm a Cloudflare API token with DNS:Edit exists in GH secrets I should use.
- **Approve** the plan (or amend).

Estimated: Change 2 ≈ one work session; Change 1 code ≈ minutes + DNS propagation.
