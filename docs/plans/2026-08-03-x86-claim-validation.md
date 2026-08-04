# x86 Core-CPI Claim Validation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add an x86 GitHub Actions gate that produces a fresh SBPF artifact and executes an end-to-end `claim_nft` validation against a Core-capable environment before any Devnet signing review.

**Architecture:** Extend the existing manual x86 SBPF workflow with a dedicated claim-validation step. The test must exercise real Metaplex Core `CreateV1` behavior, prove the post-Core receipt/allocation ordering and rollback on forced failure, and record the exact revision/artifact identity. The workflow remains validation-only: it must not deploy, sign, fund, upload, or call Devnet.

**Tech Stack:** GitHub Actions Ubuntu x86_64, Anza Solana 1.18.26 SBPF tools, Anchor 0.32.1, `mpl-core` 0.12.1, Node 20, existing Bankrun/x86 gate harness.

---

## Task 1: Identify a Core-capable x86 test harness

**Files:**
- Inspect: `tests/bankrun-collection.test.mjs`
- Inspect: `programs/cumzillaraptors/Cargo.toml`
- Inspect: `.github/workflows/build-program.yml`
- Create/modify: `tests/bankrun-claim.test.mjs` only after selecting a harness that can load `mpl-core`.

1. Confirm whether the currently pinned Bankrun can load an external `mpl-core` program binary with the program under test.
2. If not, use a pinned x86 `solana-test-validator`/Anchor integration harness with an explicit locally supplied Core program binary and deterministic test accounts.
3. The test harness must be version-pinned and offline after dependency install.
4. Fail closed if `mpl-core` cannot be loaded; do not replace CPI execution with mocks.

**Verification:** a deliberately minimal test proves Core program availability before running any claim scenario.

## Task 2: Create deterministic valid claim fixture

**Files:**
- Create: `tests/fixtures/claim-nft-v1.mjs` or extend existing V1 vectors.
- Test: `tests/bankrun-claim.test.mjs`

1. Select a reviewed claim-pool NFT, ETH address, nonce, Merkle proof, metadata name/URI/proof from committed artifacts.
2. Build the canonical EIP-191 message/preimage and secp instruction with correct predecessor instruction indices.
3. Derive config, allocation, asset, and receipt PDAs exactly as the program does.
4. Assert fixture uses Devnet domain/program binding but remains fully local/offline.

**Verification:** fixture recomputed claim leaf and metadata leaf equal committed artifacts.

## Task 3: Prove happy-path Core claim delivery

**Files:**
- Create: `tests/bankrun-claim.test.mjs`

1. Initialize launch/config and allocation registry in the local x86 harness.
2. Create the canonical Core collection with config PDA authority.
3. Transition sale state to `Live` using the configured test launch authority.
4. Submit secp instruction immediately followed by `claim_nft`.
5. Assert:
   - Core asset exists and is owned by `mpl-core`;
   - asset owner is the claimant;
   - update authority is config PDA;
   - receipt exists at `[b"claim", leaf]` and deserializes correctly;
   - allocation bit is set;
   - `claims_minted` increments exactly once.

**Verification:** x86 execution, not static source inspection.

## Task 4: Prove rollback and pre-Core rejection paths

**Files:**
- Modify: `tests/bankrun-claim.test.mjs`

1. Make Core `CreateV1` fail after all preconditions pass and assert no asset, receipt, allocation bit, or counter persists.
2. Assert no durable state for wrong/non-adjacent secp, recipient substitution, expiry, invalid claim/metadata proof, public-pool ID, allocated ID, pre-existing receipt, and non-system/nonempty asset account.
3. Fund an otherwise empty asset PDA before a valid claim; assert dust recovery permits success and returns dust to the claimant.

**Verification:** each negative case proves no durable claim state changed.

## Task 5: Add a dedicated x86 workflow gate

**Files:**
- Modify: `.github/workflows/build-program.yml`

1. Add a manual workflow step named `Run atomic claim Core-CPI gate` after existing SBPF and collection gates.
2. Set `CUMZ_EXPECTED_BUILD_REVISION=${{ github.sha }}` and artifact directory as existing gates do.
3. Run only `tests/bankrun-claim.test.mjs` or the selected pinned Core-capable integration command.
4. Upload test logs and the SBPF artifact/revision marker on success and failure.
5. Do not add a Devnet RPC, `solana program deploy`, signing, keypair use beyond existing test-only launch-authority proof, or send path.

**Verification:** workflow configuration test asserts the exact gate exists and is x86-only/manual.

## Task 6: Publish evidence and prepare—not sign—the transaction review

**Files:**
- Create: `docs/approval-packets/<date>-x86-claim-validation-evidence.md`
- Update: `docs/approval-packets/2026-08-03-post-x86-devnet-transaction-approval.md`

1. Record Git revision, SBPF SHA-256, x86 run URL/ID, and each passed behavioral assertion.
2. Record that no Devnet transaction, signing, deployment, funding, or upload occurred.
3. If and only if all x86 checks pass, produce a read-only pre-send review for the proposed *single* Devnet transaction.
4. Stop before signing or sending; require the user to repeat the exact one-time authorization from the approval packet against the fresh transaction details.

**Verification:** the packet remains fail-closed and does not contain private material.

## Non-negotiable stop conditions

- Any x86/SBPF/Core-CPI failure, skipped behavioral gate, stale revision, artifact hash mismatch, or changed transaction detail.
- Any need to deploy, sign, send, fund, upload, alter secrets, or touch mainnet.
- Any test setup requiring a private key to be pasted into chat or committed.

No live transaction is authorized until all tasks pass and a new, transaction-specific signature authorization is supplied.
