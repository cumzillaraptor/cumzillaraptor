# Mainnet Decisions Worksheet — Phase 0 (filled 2026-08-25)

| # | Decision | Choice | Notes |
|---|----------|--------|-------|
| D1 | Treasury | `FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6` | Same keypair as devnet treasury — valid across clusters; owner must retain its secret key / seed |
| D2 | Launch authority | `FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6` | **Same key as treasury** — see concentration note below |
| D3 | Price | **1 SOL** (unchanged) | `priceLamports = 1000000000` |
| D4 | Program ID | **Fresh keypair → fresh program ID** at deploy time | Devnet ID stays test-only |
| D5 | Upgrade authority | **Cold key, distinct from payer** | Generated before Phase 2, stored offline |

## Consequence note (D1=D2)

One key (`FiHKQhwq…`) will simultaneously:
- receive every mint payment + royalties, and
- be able to sign launch setup, flip sale state Live/Paused.

Acceptable for launch; documented deliberately. If either role is ever compromised, the other is exposed. A future split (new authority via program redeploy) is possible but costs another deployment.

## Preconditions carried into Phase 1

- Scripts' `EXPECTED_AUTHORITY` const must become `FiHKQhwq…` for mainnet variants.
- Cluster tag `'mainnet'` in allocation hash (Phase 1 task).
- Payer wallet: still to be chosen/funded (~8–10 SOL) — separate from all of the above.

**Phase 0 complete. Next: Phase 1 (cluster parameterization) — code-only, no spend.**
