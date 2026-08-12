# V2 Phase-B Recovery and Descriptor-Pinned Bootstrap Plan

> **For Hermes:** Use `subagent-driven-development` task-by-task only after a separate implementation authorization. This document is a repository-only plan. It does **not** authorize root commands, inspection of the existing candidate directory, candidate-directory creation/removal/rename, keys, endpoints, artifacts, CLI use, sudoers, network/RPC, signing, transactions, deployment, or publishing.

**Goal:** Replace the synthetic Phase-A installer model with a testable descriptor-pinned candidate-bootstrap design and define the separately authorized, fail-closed recovery decision required by the pre-existing candidate root.

**Architecture:** The Phase-A manifest remains a synthetic-model fixture and is never treated as an installation seal. A new release-seal generator will produce a deterministic, complete manifest of actual approved bytes from one pinned Git commit and repository path set. A narrowly scoped, non-shell Rust helper will later operate only through retained directory/file descriptors using Linux `openat2` no-symlink resolution; it copies into fresh root-owned staging and accepts only post-copy staged bytes matching the release seal. The existing `/opt/cumzillaraptors-send-runtime-candidate-v2` is a separate recovery object: it is never reused, removed, or inspected under this plan.

**Tech Stack:** Node.js ESM + `node:test` for deterministic seal generation and parser tests; Rust stable + Linux `openat2`/`openat`/`fstat`/`renameat2` for the future narrowly scoped helper; Git object access only in repository tests; SHA-256; no shell implementation.

---

## Non-negotiable authorization boundary

### Allowed by a future implementation authorization for this plan

- repository code, tests, documentation, and local offline test fixtures;
- generated release-seal fixture data from the checked-out, pinned repository commit;
- unprivileged temporary-directory tests and fake syscall/process adapters;
- compile/test of a helper against synthetic temporary trees only.

### Explicitly not authorized by this plan

- any command as root or via sudo;
- any filesystem read, metadata inspection, traversal, content hash, rename, deletion, chmod, or creation below `/opt/cumzillaraptors-send-runtime-candidate-v2`;
- any access below `/root`, including endpoint, authority, authorization, or key paths;
- touching `/opt/cumzillaraptors-deploy-runtime`, `/opt/cumzillaraptors-approved-artifact`, or the Solana CLI;
- any network, Devnet, RPC, signing, serialization, broadcast, deployment, or `--prepare` launch;
- installing the later helper, executing it with privileges, or changing sudoers.

### Known Phase-B state

The one authorized metadata preflight established only:

| Path | Observed state | Meaning |
|---|---|---|
| `/opt/cumzillaraptors-send-runtime-candidate-v2` | root-owned directory, mode `0700`, already present | **Hard create-once blocker. Do not inspect or reuse.** |
| `/opt/cumzillaraptors-send-runtime-candidate-v2/staging` | absent | Does not clear parent blocker. |
| `/opt/.candidate-temp` | absent | Does not clear parent blocker. |
| `/opt/cumzillaraptors-deploy-runtime` | root-owned directory, mode `0700` | Observation-only; never modify or source from it. |

A later recovery decision must choose exactly one of four paths: **preserve indefinitely**, **forensic read-only inspection**, **quarantine**, or **removal**. Each path requires its own new explicit authorization. None may permit reuse as an installation destination. This plan intentionally supplies **no host command** for any choice.

---

## Fixed implementation facts

- Blocked legacy candidate path (permanently excluded from all helper constants and destination choices): `/opt/cumzillaraptors-send-runtime-candidate-v2`.
- Future candidate destination: a **new, distinct, fixed versioned `/opt` path** selected only in a later recovery authorization. Until that authorization, no destination constant exists.
- Active runtime (permanently excluded): `/opt/cumzillaraptors-deploy-runtime`.
- Phase-A synthetic manifest: `scripts/cumzinstall-v2-root-runtime-candidate.manifest`; it is test fixture data, **not a release seal**.
- Pinned source revision must be an immutable full commit object ID, recorded in the release seal. Branches, tags, `$PWD`, and caller arguments are never authority.
- A seal is an ordered, unique list of repository-relative regular-file paths and SHA-256 byte digests. It includes every runtime-executed source and its production dependencies, but excludes tests unless a test file is intentionally part of the runtime artifact.
- The helper accepts no arguments, ignores inherited environment, performs no network activity, and contains no key, endpoint, artifact, Solana CLI, signing, transaction, deployment, or send path.

---

## Task 1: Freeze the production artifact boundary separately from the synthetic model

**Objective:** Make it mechanically impossible for future code or reviewers to mistake synthetic fixture hashes for hashes of published runtime bytes.

**Files:**
- Create: `docs/operations/v2-phase-b-release-seal-format.md`
- Modify: `docs/operations/cumzinstall-v2-root-runtime-candidate-interface.md`
- Modify: `tests/cumzinstall-v2-root-runtime-candidate.test.mjs`

