# V2 Root-Runtime Candidate Implementation Plan

> **For Hermes:** This is an implementation plan only. It does **not** authorize candidate-directory creation, root commands, sudoers changes, CLI installation, artifact/key copying, endpoint configuration, key access, network/RPC calls, signing, transaction serialization, broadcast, deployment, or any launch action.

**Goal:** Specify a TDD sequence for a future root-owned **prepare-only candidate runtime** that can verify its own root-controlled provenance and run only an unsigned review through injected/fake adapters.

**Architecture:** The future candidate is a distinct root-controlled runtime at `/opt/cumzillaraptors-send-runtime-candidate-v2`, never a replacement for `/opt/cumzillaraptors-deploy-runtime`. Repository code first models the candidate boundary using synthetic metadata, temporary unprivileged fixtures, and fake adapters. A later separately approved privileged bootstrap may install it. The candidate exposes `--prepare` only; it must not create a `--send` operation, send sudo rule, authorization record, key read, or CLI invocation.

**Tech Stack:** Node.js ESM, POSIX shell only for a later fixed root installer, SHA-256 manifests, existing pure v2 schema/approval/CLI/nonce modules, `node:test`.

**Prerequisites:**
- Published pure v2 contract implementation: `60a693da5b84e48726c7b4660f7804b1bf858e61`.
- Published contract: `docs/plans/2026-08-11-send-gate-v2-contract-reconciliation.md`.
- Root-runtime candidate path is exactly `/opt/cumzillaraptors-send-runtime-candidate-v2`.

---

## Absolute scope boundary

This plan has two phases.

### Phase A — repository-only implementation

Allowed after separate authorization:
- tests, source, documentation, and commits in the repository;
- unprivileged temporary-directory harnesses and fake adapters;
- deterministic hash/metadata fixtures;
- no-network default tests.

Forbidden:
- access to `/opt`, `/root`, `/usr/local`, deployed runtime files, sudoers, real keypairs, real artifacts, real endpoint files, or the Solana CLI;
- `--send`, signing, transaction serialization, deploy invocation, endpoint connection, or broadcast.

### Phase B — privileged candidate installation

Not authorized by this plan. It requires a new explicit user decision *after* Phase A source is independently approved and published. It is limited to installing a candidate whose only external operator mode is `--prepare`.

### Permanent exclusions

No candidate or later launcher may authorize launch initialization, collection creation, minting, claims, payments, uploads, authority changes, upgrades, mainnet, retries/failover, or any transaction beyond the separately gated future one-program deployment attempt.

---

## Fixed runtime facts and paths

The candidate must use only these fixed paths and deny every alternative:

| Item | Fixed value |
|---|---|
| Candidate root | `/opt/cumzillaraptors-send-runtime-candidate-v2` |
| Active runtime (never replace) | `/opt/cumzillaraptors-deploy-runtime` |
| Candidate source manifest | `/opt/cumzillaraptors-send-runtime-candidate-v2/config/runtime-root-sha256.txt` |
| Candidate dependency manifest | `/opt/cumzillaraptors-send-runtime-candidate-v2/config/node-modules-sha256.txt` |
| Endpoint digest manifest | `/opt/cumzillaraptors-send-runtime-candidate-v2/config/rpc-endpoint-sha256.txt` |
| Endpoint secret pathname | `/root/cumzillaraptors-send-runtime-candidate-v2/config/rpc-endpoint` |
| Artifact | `/opt/cumzillaraptors-approved-artifact/cumzillaraptors.so` |
| Revision marker | `/opt/cumzillaraptors-approved-artifact/cumzillaraptors.build-revision` |
| CLI (future only) | `/opt/cumzillaraptors-solana-cli/v1.18.26/bin/solana` |
| Key root | `/root/cumzillaraptors-deploy-keypairs` |
| Authorization root | `/root/cumzillaraptors-send-authorizations` |
| Reservation root | `/root/cumzillaraptors-send-authorizations/reservations` |
| Durable state root | `/root/cumzillaraptors-send-authorizations/consumed` |

The later candidate runtime root and directory parents must be real root-owned non-symlink directories. Candidate directories: `0700`. Candidate scripts/config/manifests/dependency files: root-owned `0600` unless a fixed executable needs `0500`. The root key root and every parent are `0700`; key files are `0600`. A future installer must validate `/`, `/opt`, candidate parents, key-root parents, and all fixed destination parents before any create/copy/rename.

---

