# Mainnet Go-Live Plan — cumzillaraptor mint

**Goal:** Take the 420-raptor MPL-Core mint from working devnet beta to mainnet-beta with real SOL, gated by explicit human approval at each phase.

**Architecture:** Same program (Anchor, secp-in-program claims), same site, parameterized by `network`. Deploy via existing x86_64 GitHub Actions pipeline (no ARM local builds), then run launch setup + sale-enable against mainnet RPC, then flip site config.

**Status: PLAN ONLY.** Nothing here executes without an explicit "go" from the owner per phase. This document authorizes nothing.

---

## Hard Constraints (from project history)

- **No send mode in repo scripts.** `execute-devnet-deployment.mjs` refuses `--send`; program deploys go through the separately audited root-owned runtime or CI after explicit authorization. Mainnet follows the same rule.
- **Keys never enter chat or git.** Authority/payer/upgrade-authority keypairs stay in local files; scripts take paths, print pubkeys/signatures only.
- **Helius key stays server-side.** Browser keeps a public RPC.
- **SaleState enum order is source of truth:** Setup=0, Paused=1, Live=2 (`state.rs`).
- **Cluster tag matters:** allocation hash includes `'devnet'` today — a mainnet setup must build its own hash with `'mainnet'` or the registry will not validate. This is the single biggest code change.

---

## Phase 0 — Decisions needed from owner (no tooling)

| # | Decision | Options | Default suggestion |
|---|----------|---------|--------------------|
| D1 | Treasury wallet on mainnet | reuse `FiHKQhwq...` keypair's mainnet twin / new wallet | New dedicated wallet; fund from mobile |
| D2 | Launch authority on mainnet | reuse `71WBrLf...` / new keypair | New mainnet-only keypair |
| D3 | Price | keep 1 SOL / change | Confirm before any setup tx |
| D4 | Program ID | fresh keypair → fresh program ID | Fresh (cleanest; devnet ID stays test-only) |
| D5 | Upgrade authority | owner-held cold key / same as payer | Cold key, distinct from payer |

Output of Phase 0: a filled worksheet committed as `docs/operations/mainnet-decisions-v1.md`.

## Phase 1 — Parameterize the codebase for cluster

1. **Program source:** grep all `'devnet'` literals in `programs/cumzillaraptors/src/` — the cluster tag feeds the allocation hash and claim message builder. Introduce a `CLUSTER` const set at deploy time (or instruction arg already present — verify which).
2. **Tests:** add/extend Bankrun tests asserting mainnet-tag hashes differ from devnet-tag hashes and that a devnet-signed claim fails on a mainnet-initialized registry (cross-cluster rejection).
3. **Scripts:** copy `execute-devnet-launch-setup.mjs` / `execute-devnet-enable-sale.mjs` to `-mainnet` variants: swap RPC, cluster tag `'mainnet'`, treasury/authority consts from Phase 0, and add balance preflight (refuse if authority < ~1 SOL).
4. **Site config:** add `dist/config/site.mainnet.js` (network `mainnet-beta`, public RPC `https://api.mainnet-beta.solana.com`, placeholder collection until setup runs). Build script picks config by env var; default stays devnet until flip day.
5. Verify: `npm test` green; `node --check` on every changed script; commit.

Gate G1: tests + review pass, diff reviewed line-by-line for no accidental devnet behavior change.

## Phase 2 — Build & deploy the program (CI)

1. Merge to `main` → confirm x86_64 Actions build produces `.so` + artifact SHA256.
2. Fund: owner sends ~3–5 SOL to a designated payer wallet (mobile → payer pubkey printed by script, never pasted from chat).
3. Deploy via the authorized path only (existing audited runtime / CI workflow with secrets), using the **fresh program keypair** (D4) and upgrade authority (D5).
4. Verify on-chain: `solana program show <ID> --url mainnet-beta` (or RPC equivalent) — owner confirms address + authority match D4/D5.

Gate G2: program address live on explorer, authority correct, artifact hash matches CI output.

## Phase 3 — Launch setup on mainnet (one-way door)

Run in order, each verified before the next:

1. `initialize_launch` — sets config PDA (treasury, price, roots, cluster tag `mainnet`, new collection pubkey from D-phase).
2. `initialize_allocation_registry` — 246 public + 174 claim ids, exact cover of 1..420.
3. `setup_collection` — creates the MPL Core collection on mainnet.
4. Re-derive and record: collection pubkey, config data length must equal computed size exactly; decode every field and compare against the manifest before proceeding.

Gate G3: decoded config matches manifest byte-for-byte; collection visible in explorer. **After this phase the pool contents are fixed — changing anything means a new program deployment.**

## Phase 4 — Site cutover (reversible)

1. Fill `collection` in `site.mainnet.js` from Phase 3 output; regenerate slim metadata URIs are cluster-independent (verify one asset URI resolves on mainnet gateway).
2. Staging check: serve mainnet config locally, connect Phantom (set to **Mainnet** this time), simulate a roll — simulation only, do not sign-send.
3. DNS/pages: point `mint.cumzillaraptor.com` at mainnet config (Cloudflare Pages env/config switch). Keep devnet reachable at a `/devnet` path or subdomain for regression testing.
4. Smoke checklist on staging URL: connect ✅ roll sim ✅ error messages ✅ status bar shows mainnet counts ✅.

Gate G4: owner approves cutover; old config retained for instant rollback.

## Phase 5 — Enable sale & first real mint

1. Owner funds buyer wallet (their own mobile wallet) with exactly ~1.05 SOL.
2. Run `execute-mainnet-enable-sale.mjs` (Setup→Live) — verify post-state byte 264 = 2.
3. Owner performs mint #1 personally from the live page. Verify: explorer tx, asset owned by owner, treasury received exactly 1 SOL, registry bitmap updated, progress bar 1/420.
4. Owner performs one claim-path spot check (EIP-191 sign via dapp) if any claim raptors will be claimed early.

Gate G5: first mint verified end-to-end on mainnet. Only then announce publicly.

## Phase 6 — Post-launch monitoring

- Watcher cron: poll registry account every N min; alert on unexpected bitmap jumps, saleState ≠ Live while paused expected, or treasury drift vs mint count × 1 SOL.
- Keep `set_claims_sale_state(Paused)` command ready as kill switch (authority-signed, tested once on devnet twin).

---

## Rollback story

- Before G3: abort freely; nothing permanent exists except the deployed program (harmless unused).
- After G3, before G5: sale state can be Paused; config immutable → a mistake means new program ID + re-run Phases 2–3.
- After G5: pause = stop new mints; minted assets are final.

## Cost estimate (mainnet, rough)

- Program deploy rent: ~2.5–4 SOL (buffer size dependent)
- Config/registry/collection accounts + setup fees: ~0.5–1.5 SOL
- Test mints + headroom: ~2–3 SOL
- **Total: budget ~8–10 SOL** in the payer wallet.
