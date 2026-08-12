# Send-Gate v2 Pure Schema Implementation Plan

> **For Hermes:** Implement this plan task-by-task with a fresh worker and two reviews per task: spec compliance first, code quality second. This plan authorizes repository-only, offline pure modules and tests. It does **not** authorize a candidate runtime, root paths, keys, sudoers, a live authorization, network/RPC calls, CLI execution, signing, transaction serialization, broadcast, deployment, or launch actions.

**Goal:** Implement the offline validation contracts required by the approved Send-Gate v2 specification: canonical signed approval/attestation records, fixed future CLI argv, and durable nonce-state grammar.

**Architecture:** Keep all new modules pure and deterministic. They accept text, public keys, signatures, and synthetic metadata as arguments, use no filesystem/process/network APIs, and return frozen allow/deny values. They are not a runtime executor and expose no staging, key-reading, RPC, CLI-spawn, transaction, signing, or send interface. Existing v1 no-send policy modules remain unchanged except for an explicit compatibility test.

**Tech Stack:** Node.js ESM, `node:crypto` Ed25519 **verification only**, `node:test`, `node:assert/strict`.

**Reference contract:** `docs/plans/2026-08-11-send-gate-v2-contract-reconciliation.md` at published revision `efdff2c83c3f1015befbdddb8ad87d16d94ad9ea`.

---

## Shared implementation constraints

- Do not modify `/opt`, `/root`, `/usr/local`, sudoers, launchers, CLI installations, or runtime paths. Every root path below is a **string constant or synthetic fixture only**.
- Do not read a file, inspect host metadata, spawn a process, contact an endpoint, create a keypair, call signing APIs, construct/serialize a Solana transaction, or invoke Solana tooling.
- `node:crypto` may be used only for SHA-256 and Ed25519 verification (`verify`); no `sign`, `generateKeyPair`, private-key parsing, or private-key fixture is permitted in production modules.
- Tests may contain a fixed public-key/SPKI and fixed precomputed detached-signature test vector. Do not generate it at test time and never store a private key.
- All parsers default to denial. Public functions return frozen plain values with no source input echo on denial.
- Preserve the existing `future-send-gate.mjs` as the v1 no-send model; do not upgrade it into an executor or send interface.
- Do not stage, commit, or publish the existing untracked rejected v3 files:
  - `scripts/cumzinstall-prepare-output-v3.sh`
  - `tests/cumzinstall-prepare-output-v3.test.mjs`

---

## Exact v2 contract surface for this implementation

All field arrays below are exact ordered JSON key lists; an unknown, missing, duplicated, reordered, inherited, accessor-backed, non-NFC, or non-canonical value is denial.

**Permitted v2 path strings:**

```js
const V2_PATHS = Object.freeze({
  runtimeRoot: '/opt/cumzillaraptors-send-runtime-candidate-v2',
  runtimeManifest: '/opt/cumzillaraptors-send-runtime-candidate-v2/config/runtime-root-sha256.txt',
  dependencyManifest: '/opt/cumzillaraptors-send-runtime-candidate-v2/config/node-modules-sha256.txt',
  endpointDigestManifest: '/opt/cumzillaraptors-send-runtime-candidate-v2/config/rpc-endpoint-sha256.txt',
  endpoint: '/root/cumzillaraptors-send-runtime-candidate-v2/config/rpc-endpoint',
  artifact: '/opt/cumzillaraptors-approved-artifact/cumzillaraptors.so',
  artifactRevision: '/opt/cumzillaraptors-approved-artifact/cumzillaraptors.build-revision',
  cli: '/opt/cumzillaraptors-solana-cli/v1.18.26/bin/solana',
  keyRoot: '/root/cumzillaraptors-deploy-keypairs',
  authorizationRoot: '/root/cumzillaraptors-send-authorizations',
  reservationRoot: '/root/cumzillaraptors-send-authorizations/reservations',
  consumedRoot: '/root/cumzillaraptors-send-authorizations/consumed',
});
```