## Task 1: Define the candidate `--prepare` contract as pure data

**Objective:** Add a pure contract module that names the only supported candidate mode and all expected report fields without I/O.

**Files:**
- Create: `scripts/v2-root-runtime-prepare-contract.mjs`
- Create: `tests/v2-root-runtime-prepare-contract.test.mjs`
- Inspect: `scripts/future-send-v2-schema.mjs`, `scripts/future-send-runtime-manifests.mjs`

**Step 1 — RED tests**

Create `makePrepareContract()` fixture returning the literal approved contract; add named tests `prepare-contract-allows-only-literal-prepare`, `prepare-contract-denies-send-and-extra-arguments`, and `prepare-contract-report-is-redacted`. Each denial must equal `Object.freeze({ ok: false, reason: 'invalid-input' })` and satisfy `Object.isFrozen(result) === true`.

Write tests requiring a frozen contract with exactly:

```js
{
  mode: '--prepare',
  candidateRoot: '/opt/cumzillaraptors-send-runtime-candidate-v2',
  commitment: 'confirmed',
  outputFields: ['runtimeManifestSha256', 'endpointOrigin', 'review', 'prepareCompletion'],
  guarantee: 'No deployment command was invoked. No transaction was signed or sent.'
}
```

Require rejection of `--send`, an empty mode, additional arguments, arbitrary artifact/key/endpoint/CLI paths, caller working-directory values, and any report field that could contain endpoint paths/query/userinfo, key material, transaction bytes, or signatures.

Add a static capability test that rejects filesystem, process, child-process, network, Solana SDK, signing, transaction, CLI/deploy, and key APIs in this module.

**Step 2 — run RED**

```bash
node --test tests/v2-root-runtime-prepare-contract.test.mjs
```

Expected: module missing.

**Step 3 — minimal implementation**

Implement a pure parser/validator that accepts only the literal `--prepare` operator mode and returns frozen non-echoing denial values otherwise. It must not construct an argv or expose a send function.

**Step 4 — verify**

Run focused test; expected: pass.

---

## Task 2: Model v2-native root-owned provenance through injected facts

**Objective:** Validate the complete candidate dependency/root source set using only the published v2 pure contract, before anything can execute.

**Files:**
- Create: `scripts/v2-root-runtime-provenance.mjs`
- Create: `tests/v2-root-runtime-provenance.test.mjs`
- Reuse only: `scripts/future-send-v2-schema.mjs` (`V2_PATHS`, `V2_FIXED_FACTS`)

**Non-dependency rule:** Do not import, extend, or treat `future-send-runtime-manifests.mjs` or `future-send-runtime-provenance.mjs` as authoritative. They are older compatibility modules. The v2 schema is the sole source of candidate paths and fixed facts.

**Step 1 — RED tests**

Model a synthetic path graph for:
- candidate root, scripts, config, sealed `node_modules`, and manifests;
- exact candidate `package.json` and `package-lock.json` paths;
- approved artifact + revision marker;
- fixed CLI path;
- endpoint file and endpoint digest manifest;
- reservation/consumed roots as **path constants only**.

The unsigned `--prepare` candidate does **not** load authorization JSON, detached signatures, approver/reviewer keys, or deployment keys. Remove all approval/key-root inputs from this phase. The approved v2 approval verifier is a future send-boundary component and is deliberately not imported by the prepare coordinator.

Define one canonical runtime-manifest JSON record with ordered fields: `formatVersion`, `runtimeRoot`, `runtimeSourceSha256`, `packageJsonSha256`, `packageLockSha256`, `dependencyManifestSha256`, `artifactRevision`, `artifactBytes`, `artifactSha256`, `cliPath`, `cliVersion`, `cliSha256`, `rpcEndpointSha256`, `programId`, `configPda`, `devnetGenesisHash`, `commitment`. Define one dependency-manifest grammar: newline-terminated, lowercase `SHA256  relative/path`, sorted unique relative paths, with mandatory entries for every installed runtime script, test, launcher source, `package.json`, `package-lock.json`, and every sealed dependency-tree file. The runtime manifest must bind the SHA-256 of the complete dependency manifest and the exact package/lock digests.

For every required object, require exact canonical pathname, root UID, type, mode, parent UID/mode/type, non-symlink status, and a source/dependency digest entry. Require a future endpoint digest manifest to match only the digest, never endpoint bytes.

