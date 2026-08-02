# Superseded Historical Plan — Task 7 Anchor 1.x CI Recovery

> **Status:** Historical planning record only. It describes the 2026-08-01 Anchor 1.1.2 migration proposal and baseline at that time; it is superseded by the repository's current Anchor 0.32 policy and current `main` revision.
>
> **For Hermes:** Use `subagent-driven-development` only after the user explicitly approves execution. Work one task at a time, with a spec review and code-quality review before each commit.

**Goal:** Produce a reproducible x86_64 SBPF artifact for the existing Task 7 collection-creation CPI, validate its behavior against the current source revision, and only then prepare (not perform) the devnet collection creation flow.

**Architecture:** Preserve Task 7’s security policy and migrate the build environment from Anchor 0.30.1 to current stable Anchor 1.x. The migration occurs on a dedicated branch, beginning with host-side compile checks and followed by the GitHub Actions SBPF build. Task 7’s existing collection setup policy remains unchanged: config PDA as update authority, 500 bp royalties, 100% of royalties to `FiHKQhwq2ZKkD2bBf3mPYgyw2Y9QDzNYykpMGErovU6`.

**Tech stack:** Rust/Anchor 1.1.2, Metaplex Core 0.12.1, Solana platform-tools v1.50, GitHub Actions x86_64 runner, Node 20, solana-bankrun, existing Irys metadata staging scripts.

**Current verified baseline (2026-08-01):**
- Clean `main` is commit `54b8b2d`.
- Task 7 source and its no-send metadata checks exist.
- `node --test tests/core-collection.test.mjs tests/final-metadata-stage.test.mjs tests/irys-upload-dry-run.test.mjs` passed: 9/9.
- No deployable `cumzillaraptors.so` has been produced.
- No devnet collection has been created and no live transaction is authorized by this plan.

---

## Non-negotiable safety rules

1. Begin from clean `main` at `54b8b2d`; create a branch (for example `chore/anchor-1-task7-build`) before editing.
2. Do not use `git reset --hard`, `git clean`, force-push, deploy, sign, send a transaction, fund an account, or modify a GitHub secret as part of this plan.
3. Never print, paste, commit, or copy the launch-authority private-key JSON. CI may receive it only through `CUMZ_DEVNET_LAUNCH_AUTHORITY_KEYPAIR_JSON`.
4. Keep the Task 7 policy fixed unless the user explicitly changes it:
   - collection program: Metaplex Core (`mpl_core::ID`)
   - update authority: config PDA
   - royalty rate: 500 basis points
   - royalty recipient: `FiHKQhwq2ZKkD2bBf3mPYgyw2Y9QDzNYykpMGErovU6`
5. A successful SBPF build and Bankrun gate are prerequisites for asking for devnet-creation approval. They are not permission to create a collection.

---

### Task 1: Capture a clean migration baseline

**Objective:** Ensure every subsequent failure can be attributed to the Anchor migration, not stale files, stale artifacts, or an unknown revision.

**Files:**
- Create: no production files
- Verify: repository root, `programs/cumzillaraptors/Cargo.toml`, `.github/workflows/build-program.yml`

**Step 1: Confirm branch and clean working tree.**

Run:
```bash
git switch main
git pull --ff-only origin main
git status --short
git rev-parse HEAD
```

Expected:
- no status output
- HEAD is `54b8b2d0fa5dba4f4a7bb5866bdd2532689c7658` unless a deliberately reviewed change has landed first.

**Step 2: Create the isolated migration branch.**

Run:
```bash
git switch -c chore/anchor-1-task7-build
```

Expected: branch created; no source changes yet.

**Step 3: Run the known source-level Task 7 baseline.**

Run:
```bash
node --test \
  tests/core-collection.test.mjs \
  tests/final-metadata-stage.test.mjs \
  tests/irys-upload-dry-run.test.mjs
```

Expected: 9 passing, 0 failing.

**Step 4: Record the already-observed CI failure without a new run.**

Use the existing failed workflow log for commit `54b8b2d`; retain the relevant error lines in the execution notes. Do not push this branch or dispatch a workflow merely to reproduce a known failure.

Expected: the existing Anchor 0.30.1 + platform-tools v1.50 failure is the documented `core::panic` incompatibility.

**Step 5: Commit:** none. This is a baseline gate only.

---

### Task 2: Add regression tests that define the Anchor 1.x migration contract

**Objective:** Make the dependency/toolchain migration testable without weakening Task 7’s policy or its existing gates.

