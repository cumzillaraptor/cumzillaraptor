# Secure Metaplex Core Mint and ETH-Claim Implementation Plan

> **For Hermes:** Use `subagent-driven-development` to implement this plan task-by-task, with spec review followed by code-quality review for every task.

**Goal:** Replace the current allocation-only controller with a tested Solana/Metaplex Core program that atomically delivers each public-sale and ETH-holder NFT, prevents claim theft, binds the approved 247/173 allocation, and exposes a frontend built from the actual Anchor IDL.

**Architecture:** The collection will be a canonical Metaplex Core Collection whose update authority is an authority PDA controlled by the Anchor program. The program stores an immutable launch configuration, an immutable allocation manifest (public pool + claim root), and an allocation bitmap. A public mint transfers 1 SOL and CPIs into Core to create the exact next asset for the buyer in the same transaction. An ETH claim verifies a domain-separated EIP-191/Ethereum signature through the Solana `secp256k1` precompile and then CPIs to mint the reserved asset to the signed Solana recipient. The browser requests a server-generated claim authorization/proof package; it never serializes Anchor instructions by hand.

**Tech Stack:** Rust / Anchor 0.30.1; `mpl-core` CPI crate pinned to a compatible release; Solana secp256k1 instruction introspection; TypeScript; `@coral-xyz/anchor`; `@metaplex-foundation/mpl-core`; `@solana/web3.js`; Bankrun or local `solana-test-validator`; Node built-in test runner; GitHub Actions x86_64 SBPF build.

**Non-negotiable launch gates:**
- Do not deploy the current `6b8c344` binary.
- Do not expose Mint/Claim buttons until the new program, IDL-generated client, and negative tests pass.
- No mainnet deployment or Cloudflare production deployment in this plan.
- The deployer / init authority must be a user-controlled keypair or multisig verified before initialization. Never guess a wallet keypair path or send funds to an unverified address.
- Preserve the existing images, collection source data, Merkle source data, and verified off-chain files. Rebuild only code and generated artifacts.

---

## Design decisions that must be fixed before implementation

### D1. Claim authorization

Each claim requires an Ethereum EIP-191 personal-signature over this exact UTF-8 message:

```text
CUMZILLARAPTORS_CLAIM_V1
cluster: devnet
program: <program_id>
recipient: <solana_base58_pubkey>
nft_id: <decimal_u16>
eth_address: <lowercase_0x_address>
nonce: <32-byte_claim_nonce_hex>
expiry_unix: <u64>
```

- The Merkle leaf becomes:
  `keccak256("CUMZILLARAPTORS_CLAIM_V1" || program_id(32) || cluster_tag || eth_address(20) || nft_id_be(2) || nonce(32))`.
- `cluster_tag` is an explicit fixed byte string (`devnet` in this phase), not an RPC URL.
- The `secp256k1` precompile instruction must occur immediately before `claim_nft` in the same transaction. The program must inspect the Instructions sysvar and validate signer ETH address, exact 32-byte message hash, and signature offsets.
- A valid signature binds one Solana recipient, one NFT ID, and one expiry; it cannot be replayed to a different wallet.

### D2. Allocation model

- Build an immutable `AllocationManifest` account at initialization:
  - `public_pool: [u16; 247]` or fixed array equivalent;
  - `claim_root: [u8; 32]`;
  - `allocation_hash: [u8; 32]` computed off-chain from a canonical manifest;
  - `public_count = 247`, `claim_count = 173`.
- Maintain a 420-bit allocation bitmap. An ID is marked only after a successful Core asset creation CPI.
- Public mint requires the selected ID be marked `Public` in the manifest and currently unallocated.
- Claim requires the selected ID be represented by a valid domain-separated claim leaf, be marked `Claim`, and currently unallocated.
- The initialization instruction verifies an exact, canonical public-pool manifest hash. The claim root and public-pool hash are immutable after initialization.

### D3. Core collection and asset metadata

- Create one Metaplex Core collection first in a controlled setup transaction.
- The Anchor program config stores and validates: Core program ID, collection address, collection update authority, treasury, metadata base URI/version, and asset name prefix.
- Asset URI must be deterministically `ar://<metadata_txid>` from a checked immutable mapping keyed by NFT ID. Do not mint while `ar://PLACEHOLDER_*` strings exist.
- Royalty plugins must be configured to pay the treasury at 500 basis points; tests must read and validate resulting Core asset/collection data.
- The exact `mpl-core` instruction account list and signer seeds must be taken from the pinned crate/IDL documentation while implementing, not inferred from this document.