Denial matrix: missing/extra manifest entry, substituted tree file, lockfile/package mismatch, runtime-manifest ↔ dependency-manifest digest mismatch, missing entry, substituted path, symlink, writable parent, weak mode, wrong owner, malformed manifest, duplicate digest entry, stale artifact revision/size/hash, wrong CLI version/hash, wrong Devnet genesis/program/config/commitment, and endpoint root readable by a non-root synthetic actor.

**Concrete fixture/tests**

Create `makeNominalV2Provenance()` using only frozen text/metadata records and add named tests `v2-provenance-accepts-exact-sealed-layout`, `v2-provenance-denies-package-lock-or-tree-substitution`, `v2-provenance-denies-manifest-binding-mismatch`, and `v2-provenance-denies-weak-parent-or-path-substitution`. Every failed evaluation returns exactly frozen `{ ok: false, reason: 'invalid-input' }` or a documented phase-specific non-echoing reason; no synthetic record contains endpoint/key bytes.

**Step 2 — run RED**

```bash
node --test tests/v2-root-runtime-provenance.test.mjs
```

Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `v2-root-runtime-provenance.mjs`.

**Step 3 — minimal implementation**

Implement `evaluateV2RootRuntimeProvenance(injected)` as a pure default-deny evaluator. It may return only frozen sanitized data sufficient for the prepare report (public identifiers and endpoint origin). It must stop before key text, endpoint text, authorization records, staging, CLI, or network access.

**Step 4 — verify**

Run focused tests. Confirm static source scan finds no host I/O, spawn, network, key parsing, signer, transaction, or send API.

---

## Task 3: Build a fake-adapter `--prepare` coordinator

**Objective:** Compose pure v2 contracts with injected review adapters while keeping all actual host/network/key operations outside repository source.

**Files:**
- Create: `scripts/v2-root-runtime-prepare-coordinator.mjs`
- Create: `tests/v2-root-runtime-prepare-coordinator.test.mjs`
- Reuse: `scripts/v2-root-runtime-prepare-contract.mjs`, `scripts/v2-root-runtime-provenance.mjs`

**Unsigned-boundary rule:** The prepare coordinator has no authorization/key inputs and must not import `future-send-v2-approval.mjs`. Approval verification belongs only to a separately planned future send boundary.

**Step 1 — RED tests**

Supply only frozen fake adapters:
- `collectProvenance()` returns synthetic metadata/manifests;
- `readEndpointDigest()` returns a digest only;
- `runUnsignedReview()` returns one canonical review object;
- `sanitizeReport()` emits public facts/origin only.

Require exact mode `--prepare`; provenance validation before adapter review; one canonical JSON envelope; no forwarding raw reviewer stdout; and no adapter named or shaped as `readKey`, `readAuthorization`, `stage`, `spawnCli`, `send`, `sign`, `serialize`, or `network`.

The nominal result must be frozen and exactly shaped:

```js
{
  runtimeManifestSha256: '<digest>',
  endpointOrigin: 'https://host',
  review: { /* unchanged canonical review object */ },
  prepareCompletion: {
    mode: 'FRESH PRE-SIGN REVIEW COMPLETE',
    guarantee: 'No deployment command was invoked. No transaction was signed or sent.'
  }
}
```

Test malformed/concatenated review output, secret-bearing URL strings, wrong genesis, changed artifact identity, endpoint digest mismatch, and any request for `--send` as denial before fake adapter side effects.

**Concrete fixture/tests**

Create `makeNominalPrepareAdapters()` with only frozen adapter return values. Add named tests `prepare-coordinator-emits-one-frozen-envelope`, `prepare-coordinator-denies-send-before-adapter-call`, `prepare-coordinator-denies-malformed-or-concatenated-review-json`, and `prepare-coordinator-redacts-endpoint-and-error-text`. Denials equal frozen `{ ok: false, reason: 'invalid-input' }`; spy counters prove invalid mode invokes no adapter.

**Step 2 — run RED**

```bash
node --test tests/v2-root-runtime-prepare-coordinator.test.mjs
```

Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `v2-root-runtime-prepare-coordinator.mjs`.

**Step 3 — minimal implementation**

Implement only an injected-adapter coordinator. It must never import `fs`, `child_process`, networking, Solana, or production reviewer/executor modules; do not use dynamic imports. Its exported surface has no operation that could be mistaken for a send executor.

**Step 4 — verify**

Run focused test and static capability test.

---

## Task 4: Specify a fixed candidate installer and unprivileged semantic harness

**Objective:** Write and test the repository candidate installer source without running it as root or installing it.

