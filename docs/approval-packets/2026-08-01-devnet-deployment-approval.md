# Devnet Deployment Approval Packet — BLOCKED PENDING PROGRAM-KEYPAIR VERIFICATION

**Prepared:** 2026-08-01
**Scope:** Devnet program deployment only. This packet does **not** authorize launch initialization, Core collection creation, public minting, claims, funding, mainnet activity, or website release.

## 1. Exact build approved for consideration

| Field | Value |
|---|---|
| Git branch | `main` |
| Git revision | `f1e9755d0c081341231bfadf50f06e4170a59065` |
| Program ID compiled into source | `2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2` |
| Main CI workflow | `Build Solana Program`, run `30688416357` |
| CI result | Passed |
| SBPF artifact SHA-256 | `f969f6bcb11d5bfea9a528963fce7c29e553666b5895747e3ab0c4bea051b29d` |
| Artifact revision marker | `f1e9755d0c081341231bfadf50f06e4170a59065` |
| Binary size | `287632` bytes |

The main CI run passed SBPF compilation, binary/revision checks, the Task 5 Bankrun initialization gate, and the Task 7 Bankrun collection guard gate.

## 2. Live devnet read-only preflight

Read-only check performed against `https://api.devnet.solana.com`:

| Account / requirement | Result |
|---|---|
| Devnet RPC | Reachable |
| Current slot at check | `480388544` |
| Program account `2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2` | Does not exist (expected before first deployment) |
| Config PDA `7LbuHZ2GJURn3wBfqFNgxQgDgjRv8x1nAhWntfdwiMQ` | Does not exist (expected before initialization) |
| Launch authority `71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r` | Exists, 2.2 SOL, system-owned |
| Metaplex Core `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d` | Exists and executable |

The CI Bankrun gates prove that GitHub Actions received a keypair matching the committed public launch authority. The packet does not expose or reproduce private key material.

## 3. Required deployment identity check — BLOCKER

The repository deliberately contains no program keypair and no handwritten deployment script. That is correct from a security perspective, but it means an actual deployment cannot yet be approved safely.

Before authorizing a transaction, an operator must provide a secure, local program keypair path and run a **public-key-only** verification that proves:

```text
<program-keypair public key> == 2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2
```

The private JSON must never be pasted into chat, committed, uploaded, or added as a GitHub secret without a separate key-management approval. If the supplied program keypair derives to any other public key, **stop**: deployment would not match `declare_id!`, `Anchor.toml`, tests, and generated clients.

## 4. Deployment mechanism approval prerequisites

The legacy handwritten deployment script remains intentionally absent and release-safety tests enforce its absence. This repository now contains:

- `scripts/review-devnet-deployment.mjs`: review-only tooling that verifies artifact/identity/Devnet first-deployment conditions and emits incomplete unsigned message summaries. It has no signing or RPC-send path.
- `scripts/execute-devnet-deployment.mjs`: prepare-only source tooling. It stages reviewer/keypair inputs, performs a fresh unsigned review, and stops. It rejects `--send` by construction.

The repository source cannot send a transaction. The separately audited root-owned runtime and fixed-purpose launcher also remain prepare-only. Any future send-capable launcher requires separate review, a final protected first-deployment state check, and a new explicit user authorization.

Before a future deployment approval, prepare and review a deployment mechanism that must:

1. Download only the CI artifact from run `30688416357` (or a newer separately approved `main` artifact).
2. Verify its revision marker equals the `main` commit being approved.
3. Verify its SHA-256 against the approved value above.
4. Use the verified program keypair from Section 3.
5. Use a separately verified payer/upgrade-authority keypair.
6. Show the exact cluster, program ID, payer public key, upgrade-authority public key, estimated rent/fee, and transaction message **before signing**.
7. Abort on any mismatch or if an account already exists at the program ID unexpectedly.
8. Sign and send only after a new explicit user approval.

## 5. Task 7 collection plan — dry run verified only

`scripts/create-devnet-collection.mjs --dry-run` produced:

| Field | Expected value |
|---|---|
| Cluster | `devnet` |
| Program ID | `2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2` |
| Config PDA / update authority | `7LbuHZ2GJURn3wBfqFNgxQgDgjRv8x1nAhWntfdwiMQ` |
| Core program | `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d` |
| Collection URI | `ar://oGxXHkoQKnsq47U4KESzurJ0-qk0dJa2FWofHQc_-SQ` |
| Royalty | `500` bp / 5% |
| Recipient | `FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6` |

This is **not** authorization to create the collection. Collection creation remains a later, separately approved transaction after deployment and initialization.

## 6. Known risk retained before any live Core CPI

The SBPF build emits three upstream `mpl-core 0.12.1` stack-frame warnings (4,224–4,480 bytes vs 4,096-byte limit) in rich Core account-deserialization routines. Cumzillaraptors does not directly call those routines in `setup_collection`; it constructs and invokes `CreateCollectionV1` only.

Still required before treating Task 7 as live-validated:

1. Deploy to devnet only after the program-keypair and deployment-mechanism gates above pass.
2. Initialize the launch configuration in a separately approved transaction.
3. Create one real devnet collection in a separately approved transaction.
4. Fetch it using `scripts/verify-core-collection.mjs` and verify Core owner, config-PDA update authority, name/URI, 500 bp royalties, and 100% treasury recipient.
5. Stop immediately if the CPI fails or verification disagrees.

## 7. Approval wording for the next safe step

Do **not** approve deployment yet. The correct next approval, after the keypair and deployment mechanism are prepared, is:

> “Approve the devnet deployment pre-send review only. Show the verified program keypair public key, payer and upgrade-authority public keys, artifact revision/hash, estimated cost, and unsigned transaction details. Do not sign or send.”

A later, separate approval is required to sign/send the deployment transaction.

## 8. Explicit non-approvals

- No mainnet action.
- No payment or funding action.
- No program deployment transaction.
- No launch initialization transaction.
- No Core collection-creation transaction.
- No mint/claim activation.
- No private-key or GitHub-secret modification.