### D4. Authority policy

- `initialize` accepts only a preconfigured launch authority constant for devnet, passed through build-time configuration, or an authority whose address is committed in the program.
- Before production, replace direct signer authority with a multisig / governance authority. No admin instruction may be publicly capturable.
- There is no generic `enable_claims`; claims are live only once `finalize_launch` validates the configured Core collection and immutable manifest. If a pause function exists, it can only pause (not silently alter roots, treasury, or inventory).

---

## Task 1: Quarantine obsolete deploy/client paths and establish a safety baseline

**Objective:** Ensure the current non-functional binary/client cannot be confused with a deployable release.

**Files:**
- Create: `docs/SECURITY_STATUS.md`
- Modify: `README.md` (create if absent)
- Modify: `.gitignore`
- Remove: `scripts/deploy-devnet.js` (untracked, hand-written, and not a valid upgradeable-loader deployer)
- Test: `tests/release-safety.test.mjs`

**Step 1: Write failing release-safety tests**

Create `tests/release-safety.test.mjs` asserting:

```js
assert.doesNotMatch(await readFile('cumzillaraptors/index.html', 'utf8'), /11111111111111111111111111111111/);
assert.doesNotMatch(await readFile('cumzillaraptors/index.html', 'utf8'), /placeholder/i);
assert.equal(existsSync('scripts/deploy-devnet.js'), false);
```

**Step 2: Run the test and verify failure**

Run:

```bash
node --test tests/release-safety.test.mjs
```

Expected: FAIL because the old frontend still contains placeholder program/client logic.

**Step 3: Replace the current Mint and Claim action area with a disabled `Devnet rebuild in progress` state**

Do not retain transaction-signing code. Keep the visual page and data display, but remove all raw transaction construction and wallet-signing handlers until Task 12 supplies the generated-IDL client.

**Step 4: Add security status document**

`docs/SECURITY_STATUS.md` must state:
- old artifact is build-pipeline evidence only;
- no public mint/claim deployment permitted;
- program ID is provisional until the final build uses an audited keypair;
- devnet wallet keypair must be verified against its public address before funding/deploying.

**Step 5: Verify pass**

```bash
node --test tests/release-safety.test.mjs tests/landing.test.mjs
```

Expected: all pass.

**Step 6: Commit**

```bash
git add docs/SECURITY_STATUS.md README.md .gitignore cumzillaraptors/index.html tests/release-safety.test.mjs
git commit -m "chore: quarantine pre-audit mint and deploy paths"
```

---

## Task 2: Create a canonical launch-manifest specification and deterministic generator

**Objective:** Define exactly how public inventory, claims, metadata URIs, and the immutable manifest hash are encoded.

**Files:**
- Create: `docs/launch-manifest-v1.md`
- Create: `scripts/generate-launch-manifest.js`
- Create: `nft-data/launch-manifest.devnet.json` (generated, ignored until reviewed)
- Test: `tests/manifest.test.mjs`

**Step 1: Write failing manifest tests**

Test that the generator produces:
- exactly 420 IDs partitioned into 247 Public and 173 Claim;
- no duplicate or missing ID;
- claim IDs exactly match reserve CSV IDs;
- public IDs exactly match mint CSV IDs;
- canonical `allocationHash` is stable over repeated runs;
- metadata mapping rejects placeholder URIs.

**Step 2: Run and verify failure**

```bash
node --test tests/manifest.test.mjs
```

Expected: FAIL because no manifest generator/spec exists.

**Step 3: Implement canonical encoding**

`docs/launch-manifest-v1.md` must define byte ordering and hashing. The generator must use canonical JSON-independent binary serialization:

```text
"CUMZILLARAPTORS_ALLOCATION_V1" ||
program_id(32) ||
cluster_tag_len(u8) || cluster_tag ||
collection(32) ||
public_pool_count(u16_be) || public_ids(u16_be × 247) ||
claim_root(32) ||
metadata_uri_hash(32)
```

The generator emits the raw ID arrays, hash, URI mapping hash, claim root, and an audit summary.

**Step 4: Verify pass twice**

