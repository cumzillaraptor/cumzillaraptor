# Current x86 claim validation evidence

**Prepared:** 2026-08-17

**Status:** Build-and-test evidence only. This document authorizes no deployment, signing, Devnet RPC request, funding, collection setup, mint, claim, upload, or authority action.

## Bound workflow evidence

| Field | Value |
|---|---|
| Repository | `cumzillaraptor/cumzillaraptor` |
| Source revision | `0fc4c8b16dc833815c39b9573b8a8fde1daf005e` |
| Workflow | [Build Solana Program #31999404436](https://github.com/cumzillaraptor/cumzillaraptor/actions/runs/31999404436) |
| Workflow conclusion | `success` |
| Production artifact | `cumzillaraptors-devnet-sbpf` |
| Production SBPF SHA-256 | `2c88fe80ff4488e4034fdf2a724822a8413d0242b09176ed1710648eb110aa22` |
| Production revision marker | `0fc4c8b16dc833815c39b9573b8a8fde1daf005e` |
| Test-validation artifact | `test-validation-sbpf-artifact-and-revision` |
| Test-validation SBPF SHA-256 | `6a845f27ea63f8f9e41abea516f1824b815560493ee6143450a01088a8097a07` |
| Test-validation revision marker | `0fc4c8b16dc833815c39b9573b8a8fde1daf005e` |

The two downloaded revision markers were independently checked against the workflow `headSha` and this source revision. Both matched exactly.

## Completed x86 gates

The successful x86 job completed these gates:

1. SBPF build using platform tools v1.54.
2. Production binary verification and exact source-revision marker creation.
3. Isolated private-localhost test-validation SBPF build.
4. Task 5 Bankrun initialization gate.
5. Task 7 Bankrun collection-creation gate.
6. Mandatory x86 atomic Core-CPI claim gate.

## Boundary and remaining blocker

This evidence confirms the current **claim path** at the bound source revision. It does not establish live Devnet state and does not prove a public mint path.

The current on-chain program still has no public `mint_nft` instruction. Public devnet beta remains blocked until that scoped instruction and its x86 validation gate are implemented and pass.

## Non-actions

No Devnet RPC request, deployment, transaction construction, signing, funding, collection creation, mint, claim, metadata upload, or authority change was performed while producing this evidence.