**Step 1 — RED test:** Add `phase-a-manifest-is-explicitly-synthetic-and-not-a-release-seal`. It must fail until the interface and new format document state both: (a) synthetic hashes derive from labeled fixture text; (b) a production seal is a distinct format containing a full pinned commit ID and actual-byte digests.

Run: `node --test tests/cumzinstall-v2-root-runtime-candidate.test.mjs`

Expected: FAIL because the production release-seal document does not exist.

**Step 2 — minimal documentation:** Define an exact `cumzillaraptors-v2-release-seal-v1` grammar:

```text
format: cumzillaraptors-v2-release-seal-v1
repository: cumzillaraptor/cumzillaraptor
commit: <40-or-64-hex immutable full commit id>
entry: <sha256-64-lowercase-hex> <repository-relative-regular-file-path>
```

Specify byte-sort ordering by UTF-8 path, unique entries, LF line endings, no comments, no blank lines, no symlink entries, and an explicit artifact allowlist. State that the synthetic model manifest cannot be supplied to any privileged helper.

**Step 3 — GREEN:** Update the interface and pass the focused test.

**Step 4 — commit (only after separate commit authorization):** `docs: distinguish synthetic model and v2 release seal`.

---

## Task 2a: Validate a pinned commit and artifact allowlist

**Objective:** Validate one immutable commit identifier and a complete regular-file allowlist before any Git blob is read; actual-byte hashing is deferred to Task 2b.

**Files:**
- Create: `scripts/v2-release-seal.mjs`
- Create: `tests/v2-release-seal.test.mjs`
- Create: `fixtures/v2-release-seal/approved-paths.txt`
- Create: `fixtures/v2-release-seal/expected-release-seal.txt`

**Step 1 — RED tests:** Use a temporary Git repository fixture containing two commits. Add named tests:

- `release-seal-requires-a-full-pinned-commit-id`;
- `release-seal-rejects-branch-tag-and-working-tree-inputs`;
- `release-seal-rejects-extra-missing-duplicate-and-symlinked-allowlist-entries`.

This task stops after commit/allowlist validation; it does not read or hash a blob.

No test may read the real `/opt` or `/root` trees, call the network, or invoke privileged commands.

Run: `node --test tests/v2-release-seal.test.mjs`

Expected: FAIL because `v2-release-seal.mjs` does not exist.

**Step 2 — minimal implementation:** Export pure functions that:

1. validate the strict seal grammar and relative allowlist;
2. resolve an explicitly supplied full commit only in the local fixture Git object database;
3. reject submodules, symlinks, directories, and absent allowlist entries before any seal generation.

Do not obtain or hash blobs in this task.

The production invocation interface must be no-argument/fixed-constant only. The fixture CLI, if any, must be test-only and must not become a privileged entry point.

**Step 3 — GREEN:** Run the focused test and `git diff --check`.

**Step 4 — commit (only after separate commit authorization):** `feat: validate v2 release seal inputs`.

---

## Task 2b: Hash pinned blobs and serialize the canonical release seal

**Objective:** Produce the canonical actual-byte seal only from Task 2a’s validated local commit and allowlist.

**Files:**
- Modify: `scripts/v2-release-seal.mjs`
- Modify: `tests/v2-release-seal.test.mjs`
- Create: `fixtures/v2-release-seal/expected-release-seal.txt`

**Step 1 — RED tests:** Add `release-seal-sorts-and-hashes-pinned-regular-file-blob-bytes` and `release-seal-changes-when-approved-byte-content-changes`. Both must use only the temporary Git fixture and prove working-tree edits do not affect a pinned-commit seal.

Run: `node --test tests/v2-release-seal.test.mjs`

Expected: FAIL because pinned blob hashing and canonical serialization do not exist.

**Step 2 — minimal implementation:** Read only validated regular-file blobs from the pinned local commit, SHA-256 their exact bytes, byte-sort the paths, and serialize the Task 1 LF grammar. Compare result exactly to `expected-release-seal.txt`. Do not expose a production CLI.

**Step 3 — GREEN:** Run the focused test and `git diff --check`.

**Step 4 — commit (only after separate commit authorization):** `feat: generate canonical v2 release seal`.

---

## Task 3: Specify and test the descriptor-pinned helper API before privileged code

**Objective:** Freeze the minimal syscall-level contract required to move only seal-verified bytes into fresh staging, while making no claim that a shell pathname sequence is race-safe.

**Files:**
- Create: `docs/operations/v2-descriptor-pinned-bootstrap-contract.md`
- Create: `tests/v2-descriptor-pinned-bootstrap-contract.test.mjs`
- Modify: `docs/operations/cumzinstall-v2-root-runtime-candidate-interface.md`