```bash
node --test tests/manifest.test.mjs
node scripts/generate-launch-manifest.js --cluster devnet --program-id <provisional_program_id> --collection <collection_pubkey>
node scripts/generate-launch-manifest.js --cluster devnet --program-id <provisional_program_id> --collection <collection_pubkey>
```

Expected: identical `allocationHash` both times.

**Step 5: Commit**

```bash
git add docs/launch-manifest-v1.md scripts/generate-launch-manifest.js tests/manifest.test.mjs
git commit -m "feat: define canonical launch allocation manifest"
```

---

## Task 3: Version and regenerate domain-separated claim data

**Objective:** Replace public-proof-only authorization assumptions with domain-separated eligibility data and typed signing payloads.

**Files:**
- Create: `scripts/claim-message-v1.js`
- Modify: `scripts/generate-merkle-tree.js`
- Create: `nft-data/claims-v1.devnet.json` (generated)
- Create: `nft-data/claim-message-vectors.devnet.json` (generated)
- Test: `tests/claim-message.test.mjs`

**Step 1: Write failing cross-language-vector tests**

The Node test must verify for fixtures:
- normalized lowercase ETH address;
- `u16` big-endian NFT ID;
- fixed 32-byte nonce;
- exact cluster/program-bound message;
- exact Keccak leaf and root;
- deterministic serialized message hash.

**Step 2: Run and verify failure**

```bash
node --test tests/claim-message.test.mjs
```

Expected: FAIL because V1 data and helper do not exist.

**Step 3: Implement helper and generator**

Create explicit functions:

```js
buildClaimMessage({ cluster, programId, recipient, nftId, ethAddress, nonceHex, expiryUnix })
claimMessageHash(message)
makeClaimLeaf({ programId, clusterTag, ethAddress, nftId, nonceHex })
```

Reject invalid checksums/lengths, wrong `0x` hex width, values outside `1..420`, and expiry values outside `u64`.

**Step 4: Verify all claim records**

```bash
node scripts/generate-merkle-tree.js --v1 --cluster devnet --program-id <provisional_program_id>
node --test tests/claim-message.test.mjs
node scripts/verify-data.js
```

Expected: claim V1 proof set has 173 entries and data verifier remains green.

**Step 5: Commit**

```bash
git add scripts/claim-message-v1.js scripts/generate-merkle-tree.js tests/claim-message.test.mjs
 git commit -m "feat: domain-separate ETH claim eligibility data"
```

---

## Task 4: Add a pinned Metaplex Core dependency and compile-only CPI spike

**Objective:** Validate the exact Core crate/API and account model before rewriting the program.

**Files:**
- Modify: `programs/cumzillaraptors/Cargo.toml`
- Create: `programs/cumzillaraptors/src/core.rs`
- Create: `tests/core-cpi-shape.test.mjs`
- Modify: `.github/workflows/build-program.yml`

**Step 1: Write failing build/API shape test**

Test requires `core.rs` to expose a wrapper that accepts:
- canonical Core program account;
- canonical collection account;
- asset account/keypair;
- owner;
- authority signer/PDA;
- name and URI.

**Step 2: Pin compatible dependencies**

Use a version of `mpl-core` compatible with the project’s Solana 1.18 / Anchor 0.30 SBPF toolchain. Update `Cargo.lock` with the same Rust 1.84-compatible resolution strategy used in the successful CI build.

**Step 3: Add a compile-only CPI wrapper**

The wrapper must validate:

```rust
require_keys_eq!(ctx.accounts.mpl_core_program.key(), mpl_core::ID, ErrorCode::InvalidCoreProgram);
require_keys_eq!(ctx.accounts.collection.key(), config.collection, ErrorCode::InvalidCollection);
```

Do not mint assets in this task. The goal is a successful host check and CI SBPF artifact with the Core dependency.

**Step 4: Verify**

```bash
cargo +1.84.0 check --manifest-path programs/cumzillaraptors/Cargo.toml --locked
node --test tests/core-cpi-shape.test.mjs
```

Then manually run GitHub Actions and verify a successful SBPF artifact.

**Step 5: Commit**

```bash
git add programs/cumzillaraptors/Cargo.toml programs/cumzillaraptors/Cargo.lock programs/cumzillaraptors/src/core.rs tests/core-cpi-shape.test.mjs .github/workflows/build-program.yml
git commit -m "build: pin Metaplex Core CPI dependencies"
```

---

## Task 5: Replace public initialization with controlled immutable launch setup

**Objective:** Prevent config front-running and bind launch-critical values exactly once.

