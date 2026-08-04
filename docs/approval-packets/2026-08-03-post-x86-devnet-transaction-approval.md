# Conditional Devnet Transaction Approval — Post-x86 Claim Validation

**Prepared:** 2026-08-03
**Status:** Not yet signable. This is a conditional approval packet for the *next* transaction only after every gate below has passed.

## Scope

This packet authorizes **one** future Devnet transaction only after the required x86 validation and a fresh pre-send review. It authorizes neither mainnet activity nor any blanket sequence of actions.

It does **not** authorize:

- Funding, airdrops, uploads, secret/key changes, or website release.
- Any mainnet transaction.
- A second transaction after the approved transaction completes or fails.
- Bypassing a failed gate, artifact mismatch, changed Git revision, changed account state, or changed transaction summary.

## Required code identity

| Field | Required value |
|---|---|
| Repository | `cumzillaraptor/cumzillaraptor` |
| Branch | `main` |
| Required revisions | `5e521a4` followed by `cba842d` |
| Claim-flow purpose | Atomic ETH-authorized Metaplex Core claim with post-Core receipt creation and asset-PDA dust recovery |
| Program ID | `2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2` |
| Cluster | Devnet only |

## Mandatory x86 gate — must be completed before signature

A fresh x86 SBPF/Core-capable integration run must pass for the exact approved `main` revision. It must prove:

1. SBPF compilation succeeds and the artifact revision/hash are recorded.
2. `claim_nft` succeeds with the actual Metaplex Core program loaded.
3. The created asset has the claimant as owner and config PDA as update authority.
4. The claim receipt is created only after Core success at `[b"claim", verified_claim_leaf]`.
5. The allocation bitmap and `claims_minted` update only on success.
6. A forced Core failure rolls back the asset, receipt, bitmap, and counter.
7. Wrong/non-adjacent secp, wrong recipient, expiry, wrong proof/metadata, pre-existing receipt, malformed asset, and public-pool ID fail before durable state.
8. Funded-but-empty deterministic asset PDA dust does not prevent a valid claim.

**Fail closed:** an ARM-only host result, compile-only result, skipped test, or stale x86 artifact does not satisfy this gate.

## Required fresh pre-send review

Immediately before any signature, provide a read-only review that shows:

1. Exact Git revision and x86 artifact SHA-256/revision marker.
2. Program ID, cluster, transaction purpose, all instruction program IDs, and ordered instructions.
3. Every signer public key and role; no private material.
4. Every writable account, including any receipt/asset/collection/config/registry accounts.
5. Estimated fee/rent/cost and payer public key.
6. Current Devnet account state needed for the specific transaction.
7. The full unsigned transaction summary/message details.
8. Confirmation that the program account/config/collection state matches the intended transaction and has not changed since validation.

Stop if any value differs from the reviewed approval packet or an expected precondition is absent.

## Signature authorization wording

Only after the x86 gate and fresh review pass, the user may issue this exact, one-time approval:

> **Approve signing and sending exactly the reviewed single Devnet transaction for program `2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2`. I approve only the transaction with the displayed artifact revision/hash, payer and signer public keys, account list, instruction order, and maximum displayed cost. Do not submit any additional transaction. Stop and ask again if any displayed value, network, program state, or transaction detail changes.**

## Required post-send evidence

After submission, report the transaction signature, confirmed commitment status, executed instruction logs, actual fee, affected account addresses, and a read-only verification of the intended resulting state. Do not perform a follow-up transaction without a separate approval.

## Current state

This approval is **not currently executable** because the required x86 Core-CPI claim integration and rollback gate has not yet run for the current source revision.

No signing, sending, deployment, upload, funding, or key operation is authorized by preparing this document.
