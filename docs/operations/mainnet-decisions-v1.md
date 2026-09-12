# Mainnet Decisions Worksheet — Phase 0 (filled 2026-08-25)

| # | Decision | Choice | Notes |
|---|----------|--------|-------|
| D1 | Treasury | `FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6` | Same keypair as devnet treasury — valid across clusters; owner must retain its secret key / seed |
| D2 | Launch authority | **New mainnet-only keypair** (generated at Phase 2 prep, never leaves the controlled deployment environment) | Public key recorded here and compiled into the `mainnet` program feature before accepting a release artifact; supersedes earlier same-as-treasury choice |
| D3 | Price | **1 SOL** (unchanged) | `priceLamports = 1000000000` |
| D4 | Program ID | **Fresh keypair → fresh program ID** at Phase 2 prep | Devnet ID stays test-only. The fresh ID must be compiled into `declare_id!` and used to regenerate mainnet claim/metadata roots before accepting the release artifact |
| D5 | Upgrade authority | **Cold key, distinct from payer and launch authority** | Generated before Phase 2, stored offline |
| D6 | Payer wallet | `8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d` | Owner's mobile wallet key (same key as the ETH claim recipient). Fund ~8–10 SOL for deployment. Never export its key material; Phase 2 must use a wallet-compatible deploy flow or an explicitly approved alternative |

## Concentration note (resolved 2026-08-25)

Earlier draft had D2 = treasury key. **Superseded:** launch authority is now a fresh mainnet-only keypair, so money-receiving (`FiHKQhwq…`) and sale-controlling roles are separated again. Remaining exposure: the new authority key must be backed up offline at generation time.

## Preconditions carried into Phase 1

- Mainnet program source and setup/enable scripts bind the NEW authority public key; no reuse of `71WBrLf…` (devnet), `FiHKQhwq…` (treasury), or D6 (payer).
- Cluster tag `'mainnet'` binds allocation, claim, metadata, and EIP-191 domains; the compiled program requires the exact SHA-256 cluster-tag hash.
- Mainnet claim/metadata roots are regenerated only after the fresh D4 program ID exists. The Phase 1 placeholders intentionally make a mainnet launch impossible before that.
- The collection keypair/public key must exist before final manifest generation; setup consumes that exact keypair and refuses a replacement.
- Payer wallet: `8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d` (D6) — fund ~8–10 SOL before Phase 2.

**Phases 0–1 complete. Paused before Phase 2 funding and identity/artifact preparation.**