**Files:**
- Modify: `programs/cumzillaraptors/src/lib.rs`
- Create: `programs/cumzillaraptors/src/state.rs`
- Create: `programs/cumzillaraptors/src/errors.rs`
- Test: `tests/program/initialize.test.ts`

**Step 1: Write failing tests**

Cover:
1. wrong authority cannot initialize;
2. correct authority initializes exactly once;
3. second initialization fails;
4. zero/default treasury, wrong Core program, and missing collection fail;
5. config stores immutable manifest hash, collection, Core program, claim root, and metadata mapping hash;
6. launch cannot initialize if public count != 247 or claim count != 173.

**Step 2: Implement state types**

Use `#[derive(InitSpace)]` where compatible or exact constants. `CollectionConfig` includes:

```rust
pub launch_authority: Pubkey,
pub treasury: Pubkey,
pub core_program: Pubkey,
pub collection: Pubkey,
pub allocation_hash: [u8; 32],
pub claim_root: [u8; 32],
pub metadata_hash: [u8; 32],
pub cluster_tag_hash: [u8; 32],
pub sale_state: SaleState,
pub public_minted: u16,
pub claims_minted: u16,
pub bump: u8,
```

Make mutable launch parameters impossible to rewrite after initialization. Do not include a generic root/treasury update instruction.

**Step 3: Implement fixed authority validation**

Pass the planned devnet launch authority through a program constant generated from an audited config file. The test fixture builds a test-only program configuration; production/devnet source must not accept arbitrary first caller.

**Step 4: Verify**

```bash
anchor test --skip-deploy -- --grep "initialize"
```

or Bankrun equivalent. Expected: all initialization tests pass.

**Step 5: Commit**

```bash
git add programs/cumzillaraptors/src tests/program/initialize.test.ts
git commit -m "feat: secure immutable collection initialization"
```

---

## Task 6: Implement immutable allocation registry and manifest validation

**Objective:** Enforce the exact 247 public / 173 claim partition on-chain.

**Files:**
- Create: `programs/cumzillaraptors/src/allocation.rs`
- Modify: `programs/cumzillaraptors/src/lib.rs`
- Test: `tests/program/allocation.test.ts`

**Step 1: Write failing tests**

Test:
- constructor rejects duplicate IDs;
- constructor rejects ID 0 and ID 421;
- exactly 247 public IDs / 173 claim IDs are required;
- a claim ID cannot be minted publicly;
- a public ID cannot be claimed;
- once allocated, neither path can allocate the ID again;
- allocation manifest hash mismatch fails.

**Step 2: Implement `AllocationRegistry`**

Use a 420-bit bitmap (`[u8; 53]`) plus a public-pool index array. Implement safe helpers:

```rust
fn id_to_index(id: u16) -> Result<usize>;
fn is_allocated(bitmap: &[u8; 53], id: u16) -> Result<bool>;
fn mark_allocated(bitmap: &mut [u8; 53], id: u16) -> Result<()>;
```

Use checked bounds and ensure `mark_allocated` happens only after Core CPI success.

**Step 3: Verify**

```bash
anchor test --skip-deploy -- --grep "allocation"
```

**Step 4: Commit**

```bash
git add programs/cumzillaraptors/src/allocation.rs programs/cumzillaraptors/src/lib.rs tests/program/allocation.test.ts
git commit -m "feat: enforce immutable public and claim allocation partition"
```

---

## Task 7: Create and validate the Metaplex Core collection

**Objective:** Establish the canonical collection controlled by the program-authority model.

**Files:**
- Create: `scripts/create-devnet-collection.ts`
- Create: `scripts/verify-core-collection.ts`
- Modify: `programs/cumzillaraptors/src/core.rs`
- Test: `tests/program/collection.test.ts`

**Step 1: Write failing tests**

Tests assert that setup rejects:
- non-Core collection account;
- collection whose update authority is not the expected authority/PDA;
- collection with royalty plugin missing or not 500 bp / wrong recipient;
- wrong Core program ID.

**Step 2: Implement controlled collection setup**

- Use the current, audited Metaplex Core SDK.
- Create collection using the final `ar://` collection metadata URI only.
- Configure royalty plugin: 500 basis points, treasury recipient.
- Persist collection address only after verifying the fetched on-chain collection state matches all required values.

**Step 3: Verify locally and on devnet fixture**

