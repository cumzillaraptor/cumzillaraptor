# Atomic ETH-Authorized Claim Delivery Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Deliver a claimed Metaplex Core NFT only when the eligible Ethereum address has signed the exact V1 authorization for the recipient Solana wallet, with no replay or partial state change.

**Architecture:** The program will inspect the immediately preceding `secp256k1` precompile instruction through the Instructions sysvar; it will verify the expected EIP-191 message hash, Ethereum signer, NFT ID, recipient, nonce, and expiry. A claim will verify the V1 claim Merkle proof, a separate metadata-Merkle proof for the caller-supplied canonical URI, and immutable allocation membership; it will CPI-create the Core asset, then atomically mark allocation and create a claim receipt. The launch configuration's metadata commitment becomes a metadata-Merkle root rather than an opaque URI-map hash.

**Tech Stack:** Anchor 0.32.1, Solana Instructions sysvar + secp256k1 precompile, Metaplex Core 0.12.1 CPI, Keccak-256, Rust host tests, x86 SBPF/Bankrun CI.

**Safety boundary:** No deployment, funding, secret change, upload, signing, or transaction submission is included in this plan.

---

## Gate 0: Replace the opaque URI-map hash with a metadata Merkle root

**Approved design:** The immutable configuration commits a metadata Merkle root. Each mint/claim supplies `(nft_id, name, uri, metadata_proof)` and the program verifies it before the Core CPI. This preserves transaction-size practicality without trusting a caller-selected URI.

**Leaf framing (must be fixed by tests and Rust/JS vectors):**

```text
keccak256(
  "CUMZILLARAPTORS_METADATA_V1" UTF-8 ||
  program_id (32 raw bytes) ||
  cluster_tag_length (u8) || cluster_tag UTF-8 ||
  nft_id (u16 big-endian) ||
  name_length (u16 big-endian) || name UTF-8 ||
  uri_length (u16 big-endian) || uri UTF-8
)
```

The tree uses Keccak leaves and `sortPairs: true`, matching the claim-tree proof convention. URIs must be canonical `ar://` values with exactly 43 base64url transaction-ID characters, and asset name must equal `cumzillaraptor #<id>`.

### Task 0.1: Generate metadata-root artifacts and fixed vectors

**Objective:** Produce a deterministic reviewed artifact from a finalized non-placeholder URI map.

**Files:**
- Create: `scripts/generate-metadata-merkle-tree.js`
- Create: `nft-data/metadata-merkle-v1.devnet.json` (generated only after final URI map exists)
- Create: `tests/metadata-merkle.test.mjs`

**Tests:**
- same input produces byte-identical root/proofs;
- #360 proof verifies only its exact name/URI;
- changed ID/name/URI/program/cluster invalidates a proof;
- reject placeholder URI, invalid URI, noncanonical ID, duplicate ID, missing/extra URI map key, and oversized UTF-8 strings;
- include committed Rust/JS leaf and root test vectors.

**Current dependency:** The checked-in `nft-data/metadata/*.json` still contains placeholders, so this task must use synthetic valid URI-map fixtures for tests until the permanent Irys metadata upload completes. It must not claim a final devnet root yet.

### Task 0.2: Bind the root at launch and verify it during delivery

**Objective:** Rename `metadata_hash` to `metadata_root` throughout the on-chain config and launch manifest, retaining exact 32-byte storage size but changing its semantics.

**Files:**
- Modify: `programs/cumzillaraptors/src/state.rs`
- Modify: `programs/cumzillaraptors/src/lib.rs`
- Modify: `programs/cumzillaraptors/src/allocation.rs`
- Modify: `programs/cumzillaraptors/src/errors.rs`
- Modify: `scripts/generate-launch-manifest.js`
- Modify: `docs/launch-manifest-v1.md`
- Modify: `tests/manifest.test.mjs`, `tests/initialize-state.test.mjs`, Bankrun launch fixtures

**Tests:**
- launch rejects zero root;
- allocation hash binds the metadata root byte-for-byte;
- manifest generator rejects a URI map whose metadata root does not match supplied metadata proof records;
- changing the root changes the allocation hash.

**No root update instruction:** once `initialize_launch` succeeds, the root is immutable.

---

## Gate 1: Parse the preceding secp256k1 instruction defensively

### Task 1.1: Add pure parser and verifier tests

**Objective:** Parse only canonical single-signature secp256k1 instruction data and bind it to expected signer and EIP-191 hash.

**Files:**
- Create: `programs/cumzillaraptors/src/secp256k1.rs`
- Modify: `programs/cumzillaraptors/src/errors.rs`
- Create: `tests/secp256k1-shape.test.mjs`

**Tests:**
- valid precompile data is accepted only when all offsets point to the precompile instruction itself;
- reject wrong program ID, missing predecessor, multiple signatures, malformed offsets, out-of-bounds slices, cross-instruction offsets, wrong recovery ID, wrong ETH address, and wrong 32-byte EIP-191 message hash;
- test exact fixed vectors from `nft-data/claim-message-vectors.devnet.json`.

