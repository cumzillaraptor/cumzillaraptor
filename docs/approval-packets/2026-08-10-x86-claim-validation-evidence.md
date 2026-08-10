# x86 Atomic Claim Validation Evidence

**Prepared:** 2026-08-10
**Status:** Evidence only — **no authorization now**.

## Bound CI evidence

| Field | Recorded value |
|---|---|
| Repository | `cumzillaraptor/cumzillaraptor` |
| Source revision | `7300a13f742b62ccdf52c4ca5097617529d010f9` |
| x86 workflow run | [Build Solana Program #31346212120](https://github.com/cumzillaraptor/cumzillaraptor/actions/runs/31346212120) |
| Release SBPF artifact | `cumzillaraptors.so` |
| Release SBPF SHA-256 | `e5cdbe1ec45093516e1dd7224985c34303c9c632d2db80d37ac1c83ed05998d0` |
| Release SBPF size | `397040` bytes |
| Isolated test-validation SBPF artifact | `cumzillaraptors.test-validation.so` |
| Test-validation SBPF SHA-256 | `cc8e1090490345486bb16c8706d2fb990326335552b4caaf8f39ee61bd24b5bc` |
| Test-validation SBPF size | `396424` bytes |

The x86 workflow recorded above passed for the bound source revision. The two hashes identify different artifacts: the release SBPF artifact and the isolated private-validator test-validation artifact. This packet records supplied CI evidence; it does not assert any live Devnet state.

## Behavioral assertions exercised by the x86 private-validator gate

The x86 gate used the explicitly named test-validation SBPF binary and a hash-pinned Metaplex Core program on a private loopback validator. It exercised the real secp-to-`claim_nft` path and Core `CreateV1` CPI with generated test identities and an ephemeral claim root. The CI evidence covers these assertions:

1. The test-validation revision marker matched `7300a13f742b62ccdf52c4ca5097617529d010f9`; the local validator loaded the isolated test-validation SBPF artifact, not the release artifact.
2. A valid, immediately preceding secp instruction and authentic claim completed a versioned transaction whose serialized length remained within the packet limit.
3. Core created the deterministic asset; the decoded asset owner was the claimant, its update authority was the configured collection, and the collection update authority was the config PDA.
4. The claim receipt was created after successful Core creation, at the claim-leaf-derived receipt PDA, with the expected claimant, Ethereum address, allocation ID, and bump.
5. `claims_minted` and the allocation bitmap changed only after the successful Core claim.
6. Forced Core `CreateV1` failure left asset, receipt, bitmap, and counter unchanged.
7. Wrong secp signer, non-adjacent secp instruction, recipient substitution, expired authorization, invalid claim proof, invalid immutable-metadata proof, public-pool allocation ID, pre-existing receipt, and an already allocated ID each failed without durable claim-state change.
8. A rent-exempt dusted deterministic asset PDA was recovered before Core/receipt rent was charged and did not prevent the valid claim.

### Coverage boundary

The gate does **not** establish live Devnet program, collection, config, account, payer, authority, balance, rent, fee, or transaction-message state. It also does not represent a direct transaction-level malformed non-system/nonempty asset-PDA test as covered; the isolated harness documents that limitation. Those facts must not be inferred from CI evidence.

## Explicit non-actions and material handling

Preparing and recording this evidence involved **no Devnet signing, deployment, funding, or upload**. No Devnet RPC was invoked; no unsigned transaction was created; no transaction was signed or sent; and no local keypair or other private material was accessed or recorded.

## Required next gate — fresh read-only pre-send review

This x86 evidence is necessary but not sufficient for a proposed single Devnet transaction. Immediately before any possible signature, a fresh read-only pre-send review must provide the then-current program, payer, and authority public identities; exact bound artifact; live state; estimated costs; ordered instructions; account list; and full unsigned message details. It must fail closed if any value differs from the reviewed facts.

That review is not produced by this packet, and this packet is not an approval to construct, sign, or submit anything. See the conditional packet at `docs/approval-packets/2026-08-03-post-x86-devnet-transaction-approval.md`.