```bash
npm run test:program -- --grep "collection"
node --loader tsx scripts/create-devnet-collection.ts --dry-run
```

`--dry-run` must print transactions and expected collection fields but never sign/send.

**Step 4: Commit**

```bash
git add scripts/create-devnet-collection.ts scripts/verify-core-collection.ts programs/cumzillaraptors/src/core.rs tests/program/collection.test.ts
git commit -m "feat: validate canonical Metaplex Core collection"
```

---

## Task 8: Implement atomic public mint with Core asset delivery

**Objective:** Collect exactly 1 SOL and mint exactly one allocated Core NFT to the buyer atomically.

**Files:**
- Modify: `programs/cumzillaraptors/src/lib.rs`
- Modify: `programs/cumzillaraptors/src/core.rs`
- Test: `tests/program/public-mint.test.ts`

**Step 1: Write failing tests**

Cover:
1. valid buyer receives a Core asset named/URI-mapped to expected next public ID;
2. treasury balance rises by exactly 1 SOL;
3. buyer balance decreases by 1 SOL plus fee/rent only;
4. allocation index and bitmap update after Core asset exists;
5. Core CPI failure rolls back payment and allocation;
6. wrong treasury/Core program/collection/URI-mapping hash fail;
7. pool exhausts exactly after 247 successful mints;
8. transaction cannot mint a reserved claim ID.

**Step 2: Implement instruction account constraints**

Use typed accounts wherever possible. Validate Core program and collection keys before CPI. The asset must be a newly generated signer supplied by buyer (or a PDA design explicitly supported by Core); constrain name and URI from the committed mapping. Do not accept arbitrary asset URI/name from the buyer.

**Step 3: Implement ordering**

In one instruction:
1. validate config, sale state, next public ID, asset mapping, and account keys;
2. transfer 1 SOL to configured treasury;
3. CPI create Core asset with buyer as owner;
4. verify successful CPI / expected account state;
5. set bitmap, advance index, increment counter;
6. emit event including asset and NFT ID.

A CPI error reverts the transfer and state automatically.

**Step 4: Verify**

```bash
npm run test:program -- --grep "public mint"
```

Expected: all positive/negative tests pass.

**Step 5: Commit**

```bash
git add programs/cumzillaraptors/src/lib.rs programs/cumzillaraptors/src/core.rs tests/program/public-mint.test.ts
git commit -m "feat: atomically mint Core asset on public sale"
```

---

## Task 9: Implement secure ETH-authorized claim and atomic Core asset delivery

**Objective:** Permit only the Ethereum holder to direct an eligible NFT to their signed Solana recipient.

**Files:**
- Create: `programs/cumzillaraptors/src/secp256k1.rs`
- Modify: `programs/cumzillaraptors/src/lib.rs`
- Test: `tests/program/claim.test.ts`
- Test: `tests/program/secp256k1-fixtures.test.ts`

**Step 1: Write failing tests**

Cover:
1. valid proof + valid secp256k1 signature mints exact claim ID to signed recipient;
2. a different Solana recipient using same proof/signature fails;
3. attacker signer cannot consume victim’s claim;
4. malformed secp instruction, wrong signer ETH address, wrong message hash, wrong instruction index, expired signature, and missing precompile all fail;
5. valid claim cannot be replayed;
6. Core CPI failure does not consume claim / create receipt;
7. public allocation path cannot claim a public ID.

**Step 2: Implement precompile inspection**

Read the Instructions sysvar and require a secp256k1 verification instruction immediately preceding the program instruction. Parse offsets defensively, bounds-check all slices, recover expected 20-byte ETH address, and compare the message hash against the canonical V1 message produced on-chain.

Do not parse a user-provided signature blob in the Anchor instruction. Use the precompile-verified instruction only.

**Step 3: Implement claim flow**

In one instruction:
1. validate proof and unallocated claim ID;
2. validate recipient is `claimer` signer;
3. validate secp256k1 prior instruction and expiry;
4. Core CPI mint asset to recipient;
5. mark bitmap, create receipt keyed by domain-separated claim leaf, increment count;
6. emit asset/recipient/ID event.

**Step 4: Verify**

```bash
npm run test:program -- --grep "claim"
```

Expected: all front-run/replay/invalid signature tests pass.

**Step 5: Commit**