**Files:**
- Modify: `tests/core-cpi-shape.test.mjs`
- Modify: `tests/core-collection.test.mjs` only if a new source-contract assertion is needed
- Test: the same files

**Step 1: Write failing manifest assertions.**

Replace the old Anchor 0.30.1 / mpl-core 0.7.2 pin assertion with the intended current dependency contract:

```js
assert.match(manifest, /anchor-lang\s*=\s*\{\s*version\s*=\s*"1\.1\.2"\s*\}/);
assert.match(
  manifest,
  /mpl-core\s*=\s*\{[^\n]*version\s*=\s*"0\.12\.1"[^\n]*default-features\s*=\s*false[^\n]*features\s*=\s*\[[^\]]*"anchor"/m,
);
```

Add a test that asserts the program still has `setup_collection`, binds update authority to config, sets `ROYALTY_BASIS_POINTS` to 500, and contains the approved treasury address.

**Step 2: Run the focused test and verify failure.**

Run:
```bash
node --test tests/core-cpi-shape.test.mjs tests/core-collection.test.mjs
```

Expected: failure because the current manifest still names Anchor 0.30.1 and mpl-core 0.7.2.

**Step 3: Do not alter source implementation yet.**

The red test is the migration contract. Review its regular expressions to ensure they do not accidentally allow default `mpl-core` features (which would enable the incompatible `borsh-v1` feature).

**Step 4: Commit the test-only change.**

```bash
git add tests/core-cpi-shape.test.mjs tests/core-collection.test.mjs
git commit -m "test: define Anchor 1 Task 7 migration contract"
```

---

### Task 3: Upgrade dependencies and resolve the lockfile deterministically

**Objective:** Move the program to current Anchor while preventing the known mpl-core `borsh-v1`/Anchor Borsh conflict.

**Files:**
- Modify: `programs/cumzillaraptors/Cargo.toml`
- Modify: `Anchor.toml`
- Modify: `programs/cumzillaraptors/Cargo.lock`

**Step 1: Apply only the dependency/configuration changes.**

Set:

```toml
# programs/cumzillaraptors/Cargo.toml
anchor-lang = { version = "1.1.2" }
mpl-core = { version = "0.12.1", default-features = false, features = ["anchor"] }
```

Remove the old `init-if-needed` feature. It is not part of the Anchor 1.x dependency contract.

Set:

```toml
# Anchor.toml
[toolchain]
anchor_version = "1.1.2"
```

**Step 2: Regenerate, do not hand-edit, the lockfile.**

Run from `programs/cumzillaraptors`:

```bash
cargo generate-lockfile
cargo metadata --format-version 1 >/dev/null
```

Expected: `Cargo.lock` parses. The lockfile may be format v4; that is acceptable because the migration uses platform-tools v1.50 rather than Cargo 1.75.

**Step 3: Run the migration-contract tests.**

Run:
```bash
node --test tests/core-cpi-shape.test.mjs tests/core-collection.test.mjs
```

Expected: manifest tests pass. If they fail, correct only the manifest test or manifest declaration; do not change Task 7 policy.

**Step 4: Commit the dependency-only migration.**

```bash
git add programs/cumzillaraptors/Cargo.toml programs/cumzillaraptors/Cargo.lock Anchor.toml
git commit -m "build: upgrade Task 7 program to Anchor 1.1.2"
```

---

### Task 4: Restore Keccak hashing without changing the allocation-hash protocol

**Objective:** Fix the removed Anchor re-export while preserving the existing allocation hash and its known-answer test byte-for-byte.

**Files:**
- Modify: `programs/cumzillaraptors/Cargo.toml`
- Modify: `programs/cumzillaraptors/src/allocation.rs`
- Test: `programs/cumzillaraptors/src/allocation.rs` unit tests

**Step 1: Run host check and verify the expected red error.**

Run:
```bash
cd programs/cumzillaraptors
cargo check
```

Expected: unresolved import for `anchor_lang::solana_program::keccak`.

**Step 2: Select a Solana-compatible Keccak dependency by inspecting its API and output.**

Use a direct Keccak dependency only if it returns the same 32-byte Keccak-256 hash as the previous Solana API. Do **not** substitute SHA-256: the existing allocation manifest protocol is Keccak-based.

**Step 3: Replace only the import/call site.**

Keep `allocation_hash_v1` payload construction unchanged. The expected known-answer bytes in `allocation_hash_matches_independent_js_v1_known_answer` must not change.

**Step 4: Verify the known-answer test passes.**