**Fixed facts:** cluster `devnet`; genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`; program `AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY`; config PDA `7JDvn8mkEousMqzasbDZazkq8EsRy42nB1Dxp74Kg3e6`; revision `01ae96e2542717438112c3244394e0d484210f34`; bytes `397040`; artifact SHA-256 `2c88fe80ff4488e4034fdf2a724822a8413d0242b09176ed1710648eb110aa22`; CLI version `v1.18.26`; CLI SHA-256 `1ef9999ed4bce11226170a312775c8b6439f54331ac4bf249957d587deda6852`; commitment `confirmed`.

**Exact ordered fields:**

```js
const AUTHORIZATION_FIELDS = [
  'formatVersion','nonce','createdAt','expiresAt','devnetGenesisHash','rpcSha256','commitment','programId','configPda','artifactRevision','artifactBytes','artifactSha256','cliVersion','cliSha256','runtimeManifestSha256','reviewReportSha256','observedProgramAbsent','observedConfigAbsent','authorization','exclusions',
];
const ATTESTATION_FIELDS = [
  'formatVersion','authorizationSha256','runtimeManifestSha256','reviewReportSha256','createdAt','expiresAt','devnetGenesisHash','rpcSha256','commitment','programId','configPda','artifactRevision','artifactBytes','artifactSha256','cliVersion','cliSha256','observedProgramAbsent','observedConfigAbsent',
];
const STARTED_FIELDS = [
  'formatVersion','nonce','authorizationSha256','runtimeManifestSha256','createdAt','state','stagedCli','stagedPayer','stagedProgram','stagedUpgradeAuthority','stagedArtifact',
];
const TERMINAL_FIELDS = [
  'formatVersion','nonce','authorizationSha256','startedSha256','completedAt','state','exitClass',
];
```

`nonce` is exactly 43 base64url characters (`^[A-Za-z0-9_-]{43}$`); timestamps are UTC ISO strings with `toISOString()` equality; expiry is strictly after creation and strictly after `now`; `authorization` is exactly `one Devnet program deployment attempt only`; `exclusions` is exactly `No launch initialization, collection creation, minting, claims, payments, uploads, authority changes, upgrades, mainnet, or other transactions.`; both absence bindings are literal `true`. State is literal `started` or `terminal`; terminal exit class is only `succeeded`, `failed`, or `interrupted`.

**Synthetic pinned-public-key provenance fixture shape:** every approver/reviewer key fixture has: exact permitted root pathname, `isRegularFile: true`, `uid: 0`, `mode: 0o600`, `parentUid: 0`, `parentMode: 0o700`, `parentIsDirectory: true`, a distinct fixed SHA-256 public-key fingerprint, and a runtime-manifest fingerprint equal to it. No private key or key generation exists.

**Pre-implementation test gate:** Before creating any production module, create all five test files named in Tasks 1–5 with their static capability-boundary test and their listed acceptance/denial cases. Run them together and retain the expected RED failures caused solely by missing production modules. An independent reviewer must approve this pure test specification before any production module is created. Per-task RED runs below remain mandatory after that gate.

### Task 1: Add v2 fixed facts and canonical path schema

**Objective:** Introduce a pure immutable source of truth for the approved v2 paths, fixed Devnet facts, and exact JSON field ordering.

**Files:**
- Create: `scripts/future-send-v2-schema.mjs`
- Create: `tests/future-send-v2-schema.test.mjs`
- Inspect only: `scripts/future-send-gate.mjs`, `scripts/future-send-runtime-manifests.mjs`

**Step 1 — write all failing tests, including capability boundary**

Add the static source/capability test first: reject filesystem, process, network/RPC, child process, CLI spawn, Solana, signing, key-generation/private-key, transaction, and serialization capabilities from executable source. Then add tests that require exported frozen constants for:

```js
const V2_PATHS = Object.freeze({
  runtimeRoot: '/opt/cumzillaraptors-send-runtime-candidate-v2',
  authorizationRoot: '/root/cumzillaraptors-send-authorizations',
  reservationRoot: '/root/cumzillaraptors-send-authorizations/reservations',
  consumedRoot: '/root/cumzillaraptors-send-authorizations/consumed',
});
```

Require the existing reviewed program/config/artifact/CLI facts, a fixed `confirmed` commitment, and explicit ordered arrays for:
- authorization JSON fields;
- reviewer-attestation JSON fields;
- `started.json` fields;
- `terminal.json` fields.

The tests must reject mutable constants, wrong candidate root, unknown/missing/reordered fields, non-canonical JSON, non-NFC strings, and legacy v1 authorization fields used as v2 input.

**Step 2 — run RED**

Run:

```bash
node --test tests/future-send-v2-schema.test.mjs
```

Expected: fail because module/functions do not exist.

**Step 3 — implement minimal pure schema**

Implement:
- `V2_FIXED_FACTS`, `V2_PATHS`, and field arrays as deeply frozen public data;
- `parseCanonicalObject(text, exactFields)` that accepts only plain-object canonical JSON with exactly the ordered enumerable fields and NFC strings;
- non-echoing deny results such as `Object.freeze({ ok: false, reason: 'invalid-input' })`.

Do not import filesystem, process, child-process, HTTP/RPC, Solana, or signing APIs.

**Step 4 — run focused tests**

Run the Task 1 test. Expected: pass.

**Step 5 — static capability test**

Add a source assertion rejecting imports/API names for filesystem, process, network, child process, key read/write, transaction, `sign`, `spawn`, `exec`, and Solana SDKs. Explicitly allow only `node:crypto` SHA-256 support if used.

**Step 6 — commit boundary**

Do not commit this task independently unless the user has approved implementation publication. Leave changes reviewable for Task 2.

---

### Task 2: Implement detached approval and reviewer-attestation validation

**Objective:** Validate two distinct Ed25519-signed canonical records before any hypothetical future authorization can pass a pure gate.

**Files:**
- Create: `scripts/future-send-v2-approval.mjs`
- Create: `tests/future-send-v2-approval.test.mjs`
- Reuse: `scripts/future-send-v2-schema.mjs`

**Step 1 — write all failing tests with fixed public vectors, including capability boundary**

First add a static test rejecting filesystem, process, network/RPC, child process, CLI spawn, Solana, `sign`, key generation, private-key parsing, transaction, and serialization APIs from executable source; permit only `createHash`, `createPublicKey`, and `verify`. Tests must supply only:
- canonical authorization JSON text;
- canonical reviewer-attestation JSON text;
- two distinct fixed public SPKI PEM strings;
- fixed base64url detached signatures created off-line before the test is committed;
- synthetic root-only public-key-file provenance metadata, exactly matching the shape in **Exact v2 contract surface** (permitted path, regular file, root UID, `0600`, root-owned `0700` parent directory, fingerprint, matching runtime-manifest fingerprint).

Test acceptance only where both signatures verify and the attestation binds exactly:
- authorization SHA-256;
- runtime-manifest SHA-256;
- review-report SHA-256;
- all fixed public facts;
- observed program/config absence;
- matching non-expired timestamp window.

Require denial before later validation for each of:
- missing/bad/non-canonical signature encoding;
- wrong signature or wrong public key;
- same approver and reviewer key fingerprint;
- wrong/missing public-key provenance metadata;
- unauthorized record field, digest, fact, expiry, or canonical-byte variation;
- mismatched attestation authorization digest or expiry;
- any private-key-shaped test value or `sign`/key-generation API in production source.

**Step 2 — run RED**

```bash
node --test tests/future-send-v2-approval.test.mjs
```

Expected: fail because the validator does not exist.

**Step 3 — implement the minimal validator**

Export `validateV2ApprovalBundle(input)` which:
1. parses canonical authorization and attestation text using Task 1;
2. verifies synthetic provenance metadata for both public-key files;
3. requires distinct SHA-256 public-key fingerprints;
4. verifies each detached Ed25519 signature over the exact UTF-8 canonical text using `node:crypto` `verify` only;
5. checks all cross-record digest/fact/absence/expiry bindings;
6. returns only frozen `{ ok: true, nonce, authorizationSha256 }` or a fixed non-echoing deny object.

The function must not read public keys from paths: it receives public-key text and synthetic metadata as arguments. It must expose no creation/signing capability.

**Step 4 — run focused tests**

Run Task 2 tests. Expected: pass.

**Step 5 — static boundary test**

Assert production source has no `sign`, `generateKeyPair`, `createPrivateKey`, filesystem/process/network/CLI/Solana imports, or secret-looking fixed values. Permit `createHash`, `createPublicKey`, and `verify` only.

---

### Task 3: Implement exact future CLI argv validation without process execution

**Objective:** Encode the approved v2 CLI token grammar as a pure builder/validator that returns strings only and cannot execute a program.

**Files:**
- Create: `scripts/future-send-v2-cli-contract.mjs`
- Create: `tests/future-send-v2-cli-contract.test.mjs`
- Reuse: `scripts/future-send-v2-schema.mjs`

**Step 1 — write all failing tests, including capability and endpoint-policy boundaries**

First add the static source test rejecting filesystem, process, network/RPC, child process, CLI-spawn, Solana, signing/key-generation/private-key, transaction, and serialization APIs. Then use a canonical 43-character nonce and synthetic endpoint value. Require `buildV2CliArgv(input)` to return a frozen array equal to this ordered shape:

```js
[
  '/opt/cumzillaraptors-send-runtime-candidate-v2/staging/<nonce>/solana',
  'program', 'deploy', '--url', '<canonical endpoint>', '--commitment', 'confirmed',
  '--keypair', '/opt/cumzillaraptors-send-runtime-candidate-v2/staging/<nonce>/payer.json',
  '--program-id', '/opt/cumzillaraptors-send-runtime-candidate-v2/staging/<nonce>/program.json',
  '--upgrade-authority', '/opt/cumzillaraptors-send-runtime-candidate-v2/staging/<nonce>/upgrade-authority.json',
  '/opt/cumzillaraptors-send-runtime-candidate-v2/staging/<nonce>/cumzillaraptors.so',
]
```

Require denial for malformed nonce, endpoint digest mismatch, wrong commitment, any alternate root/path, caller-supplied extra token, response/config flag, arbitrary environment field, or attempted buffer/additional signer option. The endpoint cases must separately deny: URL userinfo; any whitespace; fragment; non-default port; percent encoding; empty query; duplicate query name; empty query name/value; a second `=` in a query pair; malformed `&&` pair; non-HTTPS scheme; hostname absence; and any canonical endpoint whose SHA-256 differs from the bound endpoint digest (including path/query substitution with an unchanged origin).

**Step 2 — run RED**

```bash
node --test tests/future-send-v2-cli-contract.test.mjs
```

Expected: fail because the module is absent.

**Step 3 — implement a string-only contract**

Implement `buildV2CliArgv({ nonce, canonicalEndpoint, endpointSha256 })` and optionally `validateV2CliArgv(argv, input)`. Reuse strict endpoint canonicalization and expected endpoint digest. Produce no command line, shell string, spawn config, file path access, or process call.

**Step 4 — run focused tests**

Run Task 3 tests. Expected: pass.

**Step 5 — source-boundary test**

Reject production use/imports of `child_process`, `spawn`, `exec`, `shell`, `process`, filesystem/network APIs, Solana SDKs, transaction APIs, signing APIs, and `solana program` shell-command literals. The literal argv tokens are permitted only as array strings.

---

### Task 4: Implement durable nonce-state text grammar and transition validator

**Objective:** Define pure validation for create-once reservation/started/terminal state records and fail-closed recovery classification.

**Files:**
- Create: `scripts/future-send-v2-nonce-state.mjs`
- Create: `tests/future-send-v2-nonce-state.test.mjs`
- Reuse: `scripts/future-send-v2-schema.mjs`

**Step 1 — write all failing tests, including capability boundary**

First add a static test rejecting filesystem, process, network/RPC, child process, CLI spawn, Solana, signing/key-generation/private-key, transaction, and serialization APIs. Use canonical JSON fixture text and synthetic metadata/path records. Require:
- valid state is exactly `absent`, `reserved`, `started`, or `terminal` with only permitted next state;
- `started.json` is create-once and binds nonce, authorization SHA-256, timestamp, fixed facts, and exactly the approved staged paths;
- `terminal.json` is create-once and binds the same nonce/authorization digest plus one of `succeeded`, `failed`, or `interrupted`;
- `started` without terminal classifies as permanently consumed/interrupted;
- a pre-existing/symlinked/non-root/non-0600/malformed/duplicate state object denies;
- terminal without started, transition to a prior state, overwrite/append/downgrade, and reuse all deny;
- cleanup plans may name only reservation and staging, never consumed state.

**Step 2 — run RED**

```bash
node --test tests/future-send-v2-nonce-state.test.mjs
```

Expected: fail because module is absent.

**Step 3 — implement pure validation**

Export `validateV2NonceSnapshot(snapshot)` and `classifyV2Recovery(snapshot)` using input objects/text only. Return frozen records. Do not create directories, `fsync`, rename, lock, or remove files—the later root-runtime implementation owns those side effects.

**Step 4 — run focused tests**

Run Task 4 tests. Expected: pass.

**Step 5 — static boundary test**

Assert no filesystem/process/network/CLI/key/transaction/signing APIs are imported or called. Comments may describe future root actions, but executable module code must remain pure.

---

### Task 5: Cross-module no-send regression and integration review

**Objective:** Prove the pure modules compose only into an offline acceptance/deny decision and do not change the existing prepare-only executor.

**Files:**
- Create: `tests/future-send-v2-pure-integration.test.mjs`
- Inspect only: `scripts/execute-devnet-deployment.mjs`, `scripts/future-send-gate.mjs`, `scripts/future-send-runtime-manifests.mjs`

**Step 1 — write integration test**

Use public/synthetic fixtures only. In a nominal pure case, assert the chain can return:
- accepted approval bundle;
- frozen exact argv string array;
- valid `started → terminal` grammar.

Assert it returns no function, callback, path opener, spawn configuration, private key, RPC client, serialized transaction, signer, or send result. Assert the repository executor still rejects `--send` and contains no Solana CLI child process/deploy path.

**Step 2 — run integration test**

```bash
node --test tests/future-send-v2-pure-integration.test.mjs
```

Expected: pass after Tasks 1–4.

**Step 3 — run all relevant offline tests**

```bash
node --test \
  tests/future-send-gate.test.mjs \
  tests/future-send-runtime-guard.test.mjs \
  tests/future-send-runtime-manifests.test.mjs \
  tests/future-send-runtime-provenance.test.mjs \
  tests/future-send-v2-*.test.mjs \
  tests/execute-devnet-deployment.test.mjs