```bash
git add programs/cumzillaraptors/src/secp256k1.rs programs/cumzillaraptors/src/lib.rs tests/program/claim.test.ts tests/program/secp256k1-fixtures.test.ts
git commit -m "feat: bind ETH claims to signed Solana recipients"
```

---

## Task 10: Remove unsafe launch toggles and add a one-way pause policy

**Objective:** Ensure no authority action can enable undeliverable claims or rewrite launch data.

**Files:**
- Modify: `programs/cumzillaraptors/src/lib.rs`
- Modify: `programs/cumzillaraptors/src/state.rs`
- Test: `tests/program/admin.test.ts`

**Step 1: Write failing tests**

- no generic `enable_claims` exists;
- `finalize_launch` requires valid collection/manifest and only runs once;
- unauthorized caller cannot finalize/pause;
- pause blocks mints and claims;
- unpause policy is explicit: devnet only or multisig only; no hidden single-signer bypass;
- treasury/root/collection cannot change after initialization.

**Step 2: Implement state transitions**

Use a narrow enum:

```rust
pub enum SaleState { Configured, Live, Paused, Closed }
```

Only legal transitions are `Configured -> Live`, `Live -> Paused`, and (if product policy approves) `Paused -> Live`. Never permit changes to roots, manifest, treasury, metadata mapping, or Core collection after `Configured`.

**Step 3: Verify**

```bash
npm run test:program -- --grep "admin"
```

**Step 4: Commit**

```bash
git add programs/cumzillaraptors/src/lib.rs programs/cumzillaraptors/src/state.rs tests/program/admin.test.ts
git commit -m "feat: enforce immutable launch state and pause policy"
```

---

## Task 11: Replace stale tests with a runnable program test harness

**Objective:** Turn tests into reliable evidence rather than stale source.

**Files:**
- Remove: `tests/cumzillaraptors.test.ts`
- Create: `tests/program/helpers.ts`
- Create: `tests/program/*.test.ts` from Tasks 5–10
- Modify: `package.json`
- Modify: `Anchor.toml`
- Test: all above

**Step 1: Replace broken package scripts**

Set explicit commands, for example:

```json
{
  "scripts": {
    "test:web": "node --test tests/*.test.mjs",
    "test:data": "node scripts/verify-data.js",
    "test:program": "tsx --test tests/program/*.test.ts",
    "test": "npm run test:web && npm run test:data && npm run test:program",
    "build:check": "cargo +1.84.0 check --manifest-path programs/cumzillaraptors/Cargo.toml --locked"
  }
}
```

Adjust the exact runner only after validating it works on the Pi; do not leave a placeholder test command.

**Step 2: Use Bankrun or a local validator**

Prefer Bankrun for most instruction tests. Use an isolated local validator only for Core CPI behavior if Bankrun cannot load the needed Core program.

**Step 3: Add test-fixture controls**

Fixtures must create distinct authority, buyer, attacker, victim recipient, treasury, and Core asset accounts. Never rely on public devnet faucet requests in unit tests.

**Step 4: Verify full suite**

```bash
npm test
cargo +1.84.0 test --manifest-path programs/cumzillaraptors/Cargo.toml --locked
```

Expected: no placeholder command, no stale IDL imports, all test groups pass.

**Step 5: Commit**

```bash
git add package.json Anchor.toml tests programs/cumzillaraptors/src
git rm tests/cumzillaraptors.test.ts
git commit -m "test: replace stale mint and claim integration suite"
```

---

## Task 12: Build an IDL-generated browser client and secure claim package service

**Objective:** Re-enable UI only through real IDL serialization and server-generated claim authorizations.

**Files:**
- Create: `app/` or `frontend/` project directory (choose one; do not mix)
- Create: `frontend/src/idl/cumzillaraptors.json` (generated, checked against build hash)
- Create: `frontend/src/lib/program.ts`
- Create: `frontend/src/lib/claim-api.ts`
- Create: `frontend/src/routes/MintClaim.tsx` or replace `cumzillaraptors/index.html` only if a bundler-free IDL client proves feasible
- Create: `services/claim-api/` with read-only endpoint implementation
- Test: `frontend/src/**/*.test.*`
- Test: `services/claim-api/**/*.test.*`

**Step 1: Write failing client serialization tests**

Test that client-created instructions exactly match Anchor method builders and include all required accounts:
- config PDA;
- allocation registry/pool PDA;
- Core program;
- collection;
- generated asset signer;
- treasury;
- system program;
- instructions sysvar for claims.