Run:
```bash
cargo test allocation_hash_matches_independent_js_v1_known_answer --lib
```

Expected: pass with the existing expected `[u8; 32]` value unchanged.

**Step 5: Commit.**

```bash
git add programs/cumzillaraptors/Cargo.toml programs/cumzillaraptors/Cargo.lock programs/cumzillaraptors/src/allocation.rs
git commit -m "fix: preserve Keccak allocation hashing on Anchor 1"
```

---

### Task 5: Adapt Metaplex Core instruction construction to the Anchor 1.x Solana types

**Objective:** Make both Task 7 collection creation and the existing Core asset wrapper compile against mpl-core 0.12.1 without weakening account checks.

**Files:**
- Modify: `programs/cumzillaraptors/src/core.rs`
- Test: Rust unit tests in `programs/cumzillaraptors/src/core.rs`
- Verify: `programs/cumzillaraptors/src/lib.rs`

**Step 1: Run host check and capture the exact type errors.**

Run:
```bash
cd programs/cumzillaraptors
cargo check
```

Expected: mismatched `Pubkey` types in `CreateCollectionV1` and/or `CreateV1` construction because Anchor and mpl-core may expose different Solana type paths.

**Step 2: Write or strengthen a failing Rust test for collection instruction shape.**

Test these invariant properties from `build_collection_cpi_instruction`:
- program id is `mpl_core::ID`
- exactly four accounts
- account 0 is the collection and is a signer/writable
- account 1 is the config PDA and is read-only/non-signer
- account 2 is payer and signer/writable
- account 3 is `system_program::ID`
- royalty policy remains 500 bp, 100% to `PRIMARY_TREASURY`

**Step 3: Add an explicit conversion helper rather than scattering casts.**

If type identities do not unify, introduce one small helper in `core.rs` that converts an Anchor `Pubkey` using its 32-byte representation into the `mpl_core`/Solana type expected by the generated instruction. Use it in both `CreateCollectionV1` and `CreateV1` builders. Do not change account metas, signers, config-PDA derivation, or royalty arguments.

**Step 4: Verify compile and unit tests.**

Run:
```bash
cargo check
cargo test --lib core::tests
```

Expected: no errors; all Core policy and instruction-shape tests pass.

**Step 5: Commit.**

```bash
git add programs/cumzillaraptors/src/core.rs
git commit -m "fix: adapt Core CPI builders for Anchor 1"
```

---

### Task 6: Update CI only after host checks are green

**Objective:** Use a current SBPF toolchain that can parse modern dependencies and is compatible with Anchor 1.x.

**Files:**
- Modify: `.github/workflows/build-program.yml`
- Test: workflow review plus GitHub Actions run

**Step 1: Write a source-level failing workflow assertion (or extend existing test).**

Assert the workflow has all of the following:
- manual `workflow_dispatch`
- x86_64 GitHub runner
- explicit Solana 1.18.26 x86_64 tarball install
- `cargo-build-sbf --tools-version v1.50 --arch sbfv2`
- revision marker beside the built `.so`
- Task 5 and Task 7 Bankrun gates guarded by the existing GitHub secret presence
- artifact upload restricted to `.so` and revision marker

**Step 2: Change the workflow display/comment text to match its actual behavior.**

The current command is already v1.50, but it must be documented as the intentional Anchor 1.x toolchain, not an accidental remnant of the failed 0.30.1 approach.

**Step 3: Run all local Node source-policy tests.**

Run:
```bash
node --test \
  tests/core-cpi-shape.test.mjs \
  tests/core-collection.test.mjs \
  tests/final-metadata-stage.test.mjs \
  tests/irys-upload-dry-run.test.mjs
```

Expected: all pass.

**Step 4: Commit.**

```bash
git add .github/workflows/build-program.yml tests/
git commit -m "ci: build Anchor 1 Task 7 program on x86 SBPF"
```

---

### Task 7: Full local verification before any push

**Objective:** Prevent another remote CI iteration on a source tree that already fails locally.

**Files:**
- Modify: none unless a test reveals a real migration bug

**Step 1: Verify clean, reviewable diff.**

Run:
```bash
git status --short
git log --oneline main..HEAD
git diff main...HEAD --check
```

Expected: only intentional migration commits; no whitespace errors; no secret material.

**Step 2: Run Rust host validation.**

Run:
```bash
cd programs/cumzillaraptors
cargo check --locked
cargo test --lib
```

Expected: pass. Warnings from legacy Anchor cfg values must be separately classified; new errors are blocking.

