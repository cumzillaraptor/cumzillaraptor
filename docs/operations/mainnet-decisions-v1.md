# Mainnet Decisions Worksheet — Phase 0 (filled 2026-08-25)

| # | Decision | Choice | Notes |
|---|----------|--------|-------|
| D1 | Treasury | `FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6` | Same keypair as devnet treasury — valid across clusters; owner must retain its secret key / seed |
| D2 | Launch authority | **New mainnet-only keypair** (generated at Phase 2 prep, never leaves owner's device) | Pubkey recorded here once generated; supersedes earlier same-as-treasury choice |
| D3 | Price | **1 SOL** (unchanged) | `priceLamports = 1000000000` |
| D4 | Program ID | **Fresh keypair → fresh program ID** at deploy time | Devnet ID stays test-only |
| D5 | Upgrade authority | **Cold key, distinct from payer** | Generated before Phase 2, stored offline |

## Concentration note (resolved 2026-08-25)

Earlier draft had D2 = treasury key. **Superseded:** launch authority is now a fresh mainnet-only keypair, so money-receiving (`FiHKQhwq…`) and sale-controlling roles are separated again. Remaining exposure: the new authority key must be backed up offline at generation time.

## Preconditions carried into Phase 1

- Mainnet setup/enable scripts take the NEW authority keypair path; no hardcoded reuse of `71WBrLf…` (devnet) or `FiHKQhwq…`.
- Cluster tag `'mainnet'` in allocation hash (Phase 1 task).
- Payer wallet: still to be chosen/funded (~8–10 SOL) — separate from all of the above.

**Phase 0 complete. Next: Phase 1 (cluster parameterization) — code-only, no spend.**