Do not assert hand-written discriminator bytes.

**Step 2: Generate and pin IDL**

Build IDL from the final program. Record program source commit and artifact SHA-256 in `frontend/src/idl/manifest.json`. Refuse to build client transactions if IDL/program ID/hash configuration differs.

**Step 3: Implement mint client**

Use Anchor `program.methods.mintRandom()` method builder and wallet adapter. Before signing, display canonical program ID, collection, recipient, amount, and asset account. After confirmation, fetch Core asset and show it only if owner/collection/URI match expected data.

**Step 4: Implement claim package API**

The API may return public eligibility proof/nonce/package, but must:
- normalize ETH addresses;
- rate-limit and validate request shape;
- return the canonical claim message to sign;
- verify submitted EIP-191 signature off-chain only as a UX preflight;
- never treat off-chain verification as final authorization;
- include expiry and recipient in response;
- never expose private keys.

**Step 5: Implement claim client**

1. user connects ETH and Solana wallets;
2. requests canonical package for specific ID;
3. signs exact message in MetaMask;
4. adds secp256k1 verification instruction before Anchor `claimNft` instruction;
5. uses Anchor IDL method builder for claim;
6. fetches/validates Core asset after confirmation.

**Step 6: Remove HTML injection patterns**

Replace status `innerHTML` with `textContent` or framework-rendered text. Render NFT names via escaped DOM/component props.

**Step 7: Verify**

```bash
npm run test:frontend
npm run test:claim-api
npm run build:frontend
```

Expected: no system-program placeholder, no raw discriminator, no arbitrary proof-only claim path, and no `innerHTML` from untrusted wallet/RPC errors.

**Step 8: Commit**

```bash
git add frontend services cumzillaraptors package.json
git commit -m "feat: use generated IDL for secure mint and claim client"
```

---

## Task 13: Make metadata permanent and verify every Core URI before launch

**Objective:** Replace all placeholder metadata with Arweave/Irys URIs and bind those URIs to the launch manifest.

**Files:**
- Modify: `scripts/generate-metadata.js`
- Replace: `scripts/upload-arweave.js`
- Create: `scripts/verify-arweave-manifest.js`
- Create: `nft-data/uri-map.devnet.json` (generated)
- Test: `tests/metadata-uri.test.mjs`

**Step 1: Write failing URI tests**

Tests must reject:
- `PLACEHOLDER` values;
- missing image/metadata URI;
- duplicate URI/ID mapping;
- URI map not matching metadata JSON;
- collection royalty or creator mismatch;
- non-`ar://` URI.

**Step 2: Make upload explicit and safe**

Replace automatic airdrop/fund behavior with command flags:

```bash
node scripts/upload-arweave.js --cluster devnet --keypair ~/.config/solana/<verified-keypair>.json --fund-sol 0.5 --confirm
```

Without `--confirm`, print a cost estimate and exit without transfers/uploads. Do not hard-code the wallet path. Persist a resumable upload state file after every successful upload, so reruns never duplicate paid uploads.

**Step 3: Generate URI map and manifest hash**

After complete upload, generate/validate:
- 420 image URIs;
- 420 metadata URIs;
- one collection URI;
- deterministic `metadata_hash` consumed by Task 5 initialization.

**Step 4: Verify**

```bash
node scripts/verify-arweave-manifest.js --uri-map nft-data/uri-map.devnet.json
node --test tests/metadata-uri.test.mjs
```

**Step 5: Commit code only**

Do not commit wallet files, upload state containing credentials, or ephemeral devnet upload results unless user explicitly asks to preserve public URI map in Git.

```bash
git add scripts tests
 git commit -m "feat: verify immutable Core metadata URI manifest"
```

---

## Task 14: Harden CI artifact provenance and reproducible build checks

**Objective:** Ensure the final binary, IDL, manifest, and frontend are generated from one reviewed commit.

**Files:**
- Modify: `.github/workflows/build-program.yml`
- Create: `.github/workflows/test.yml`
- Create: `scripts/verify-release.js`
- Create: `docs/release-checklist.md`
- Test: `tests/release-provenance.test.mjs`

**Step 1: Write failing provenance test**

Require release bundle to include:
- program `.so` SHA-256;
- IDL SHA-256;
- `Cargo.lock` SHA-256;
- launch manifest hash;
- metadata URI map hash;
- Git commit;
- Core collection address;
- program ID;
- explicit cluster.