**Files:**
- Create: `docs/operations/cumzinstall-v2-root-runtime-candidate-interface.md`
- Create: `scripts/cumzinstall-v2-root-runtime-candidate.manifest`
- Create: `tests/cumzinstall-v2-root-runtime-candidate.test.mjs`
- Create: `tests/cumzinstall-v2-root-runtime-candidate-harness.mjs`
- Deferred to a separately reviewed privileged-helper plan: `scripts/cumzinstall-v2-root-runtime-candidate.sh`

**Step 1 — RED tests**

Phase A does **not** implement a privileged installer. It produces only a static installer-interface specification plus an unprivileged semantic model. A later installer design is blocked until a dedicated reviewed descriptor-relative/no-follow staging helper exists; pathname `stat`/hash/copy/re-hash alone is not race-safe.

Require a candidate installer specification that states a later root implementation must:
- reject non-root before argument parsing/source hashing/filesystem changes;
- reject every argument;
- use fixed absolute source/destination paths and fixed SHA-256 values only;
- use descriptor-pinned, no-follow staging primitives with post-open byte hashing—not a shell pathname check/copy sequence;
- start from a fresh create-once stage directory and reject existing/symlink stage;
- validate every parent directory before staging/copy/temp/rename;
- install a sealed dependency tree plus exact `package.json`, `package-lock.json`, source/dependency manifests, tests, and a **prepare-only** launcher source;
- bind runtime manifest to package/lock/dependency-manifest digests, and reject missing/extra tree entries or substituted tree bytes;
- not access keys, artifact bytes, endpoint bytes, authorization records, Solana CLI, or network;
- leave no send launcher, no send sudoers rule, and no active-runtime replacement.

The unprivileged harness models hostile `PATH`, source/stage symlinks, post-copy tamper, unsafe parent, pre-existing candidate, dependency substitution, lockfile mismatch, and staged-only execution. It must clearly label its race checks as a model; the later helper test must exercise the actual descriptor-pinning primitive before root installation is considered.

**Step 2 — run RED**

```bash
node --test tests/cumzinstall-v2-root-runtime-candidate.test.mjs
node --test tests/cumzinstall-v2-root-runtime-candidate-harness.mjs
```

Expected: missing files/tests fail before any installer implementation exists.

**Step 3 — implementation**

Write only the static installer-interface document, immutable manifest grammar, and unprivileged semantic harness. Do **not** create a root installer script in Phase A. The future helper/installer design must specify absolute utility paths, safe rebuilt environment, cleanup behavior, descriptor-relative no-follow opens, post-open hashing, and atomic destination semantics before code exists.

**Step 4 — verify locally only**

Run documentation/static tests and the unprivileged semantic harness. Do not run an installer as root or create the candidate root in this phase.

---

## Task 5: Define the later root `--prepare` launcher boundary

**Objective:** Specify a fixed root-owned launcher that may only invoke the candidate `--prepare` mode after a later authorized install.

**Files:**
- Create: `scripts/cumzdeploy-v2-prepare-launcher.sh`
- Create: `tests/cumzdeploy-v2-prepare-launcher.test.mjs`
- Modify later only under a separate host-install decision: `/usr/local/sbin/cumzdeploy-executor`, `/etc/sudoers.d/cumzdeploy-executor`

**Step 1 — RED tests**

Require the repository launcher candidate to:
- require root and accept exactly `--prepare`, no other argument;
- invoke exactly this literal three-token argv with no shell evaluation: `['/usr/bin/node', '/opt/cumzillaraptors-send-runtime-candidate-v2/scripts/v2-root-runtime-prepare-coordinator.mjs', '--prepare']`;
- use fixed candidate working directory `/opt/cumzillaraptors-send-runtime-candidate-v2`, `stdin` from `/dev/null`, and no caller CWD/PATH;
- rebuild environment with `env -i`, exactly `PATH=/usr/sbin:/usr/bin:/sbin:/bin`, `LC_ALL=C`, and a fixed non-secret `HOME=/nonexistent`; reject inherited environment-derived configuration;
- emit exactly one newline-terminated JSON object to stdout; bound and redact stderr; reject malformed/concatenated candidate output;
- reject before execution any `--send`, key/artifact/endpoint/CLI argument, unknown argument, fallback interpreter, CWD-relative import, `PATH` lookup, or shell evaluation;
- contain no `solana`, `program deploy`, key path, authorization path, signer, transaction, serialization, or network command;
- require no sudoers edit in repository source.