**Step 1 — RED tests:** Add static contract tests requiring literal statements for:

- Linux `openat2` with `RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS` (or a documented fail-closed refusal where unavailable);
- retained directory descriptors for every component after `/` and descriptor-relative opens only;
- `O_NOFOLLOW`, `fstat`, and regular-file requirements for every source and staged artifact;
- copy from already-open source file descriptor to newly created staged file descriptor;
- SHA-256 verification of staged bytes after copy and before any execution/install;
- root-only/no-argument gate before source/destination interaction;
- a real fixed installer-stage pathname which is currently **not decided**;
- no `system`, `execve` of checkout source, shell, PATH lookup, fallback, retry, network, secrets, or Solana capability.

Run: `node --test tests/v2-descriptor-pinned-bootstrap-contract.test.mjs`

Expected: FAIL because the contract document does not exist.

**Step 2 — minimal documentation:** Specify a Rust helper API returning typed refusals only; require a compile-time fixed source-root descriptor acquisition path and fixed future staging/destination constants. The document must state that the helper cannot run until both (1) an immutable release seal has been published and (2) a later host-specific staging path has independently been approved.

**Step 3 — GREEN:** Run the focused contract test.

**Step 4 — commit (only after separate commit authorization):** `docs: specify descriptor-pinned v2 bootstrap contract`.

---

## Task 4a: Implement fail-closed descriptor acquisition and source validation

**Objective:** Build only retained descriptor acquisition and source validation against synthetic temporary trees; copy and post-hash are deferred to Task 4b.

**Files:**
- Create: `tools/v2_descriptor_pinned_bootstrap/Cargo.toml`
- Create: `tools/v2_descriptor_pinned_bootstrap/src/lib.rs`
- Create: `tools/v2_descriptor_pinned_bootstrap/tests/bootstrap_refusal.rs`
- Create: `tools/v2_descriptor_pinned_bootstrap/README.md`

**Step 1 — RED tests:** Build a temporary-tree fake adapter suite covering:

- non-root and non-empty argv deny before any source/destination open;
- unavailable `openat2` denies rather than falling back to pathname traversal;
- symlinked source component or source file denies;
- output does not contain paths to secrets, content bytes, endpoints, or credentials;
- no subprocess spawn, retry, or network.

Stage/destination creation, copy, and post-hash are deferred to Task 4b.

Run: `cargo test --manifest-path tools/v2_descriptor_pinned_bootstrap/Cargo.toml`

Expected: FAIL before helper code exists.

**Step 2 — minimal implementation:** Implement only retained descriptor acquisition, `openat2` availability refusal, `O_NOFOLLOW`/`fstat` regular-file validation, and typed refusal records. Do not copy, create a destination, spawn a process, or implement a root executable.

**Step 3 — GREEN:** Run `cargo fmt --check`, `cargo clippy -- -D warnings`, and the focused Rust tests.

**Step 4 — independent review:** Review for any pathname re-resolution, symlink follow, fallback, or implicit inherited descriptor/environment use. Any finding creates a regression test before repair.

**Step 5 — commit (only after separate commit authorization):** `feat: add descriptor-pinned source validation`.

---

## Task 4b: Add synthetic staged-copy and post-hash refusal semantics

**Objective:** Extend Task 4a only with descriptor-to-descriptor copy into a new synthetic stage and post-copy release-seal verification.

**Files:**
- Modify: `tools/v2_descriptor_pinned_bootstrap/src/lib.rs`
- Modify: `tools/v2_descriptor_pinned_bootstrap/tests/bootstrap_refusal.rs`

**Step 1 — RED tests:** Add `changed-source-cannot-pass-without-postcopy-seal-match`, `preexisting-stage-or-destination-denies-without-reuse`, and `copy-uses-a-fresh-synthetic-approved-parent`. Assert no deletion, rename, subprocess spawn, retry, network, or secret-bearing output.

Run: `cargo test --manifest-path tools/v2_descriptor_pinned_bootstrap/Cargo.toml --test bootstrap_refusal`

Expected: FAIL because copy/post-hash behavior does not exist.

**Step 2 — minimal implementation:** Copy only from the already-open source descriptor to a newly created synthetic stage descriptor, then SHA-256 and compare staged bytes to the release seal. Return a typed refusal on every mismatch. Do not add a destination rename, root executable, installer, or Solana capability.

**Step 3 — GREEN:** Run `cargo fmt --check`, `cargo clippy -- -D warnings`, and the focused Rust test.

**Step 4 — independent review:** Review staged-byte verification order, no reuse, and absence of subprocess/network/host-path capability. Add a regression test for every finding.

**Step 5 — commit (only after separate commit authorization):** `feat: add staged post-hash verification model`.

---