**Step 3: Run Task 7 source/metadata tests.**

Run from repository root:
```bash
node --test \
  tests/core-cpi-shape.test.mjs \
  tests/core-collection.test.mjs \
  tests/final-metadata-stage.test.mjs \
  tests/irys-upload-dry-run.test.mjs
```

Expected: all pass.

**Step 4: Security review.**

Check that no added file contains a private key or a secret value:

```bash
git diff main...HEAD | grep '^+' | grep -iE '(^\+.*(secret|private.?key|keypair).*=|\[[0-9]{1,3}(,[0-9]{1,3}){20,}\])' || true
```

Expected: no keypair JSON, no credentials. A public key / secret variable name is acceptable.

**Step 5: Independent review gate.**

Use two independent reviews before pushing:
1. specification/security review: confirm policy invariants and no unauthorized transaction path
2. code-quality review: confirm migration is minimal and conversions are not duplicated

**Step 6: Stop for user approval before pushing.**

Present the commit list, all local test output, and the exact GitHub Actions workflow change. Do not push or dispatch CI until the user says to proceed.

---

### Task 8: One controlled GitHub Actions build and artifact verification

**Objective:** Prove an x86_64 SBPF artifact corresponds exactly to the reviewed migration revision.

**Files:**
- Modify: none
- Verify: GitHub Actions run and downloadable artifact

**Step 1: Push only the reviewed branch.**

Do not merge to `main` yet.

**Step 2: Dispatch one manual `Build Solana Program` run for the branch.**

Expected: successful SBPF build, then Task 5 and Task 7 Bankrun gates when the GitHub secret is configured.

**Step 3: Verify the workflow evidence.**

Require:
- build succeeds
- `.so` artifact exists
- revision marker equals the branch commit SHA
- Task 5 Bankrun initialization gate passes
- Task 7 Bankrun collection guard gate passes
- artifact SHA-256 is recorded from the workflow log

**Step 4: If CI fails, stop after the first error.**

Do not change dependency versions speculatively. Record the exact compiler error, determine whether it is a source migration issue or toolchain issue, then write a one-step follow-up before changing code.

**Step 5: Stop for user approval before merge.**

A green artifact is evidence for merge readiness, not permission to merge.

---

### Task 9: Merge and prepare the devnet collection creation approval packet

**Objective:** Make Task 7 ready for a separately approved, reversible-as-possible devnet action without performing it.

**Files:**
- Create: `docs/task-7-devnet-approval.md` (or a dated approval record)
- Verify: `scripts/create-devnet-collection.mjs`, `scripts/verify-core-collection.mjs`

**Step 1: Merge only after explicit approval.**

Use a normal merge or reviewed fast-forward. No force-push.

**Step 2: Build the approval packet.**

Include:
- Git commit SHA and SBPF artifact SHA-256
- deployed program ID: `2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2`
- expected launch authority public key: `71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r`
- expected Core program ID
- proposed fresh collection public key
- collection metadata Arweave URI
- config PDA
- update authority = config PDA
- royalty policy = 500 bp to approved treasury
- expected signer and maximum expected SOL cost, obtained from a dry run only

**Step 3: Run dry-run commands only.**

Run:
```bash
node scripts/create-devnet-collection.mjs --dry-run
node scripts/verify-core-collection.mjs --help
```

Expected: no signing, no send, no keypair parsing in dry-run mode.

**Step 4: Request a separate explicit approval.**

The request must name the collection address, signer public key, exact expected cost, and intended devnet action. Do not execute the live script unless the user explicitly approves that exact transaction.

---

## Acceptance criteria

- Anchor 1.1.2 and mpl-core 0.12.1 compile under the intended SBPF CI toolchain.
- Existing Keccak allocation-hash known answer is unchanged.
- Task 7 always binds Core update authority to the config PDA.
- Task 7 royalties remain 500 bp and route 100% to the approved treasury.
- An x86_64 SBPF `.so` artifact is tied to its source SHA and passes Task 5 + Task 7 gated Bankrun checks.
- No devnet collection, deployment, signing, payment, secret change, or main merge occurs without a separate explicit approval.

## Explicit non-goals

- Do not alter supply (420), sale split (247 public / 173 claim), Merkle scheme, pricing, treasury, or royalty policy.
- Do not deploy or create the devnet collection in the build-recovery work.
- Do not attempt another Anchor 0.30.1 lockfile pinning campaign.
- Do not touch the GitHub keypair secret unless a separately approved key-rotation task is opened.