Concrete RED assertions must include `assert.deepEqual(capturedArgv, [...])`, `assert.equal(capturedCwd, '/opt/cumzillaraptors-send-runtime-candidate-v2')`, `assert.deepEqual(capturedEnv, { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LC_ALL: 'C', HOME: '/nonexistent' })`, `assert.equal(capturedStdin, '/dev/null')`, and frozen `{ ok: false, reason: 'invalid-input' }` denial for each invalid invocation.

**Step 2 — run RED**

```bash
node --test tests/cumzdeploy-v2-prepare-launcher.test.mjs
```

Expected: launcher absent.

**Step 3 — minimal source**

Create a fixed-purpose root launcher source that invokes only the installed candidate coordinator with `--prepare`. Its source must not contain a send branch. It must make no host change when run in repository tests.

**Step 4 — verify**

Run static/syntax tests and a fake, unprivileged command-path harness. Do not install the launcher, change sudoers, create `cumzdeploy`, or execute it through sudo.

---

## Task 6: Candidate source audit and publication gate

**Objective:** Independently verify Phase A is still prepare-only and that no candidate installation/host capability has occurred.

**Files:**
- Create: `tests/v2-root-runtime-candidate-release-safety.test.mjs`
- Inspect: all Task 1–5 candidate files and existing `scripts/execute-devnet-deployment.mjs`

**Step 1 — RED tests**

Assert that candidate source:
- has no send mode, transaction serialization, signing, Solana deployment, endpoint connection, key parsing, or authorization-record creation;
- has no real root path creation in Node tests;
- uses no implicit environment/CWD/PATH input;
- never replaces active runtime path;
- does not modify sudoers or invoke package managers;
- never emits full endpoints, key contents, raw review stdout, signed bytes, or transaction data;
- documents all Phase B prerequisites and a fresh human approval gate.

**Step 2 — run RED**

```bash
node --test tests/v2-root-runtime-candidate-release-safety.test.mjs
```

Expected: test/module candidates absent.

**Step 3 — run verification matrix**

```bash
node --test tests/v2-root-runtime-*.test.mjs tests/cumzinstall-v2-root-runtime-candidate*.test.mjs tests/cumzdeploy-v2-prepare-launcher.test.mjs
npm test
git diff --check
```

Expected: full offline suite passes; no network-dependent test runs by default.

**Step 4 — independent reviews**

1. Spec review against this plan and the published v2 contract.
2. Security review of installer staging, path chains, manifests/dependencies, fake adapter interfaces, exact JSON behavior, source/output secrets, and no-send source boundary.

Any finding requires a new failing regression test and re-review.

---

## Phase B authorization gate — not part of this plan

Even if all repository Phase A work is approved/published, stop. A new explicit user authorization is required before any of the following:

- root bootstrap or candidate directory creation;
- protected runtime artifact/dependency copy;
- key or endpoint file access;
- CLI installation or version check;
- installing/updating a root launcher or sudoers entry;
- running a root or `cumzdeploy` prepare command;
- Devnet review/network access.

If Phase B is later authorized, it must start with fresh host privilege reconciliation, fixed source hashes, an independently reviewed root-staging bootstrap, and one short mobile-safe root command at a time. Successful candidate installation permits only a fresh **unsigned `--prepare`** review; it does not authorize `--send`, signing, deployment, spending, or any launch action.

### Mandatory later Phase-B/send-boundary plan

Before any privileged helper, runtime install, or future send design, author and independently review a new plan covering fake-process tests for: staged-executable-only invocation; rebuilt/cleared environment; `/dev/null` stdin; fixed working directory; closed inherited file descriptors; bounded/redacted stdout/stderr; explicit timeout with TERM then KILL; exactly one spawn and no retry/fallback; and durable evidence of `absent → reserved → started → terminal`. That later plan must separately prove no send is reachable from `--prepare` and does not gain authority from this document.

## Final acceptance criteria

- Phase A source is deterministic, offline by default, and test-first.
- Candidate runtime design has `--prepare` only and no send branch.
- All root/key/endpoint/artifact/CLI paths are fixed and provenance-validated in synthetic tests.
- Candidate installer refuses unsafe/reused/symlinked stages and executes only verified staged bytes.
- Candidate never replaces active prepare runtime or changes sudoers.
- Complete test suite and independent reviews pass.
- No candidate/runtime/host action occurs without a new human decision.
