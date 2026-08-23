# Current x86 mint+claim Core-CPI gate evidence

**Prepared:** 2026-08-23

**Status:** Build-and-test evidence only. This document authorizes no deployment, signing, Devnet RPC request, funding, collection setup, mint, claim, upload, or authority action.

## Bound workflow evidence

| Field | Value |
|---|---|
| Repository | `cumzillaraptor/cumzillaraptor` |
| Source revision | `f4a1f55e0d056c7808507d5fbf2b01c9a63c3664` |
| Workflow | [Build Solana Program #32668024187](https://github.com/cumzillaraptor/cumzillaraptor/actions/runs/32668024187) |
| Workflow conclusion | `success` |
| Workflow ref | `main` (workflow_dispatch) |
| Program ID bound | `AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY` |
| mpl-core pinned | `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d` @ 0.12.0 (SHA `afbbe94e…`) |

## Completed x86 gates

The successful x86 job completed these gates:

1. SBPF build using platform tools v1.54 (`--arch sbfv2`).
2. Production binary verification and exact source-revision marker creation.
3. Isolated private-localhost test-validation SBPF build (`--features test-validation`).
4. Task 5 Bankrun initialization gate (`# pass 2, # fail 0`).
5. Task 7 Bankrun collection-creation gate (`# pass 3, # fail 0`).
6. Mandatory x86 atomic Core-CPI claim gate (`# pass 4, # fail 0`), including:
   - `ok 1` private validator loaded the hash-pinned Core and fresh test-validation program.
   - `ok 2` gate is localhost-only and uses only the separately named test-validation artifact.
   - `ok 3` authentic secp claim + **paid public mint** through the real Core CreateV1 CPI with an ephemeral local claim root and the immutable production metadata root.
   - `ok 4` gate wired loopback-only, no Devnet RPC.

## What the atomic gate exercised (mint)

From `tests/local-ephemeral-claim-root.test.mjs` against a real private `solana-test-validator`:

- **Treasury substitution rollback**: `mint_nft` with `treasuryAccount = authority` is rejected with **no** state effect (no payment, no Core CPI, no allocation, no counter bump).
- **Paid public mint**: exactly 1 SOL (`PUBLIC_MINT_PRICE_LAMPORTS`) lands in the immutable treasury; buyer pays 1 SOL + tx/Core rent.
- **Post-Core atomicity**: `public_minted` increments to 1, public ID #1 is allocated, and the deterministic `[asset, 0x0001]` PDA is created **Core-owned** only after CreateV1 succeeds.
- **Decoded asset**: owner = buyer; update authority derives from the collection (type `Collection`).
- **Collection**: Core-owned, update authority = config PDA.

## What the atomic gate exercised (claim)

- Wrong-secp-signer, non-adjacent secp instruction, recipient substitution, expired authorization, invalid claim proof, invalid immutable metadata proof, public-pool ID, pre-existing receipt, and failed real Core CPI all rejected **without durable state change**.
- Success path: secp precompile (instruction 0) → `claim_nft` (instruction 1), v0 transaction via validator-created ALT, serialized ≤ 1232 bytes.
- Receipt created only after Core CreateV1 succeeds; ClaimReceipt layout verified (discriminator, claimer, ETH address, nft_id, bump).
- Dusted asset PDA recovered to claimer; lamport accounting exact.
- `claims_minted` increments to 1 and #360 allocation bit set only after the authentic claim path succeeds.
- Already-allocated replay rejected without mutation.

## Local (ARM) pure-gate status

On the RPi5, the ARM-safe mint/claim pure tests all pass: `public-mint-flow-shape`, `claim-flow-shape`, `claim-message`, `claim-nft-v1-fixture`, `allocation-360-policy`, `allocation-registry`, `metadata-merkle`, `metadata-root-binding`, `core-cpi-shape`, `core-collection`, `collection-uri-canonical`, `launch-root-v1` — **40/40 pass, 0 fail** (`node --test`).

## Boundary

This evidence confirms the current **mint and claim paths** at the bound source revision on a private localhost validator. It does **not** establish live Devnet state. The collection was previously set up on Devnet via the launch-setup workflow; a live Devnet mint/claim rehearsal remains a separate, explicitly approved step.

## Non-actions

No Devnet RPC request, deployment, transaction construction, signing, funding, collection creation, mint, claim, metadata upload, or authority change was performed while producing this evidence.