**Implementation requirements:**
- require the immediately preceding instruction from the Instructions sysvar;
- require `secp256k1_program::ID`;
- do not accept user-provided signatures in Anchor instruction arguments;
- parse offset values using checked conversion and checked addition only;
- compare recovered ETH address and exactly 32 message bytes to expected values.

### Task 1.2: Construct canonical claim message hash in Rust

**Objective:** Match the committed JavaScript V1 EIP-191 hash byte-for-byte.

**Files:**
- Modify: `programs/cumzillaraptors/src/secp256k1.rs`
- Modify: `programs/cumzillaraptors/Cargo.toml` only if a compatible Keccak dependency is needed
- Test: Rust unit test in `secp256k1.rs`

**Tests:**
- match the committed direct vector;
- match a generated record vector;
- reject non-canonical cluster, bad nonce width, invalid NFT ID, and expiry beyond `u64`.

---

## Gate 2: Verify V1 Merkle eligibility

### Task 2.1: Add Merkle proof helper

**Objective:** Verify the domain-separated V1 leaf against immutable `config.claim_root`.

**Files:**
- Create: `programs/cumzillaraptors/src/claims.rs`
- Modify: `programs/cumzillaraptors/src/lib.rs`
- Modify: `programs/cumzillaraptors/src/errors.rs`
- Create: `tests/claim-proof-shape.test.mjs`

**Tests:**
- valid proof for #360 and the approved ETH address is accepted;
- public ID is rejected by `AllocationRegistry.assert_claim_id`;
- changed ETH address, ID, nonce, proof sibling, or root fails;
- enforce a bounded proof length before looping.

**Implementation:** The leaf must be `keccak256(DOMAIN || program_id_bytes || "devnet" || eth_address_20 || nft_id_u16_be || nonce_32)`, matching `scripts/claim-message-v1.js` exactly. Sorted-pair proof hashing must match the committed `merkletreejs` scheme.

---

## Gate 3: Atomic `claim_nft` instruction

### Task 3.1: Write claim handler tests before production code

**Objective:** Define all account constraints and state effects.

**Files:**
- Create: `tests/claim-flow.test.mjs`
- Modify: `tests/bankrun-*.test.mjs` or add `tests/bankrun-claim.test.mjs`

**Tests:**
1. happy path: valid proof + prior precompile + recipient signer creates the exact Core asset and receipt;
2. recipient substitution fails;
3. public ID claim fails;
4. expired authorization fails;
5. missing/wrong/non-adjacent precompile fails;
6. wrong ETH signer or message hash fails;
7. replay fails because the receipt PDA / allocation bit already exists;
8. Core CPI failure leaves allocation bitmap, `claims_minted`, and receipt unchanged;
9. configuration, collection, Core program, URI entry, and supplied asset key constraints fail closed.

### Task 3.2: Implement handler and accounts

**Files:**
- Modify: `programs/cumzillaraptors/src/lib.rs`
- Modify: `programs/cumzillaraptors/src/state.rs`
- Modify: `programs/cumzillaraptors/src/core.rs`
- Modify: `programs/cumzillaraptors/src/allocation.rs`

**Account model:**
- immutable config PDA;
- immutable allocation registry PDA;
- finalized metadata entry PDA for the requested ID;
- fresh Core asset signer;
- `claimer: Signer` and asset owner, so signed recipient cannot be substituted;
- `ClaimReceipt` PDA seeded by a domain-separated immutable identifier such as `[b"claim", leaf]`;
- Instructions sysvar constrained to the canonical ID;
- canonical Core program, configured collection, and system program.

**Handler order:**
1. validate sale state and all fixed account keys;
2. validate allocation is a claim ID and unallocated;
3. derive leaf and verify V1 Merkle proof;
4. validate expiry and immediately preceding secp256k1 precompile against the exact EIP-191 hash for `claimer`;
5. obtain name and URI only from the finalized metadata registry;
6. CPI-create the Core asset owned by `claimer`;
7. mark allocation, create receipt, increment `claims_minted`, emit event.

Solana transaction rollback is relied upon only after all pre-CPI validation is done and Core CPI is in the same instruction. Do not persist a receipt or allocation before the CPI returns success.

---

## Gate 4: SBPF and devnet preparation

### Task 4.1: Run all host tests and x86 CI artifact gate

**Commands:**
```bash
npm test
node scripts/verify-data.js
cargo test --manifest-path programs/cumzillaraptors/Cargo.toml
```

Then manually dispatch the existing GitHub Actions build workflow for the exact committed revision. It must compile a new SBPF artifact and execute expanded Bankrun claim gates using the approved CI secret without exposing it.

### Task 4.2: Independent review and deployment status update

**Objective:** Independent security review must inspect the claim parser, account constraints, signer/recipient binding, Merkle semantics, rollback ordering, and expanded CI evidence.

**Important:** Passing host tests does not authorize deployment. Devnet deployment remains separately gated by program-keypair verification, fresh artifact/hash review, pre-send review, and explicit send approval.

---

## Execution order

Do not start Task 3 until the URI registry gate is complete. The safe immediate implementation task is **Task 0.1: immutable metadata URI registry**, not a partial claim handler.