## Task 5: Write the host recovery decision plan—without inspecting the existing candidate root

**Objective:** Produce a decision-only runbook for the existing candidate root so a later host authorization can be precise, minimal, and fail-closed.

**Files:**
- Create: `docs/operations/v2-candidate-root-recovery-decision.md`
- Create: `tests/v2-candidate-root-recovery-decision.test.mjs`

**Step 1 — RED test:** Require the runbook to state all of the following:

- the observed pre-existing candidate root is a blocker and never a reusable staging/destination path;
- no host command is included in the document;
- exactly four—and only four—later branches are named and each requires fresh explicit authorization: `preserve-indefinitely`, `forensic-read-only-inspection`, `quarantine`, and `removal`;
- every branch maintains the active runtime exclusion;
- the plan forbids broad `/opt` traversal and any `/root` inspection unless separately authorized;
- a later installation chooses a **new fixed candidate version path**, not the existing path, only after a new release-seal/descriptor-helper review.

Run: `node --test tests/v2-candidate-root-recovery-decision.test.mjs`

Expected: FAIL because the runbook does not exist.

**Step 2 — minimal documentation:** Record only authorized evidence already observed, enumerate the four decisions, and identify their future evidence requirements. No operational commands, cleanup recommendations, or implied removal permission.

**Step 3 — GREEN:** Run the focused test.

**Step 4 — commit (only after separate commit authorization):** `docs: add candidate root recovery decision gate`.

---

## Task 6: Final repository-only integration gate

**Objective:** Prove that future Phase-B work is correctly constrained, reproducible, and still cannot reach runtime, secrets, network, or transaction capabilities.

**Files:**
- Create: `tests/v2-phase-b-release-safety.test.mjs`
- Modify: `docs/plans/2026-08-11-v2-root-runtime-candidate-implementation.md` (replace its Phase-B placeholder with a reference to this plan; preserve its existing Phase-A history)

**Step 1 — RED test:** Require exact references to the release seal, descriptor-pinned contract, helper test suite, recovery decision, no-reuse rule, and the separately authorized later host gate. Reject production use of `cumzinstall-v2-root-runtime-candidate.manifest`.

**Step 2 — implementation:** Add a source audit that fails if any Phase-B repository source contains a shell bootstrap, `/root` read, network API, Solana CLI invocation, key/endpoint path access, `--send`, signing, transaction serialization, deployment, package manager, generic sudo invocation, or candidate-root host mutation.

**Step 3 — verification:**

```text
node --test tests/v2-release-seal.test.mjs tests/v2-descriptor-pinned-bootstrap-contract.test.mjs tests/v2-candidate-root-recovery-decision.test.mjs tests/v2-phase-b-release-safety.test.mjs
cargo test --manifest-path tools/v2_descriptor_pinned_bootstrap/Cargo.toml
npm test
git diff --check
```

Expected: all focused and full offline tests pass; no host action; the two existing unrelated untracked v3 files remain excluded from any commit.

**Step 4 — independent review:** A reviewer must approve spec compliance first, then code quality/security. The reviewer must explicitly check release-seal bytes, descriptor behavior, no fallback, no-reuse, and no host/secret/network/transaction reachability.

**Step 5 — commit/publish:** Only after a new explicit commit/publish authorization, commit exactly the reviewed files. Publishing source still does not authorize host recovery, candidate installation, or `--prepare` execution.

---

## Mandatory later gates (not authorized here)

1. **Revision gate:** independently review the published release seal and descriptor helper against a specific immutable commit and release artifact.
2. **Recovery authorization gate:** select exactly one treatment for the existing candidate root. No selection is implied by this plan.
3. **Fresh preflight gate:** after recovery decision evidence, verify a newly chosen fixed candidate destination is absent and no forbidden path is used.
4. **Privileged bootstrap authorization gate:** only then consider a host-specific bootstrap implementation and execution. It must have a fixed new staging path, root-only/no-argument contract, pinned helper/manifest hashes, descriptor-only operations, actual-root testing strategy, and an independent security review.
5. **Prepare review gate:** candidate installation, if ever successful, authorizes only a newly reviewed unsigned `--prepare` validation. It never authorizes send, keys, endpoint access, CLI use, signing, deployment, or a launch action.

## Acceptance criteria

- Synthetic Phase-A fixture hashes and actual release seals are unambiguously distinct and mechanically tested.
- Actual release bytes can be reproduced from an immutable commit and exact allowlist.
- The helper design fails closed without Linux descriptor-safe operations and has no shell/pathname fallback.
- Existing candidate root is treated as an immutable blocker until a separate recovery choice is authorized.
- No current or planned repository task accesses host runtime paths, secrets, network, or blockchain capabilities.
- All code tasks use RED → GREEN tests, focused verification, independent spec/security review, and only separately authorized commits.