npm test
git diff --check
```

Expected: all relevant tests pass; full suite has no failures; existing intentional ARM/x86/live skips remain skips.

**Step 4 — independent reviews**

1. **Spec review:** verify all tasks implement only the published v2 contract and no host capability.
2. **Security/quality review:** examine canonical parsing, Ed25519 verification misuse, confused-deputy paths, endpoint redaction, nonce monotonicity, test-vector provenance, and static no-capability boundaries.

Any blocker requires a new failing regression test, a narrow remediation, and a fresh review.

**Step 5 — explicit stop and publication gate**

Stop immediately after the independent reviews. No root-runtime plan, candidate-runtime work, CLI installation, key access, filesystem mutation outside repository tests, process execution, RPC/network work, signing, transaction serialization, broadcast, deployment, or commit/publish is permitted without a separate explicit user authorization. Candidate-runtime creation remains a further separate decision and is not implied by a code commit.

---

## Final acceptance criteria

- All new modules are pure and deterministic.
- Only fixed test vectors/public keys are present; no private key, authenticated endpoint, or live authorization exists.
- The code exposes no filesystem, process, root, CLI, Solana, signing, transaction, RPC, or send capability.
- v1 prepare-only behavior remains unchanged.
- Every invalid record/path/metadata/state/argv condition fails before a nominal pure result.
- Full offline regression suite passes.
- Independent spec and security reviews approve.
- No commit/push or host action happens without another explicit user instruction.