**Step 2: Update CI**

CI must:
1. run locked Cargo check;
2. build SBPF;
3. generate IDL;
4. run data/manifest/unit tests;
5. upload `.so`, IDL, and signed/hashed release manifest in one artifact;
6. not deploy;
7. remain `workflow_dispatch` only.

**Step 3: Add verification command**

```bash
node scripts/verify-release.js --artifact <unzipped_artifact_dir> --expected-commit <sha>
```

It must refuse mismatches.

**Step 4: Verify**

Trigger CI manually once. Download artifact and verify it locally before any devnet deployment.

**Step 5: Commit**

```bash
git add .github/workflows scripts docs tests
git commit -m "build: attest program and client release artifacts"
```

---

## Task 15: Execute controlled devnet readiness rehearsal

**Objective:** Prove the final program works on devnet using test identities before any public page is enabled.

**Files:**
- Create: `scripts/devnet-preflight.ts`
- Create: `scripts/deploy-devnet.ts`
- Create: `scripts/devnet-smoke.ts`
- Create: `docs/devnet-runbook.md`
- Test: `tests/devnet-preflight.test.mjs`

**Step 1: Implement preflight (read-only by default)**

`devnet-preflight.ts` must print and validate without signing:
- RPC cluster identity;
- deployer public key derived from selected keypair;
- live deployer balance;
- program keypair public key;
- artifact and release-manifest hashes;
- required rent/fee budget using actual program size;
- collection/manifest/metadata URI readiness;
- no deployed program at target ID unless explicit `--upgrade` mode;
- authority/multisig match.

It must require `--confirm-devnet` to proceed to transaction creation and a separate `--send` to broadcast.

**Step 2: Implement correct deployment tooling**

Use Solana CLI or a well-tested upgradeable-loader SDK routine. Do not hand-serialize `BPFUpgradeableLoader` instruction data. The script must support `--dry-run`, record every transaction signature, and refuse to deploy if release provenance validation fails.

**Step 3: Fund only verified deployer keypair**

Before accepting SOL, run:

```bash
node scripts/devnet-preflight.ts --keypair ~/.config/solana/<candidate>.json
```

Compare the printed public key with the sender’s intended destination. Do not rely on historic addresses from chat.

**Step 4: Deploy and initialize only after explicit user approval**

The actual sequence is:
1. upload/verify metadata;
2. create/verify Core collection;
3. build/release-attest artifact;
4. deploy program;
5. initialize immutable config under verified authority;
6. run one public mint with a disposable buyer;
7. run one valid ETH-authorized claim with a disposable claim fixture;
8. run adversarial claim-replay/front-run fixtures;
9. inspect on-chain Core assets, owners, collection membership, treasury delta, and registry state;
10. pause program after rehearsal.

**Step 5: Verify**

```bash
node scripts/devnet-smoke.ts --cluster devnet --program-id <id> --strict
```

Expected: exact Core asset/owner/collection/URI checks, 1 SOL treasury delta, proof+signature enforcement, and no duplicated allocation.

**Step 6: Commit**

```bash
git add scripts docs tests
git commit -m "feat: add gated devnet deployment and smoke runbook"
```

---

## Final integration gate

Before any devnet deployment, all checks below must pass from a clean checkout:

```bash
git status --short
npm ci
npm test
cargo +1.84.0 check --manifest-path programs/cumzillaraptors/Cargo.toml --locked
cargo +1.84.0 test --manifest-path programs/cumzillaraptors/Cargo.toml --locked
node scripts/verify-release.js --artifact <artifact-dir> --expected-commit <sha>
node scripts/devnet-preflight.ts --cluster devnet --keypair <verified-keypair>
```

**Acceptance criteria:**
- no stale handwritten client discriminator/account code;
- no all-zero program ID or placeholder metadata URI;
- no public-proof-only ETH claims;
- every successful public mint and claim creates a verified Core asset atomically;
- no public/claim allocation overlap or duplicate ID;
- all launch configuration is immutable and authority-gated;
- release artifact and deployed program are provenance-verified;
- devnet smoke run has explicit user approval before broadcast.

---

## Deliberately out of scope until after devnet acceptance

- Mainnet deployment.
- Cloudflare Pages production release.
- Mainnet Irys funding.
- Revoking upgrade authority / permanent immutability.
- Marketplace-specific listing integrations.

These require a separate post-devnet security review and an explicit user approval.
