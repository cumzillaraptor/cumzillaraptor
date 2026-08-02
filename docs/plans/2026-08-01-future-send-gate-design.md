# Future Devnet Send-Gate Design Plan

> **For Hermes:** Execute only the preparation and review tasks in this document. No task in this plan authorizes signing, transaction serialization for submission, broadcast, deployment, collection creation, launch initialization, minting, claims, payments, uploads, or mainnet activity.

**Goal:** Define and test a root-owned Devnet first-deployment send architecture that remains unreachable until a later, separate explicit authorization enables one audited deployment attempt.

**Architecture:** The existing repository tooling remains prepare-only and cannot call a Solana CLI. A separate root-owned runtime will be rebuilt from audited root-controlled source and use fixed paths only: the approved SBPF artifact, root-held keypairs, pinned ARM64 CLI, and Devnet RPC policy. The restricted `cumzdeploy` account remains permitted only to run a fixed `--prepare` launcher; no sudo rule for a send command is created by this plan.

**Tech Stack:** Node.js 22 system runtime, `@solana/web3.js`, root-owned filesystem/runtime manifests, the locally-built Agave/Solana CLI v1.18.26, Solana Devnet.

---

## Non-negotiable invariants

1. **Default deny is enforced:** The candidate executor has no send mode unless it reads a root-owned, canonical authorization record from a fixed root-only directory. Missing, malformed, expired, consumed, or mismatched records must reject before any key is read or CLI is staged. No environment variable, CLI flag, caller path, or user-owned file can enable send.
2. **No new send sudo rule:** `/etc/sudoers.d/cumzdeploy-executor` continues to permit only:
   ```text
   cumzdeploy ALL=(root) NOPASSWD: /usr/local/sbin/cumzdeploy-executor --prepare
   ```
   This plan creates no send launcher and no send sudo rule.
3. **No caller-controlled send inputs:** A future root launcher must hard-code artifact, program keypair, payer, upgrade authority, CLI path, expected hashes, RPC origin, commitment, and fixed argument grammar.
4. **Exact Devnet proof and endpoint binding:** The executor uses one fixed configured RPC endpoint at commitment `confirmed` for fresh review, final recheck, and the CLI `--url` argument. It checks genesis hash `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` before any send-capable path reaches a CLI; endpoint substitution or fallback is forbidden.
5. **First-deployment only:** Recheck immediately before the CLI invocation, from the same endpoint and commitment, that both the program ID and config PDA have no account. Fail closed if either exists or any read fails.
6. **No review-to-send TOCTOU:** Verify and stage the reviewer, dependency tree, artifact, all keypairs, and CLI; execute only staged copies. Root-controlled immutable parents are also verified.
7. **No credential disclosure:** Console output identifies an RPC by origin only. Errors must not echo full URLs, userinfo, paths, query strings, fragments, connection strings, or key content.
8. **No persisted submission artifact:** A future send path must not write signed transactions, serialized transaction bytes, or key content to disk.
9. **No automatic retry:** A failed CLI invocation ends the attempt and preserves only sanitized exit status/output. It must not retry, fail over, or substitute an RPC endpoint.
10. **No later launch actions:** Successful program deployment would still not authorize launch initialization, Core collection creation, mint/claim/payment actions, metadata upload, or mainnet actions.

## Fixed facts to pin in the future protected runtime

| Item | Required value |
|---|---|
| Cluster | Devnet only |
| Devnet genesis | `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` |
| Program ID | `2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2` |
| Config PDA | `7LbuHZ2GJURn3wBfqFNgxQgDgjRv8x1nAhWntfdwiMQ` |
| Artifact revision | `f1e9755d0c081341231bfadf50f06e4170a59065` |
| Artifact byte length | `287632` |
| Artifact SHA-256 | `f969f6bcb11d5bfea9a528963fce7c29e553666b5895747e3ab0c4bea051b29d` |
| Protected CLI | `/opt/cumzillaraptors-solana-cli/v1.18.26/bin/solana` |
| CLI SHA-256 | `1ef9999ed4bce11226170a312775c8b6439f54331ac4bf249957d587deda6852` |
| CLI source | Agave `v1.18.26`, `c2b350023ba849d1b33142592264aaa51fcb7f1e` |
| Candidate runtime root | `/opt/cumzillaraptors-send-runtime-candidate` |
| Active prepare runtime root | `/opt/cumzillaraptors-deploy-runtime` (must not be replaced by candidate work) |
| Approved artifact root | `/opt/cumzillaraptors-approved-artifact` |
| Approved artifact pathname | `/opt/cumzillaraptors-approved-artifact/cumzillaraptors.so` |
| Approved revision-marker pathname | `/opt/cumzillaraptors-approved-artifact/cumzillaraptors.build-revision` |
| Root key root | `/root/cumzillaraptors-deploy-keypairs` |
| Program keypair | `/root/cumzillaraptors-deploy-keypairs/program.json` |
| Payer keypair | `/root/cumzillaraptors-deploy-keypairs/payer.json` |
| Upgrade authority keypair | `/root/cumzillaraptors-deploy-keypairs/upgrade-authority.json` |
| Candidate source manifest | `/opt/cumzillaraptors-send-runtime-candidate/config/runtime-root-sha256.txt` |
| Candidate dependency manifest | `/opt/cumzillaraptors-send-runtime-candidate/config/node-modules-sha256.txt` |
| Candidate authorization directory | `/root/cumzillaraptors-send-authorizations` (root-only; no live record in this phase) |
| Ephemeral nonce reservation directory | `/root/cumzillaraptors-send-authorizations/reservations` (root-only; locks only) |
| Immutable nonce-state directory | `/root/cumzillaraptors-send-authorizations/consumed` (root-only; permanent state records) |
| Fixed RPC configuration | `/root/cumzillaraptors-send-runtime-candidate/config/rpc-endpoint` (root-owned `0600`, canonical full endpoint only; never logged) |
| RPC endpoint manifest | `/opt/cumzillaraptors-send-runtime-candidate/config/rpc-endpoint-sha256.txt` (root-owned; records only SHA-256 of canonical full endpoint) |
| RPC policy | Fixed endpoint digest equality, `confirmed` commitment, no fallback/substitution; output logs origin only |

The RPC canonicalization rule is: parse an absolute HTTPS URL; reject fragments, whitespace, non-default ports, duplicate/empty query parameters, and percent-encoding variants; lowercase scheme/host; preserve the exact normalized path and sorted query pairs; retain userinfo only in the canonical secret value. The candidate stores and compares the SHA-256 of these canonical UTF-8 bytes, never the endpoint itself, in manifests, authorization records, or logs. The root-only configuration value is read once into memory and the identical canonical value is used for fresh review, final recheck, and CLI `--url`.

Every fixed keypair path is verified as a root-owned `0600` regular file beneath a root-owned `0700` key root. Before any future key read, the executor records and verifies a SHA-256 manifest for the three key files; the manifest itself is root-owned and is not readable by `raspberrypi` or `cumzdeploy`. The runtime source, review script, lockfile, dependency manifest, exact artifact/revision-marker paths, CLI, RPC endpoint digest, and all parent directories through `/opt` must likewise be verified against their fixed root-owned manifests before loading or staging them.

---

### Task 1: Reconcile effective privilege policy before any send-capable work

**Objective:** Prove that `raspberrypi` cannot gain broad root access and that `cumzdeploy` remains prepare-only.

**Files:**
- Inspect: `/etc/sudoers`, `/etc/sudoers.d/*`, account/group records
- Do not modify: any key, runtime, launcher, sudoers entry, or CLI in this task

**Steps:**
1. From a new login session, inspect `id raspberrypi` and `id cumzdeploy`.
2. From `piadmin`, run `sudo -l -U raspberrypi` and `sudo -l -U cumzdeploy`; save only sanitized command-policy output as the authoritative comparison.
3. From `raspberrypi`, test `sudo -n /usr/bin/id`; expected result is refusal requiring a password.
4. From `raspberrypi`, test the installer with an extra argument; expected exit is `64` and no install side effect.
5. Record the previously observed contradictory unprivileged `sudo -l` output as a policy-audit anomaly. Do not infer active privilege from it; reconcile it against `piadmin`’s privileged lookup, `id`, group membership, direct `sudo -n` negative tests, and every parsed sudoers source.
6. If a broad rule is confirmed by those authoritative checks, halt. Identify its exact sudoers source before modifying anything.

**Pass criteria:** `raspberrypi` has no broad sudo or Docker membership; `cumzdeploy` has only the fixed `--prepare` command.

### Task 2: Create an audited root-runtime candidate outside the active runtime

**Objective:** Build a new candidate runtime under a distinct root-owned path without replacing the approved prepare runtime.

**Files:**
- Create: `/opt/cumzillaraptors-send-runtime-candidate/`
- Create: root-owned manifests for source, dependencies, artifact, CLI, and fixed configuration
- Do not modify: `/opt/cumzillaraptors-deploy-runtime/`, `/usr/local/sbin/cumzdeploy-executor`, or `/etc/sudoers.d/cumzdeploy-executor`

**Steps:**
1. Copy only reviewed runtime source into a fresh root-owned candidate directory.
2. Install dependencies from a lockfile with lifecycle scripts disabled, as root, then hash every loaded dependency file.
3. Include an immutable fixed configuration manifest containing only public identifiers and fixed file paths; never include private key material or an authenticated RPC URL.
4. Set candidate directories to `0700`, files to owner-only modes, and verify every parent through `/opt` is root-owned and not group/world writable.
5. Record source, dependency, artifact, and CLI hashes in root-owned manifests.

**Pass criteria:** the candidate is not reachable through any sudo rule or launcher, and all runtime inputs are fixed/root-controlled.

### Task 3: Add final state-recheck logic with deterministic tests

**Objective:** Define a testable fail-closed guard immediately before a future CLI call.

**Files:**
- Modify candidate runtime executor only
- Create candidate-runtime unit tests outside the repository commit scope unless separately approved

**Required behavior:**
```text
verify root-owned runtime/dependencies/artifact/CLI/keypair/manifest paths
→ load canonical root-owned authorization record from fixed directory
→ validate schema, canonical bytes/digest, root ownership/mode, exact fixed facts, expiry, and “unused” state
→ atomically reserve the record nonce by creating only an ephemeral root-only reservation lock before any key read or CLI staging
→ reject if an immutable root-only consumption/state record already exists for that nonce
→ stage verified reviewer, dependencies, artifact, CLI, and keypairs
→ fresh unsigned review against the one fixed RPC endpoint at confirmed commitment
→ immediately before CLI: fetch genesis + program account + config PDA from the same endpoint/commitment
→ reject if genesis differs, either account exists, any read fails, authorization facts differ, or the reservation is lost
→ atomically create a durable immutable `started` state record for the nonce, then invoke the staged CLI exactly once with the same fixed endpoint
→ atomically append/replace only the state payload with a sanitized immutable terminal result while retaining the nonce state record permanently
→ remove staging directories and the ephemeral reservation lock only; never retry, fail over, emit signed bytes, or delete an immutable nonce-state record
```

The candidate has no executable send path until all of the above are implemented, independently reviewed, and a later root-only authorization record exists. In this phase, the authorization directory contains no live record and the current sudoers policy has no command that can request send.

**Tests:**
1. Default-deny with no authorization record rejects before key read, staging, or CLI spawn.
2. Malformed, non-canonical, non-root-owned, world-readable, expired, already-consumed, or digest-mismatched authorization records reject before key read, staging, or CLI spawn.
3. Authorization record with wrong Devnet genesis, program ID, config PDA, artifact revision/size/hash, CLI version/hash, review digest, endpoint origin, or commitment rejects before key read, staging, or CLI spawn.
4. A concurrent attempt for the same nonce fails to acquire the root-owned exclusive reservation and cannot spawn a CLI.
5. Genesis mismatch rejects before any CLI spawn.
6. Existing program account rejects before any CLI spawn.
7. Existing config PDA rejects before any CLI spawn.
8. RPC failure, commitment mismatch, or endpoint substitution rejects before any CLI spawn and redacts the full endpoint.
9. State-race mock (review sees absent; final check sees present) rejects before any CLI spawn.
10. Happy-path mock may reach a fake staged CLI that records fixed arguments, but never uses real keys, real RPC, or real network.
11. Verify every CLI identity path is a staged path, not the source keypair path; verify the CLI path is staged and the fixed `--url` endpoint equals the endpoint used for final recheck.
12. Verify no signed or serialized transaction bytes are opened, written, or retained; no CLI retry/failover occurs after any nonzero or interrupted result.
13. Verify the nonce is terminally consumed after a fake CLI start even if the fake CLI fails, and cannot be reused.
14. Simulate abrupt termination after durable `consumed/<nonce>/started` creation but before the fake CLI returns; run normal cleanup/restart and prove it may remove only `reservations/<nonce>`, denies reuse, produces no retry, and does not delete or downgrade the immutable consumption record.
15. Verify the authorization record contains the SHA-256 of the canonical complete endpoint and rejects a path/query/userinfo change that preserves origin.

**Pass criteria:** deterministic tests demonstrate default denial, authorization race rejection, final-state rejection, and no send/CLI spawn on every invalid condition.

### Task 4: Design the future authorization envelope without enabling it

**Objective:** Specify a later human approval record that binds one deployment attempt to a fresh review.

**Files:**
- Create: root-owned template only, not a live authorization

**Canonical record and verifier design:**
- The record is canonical UTF-8 JSON with a fixed field order, NFC-normalized strings, no unknown fields, and a SHA-256 digest over its exact bytes. The root verifier rejects equivalent-but-differently-encoded JSON.
- It resides at an exact root-only pathname derived from a 32-byte random base64url nonce, in `/root/cumzillaraptors-send-authorizations/`; it is a root-owned `0600` regular file beneath root-owned `0700` parents.
- It may be created only by a separate, later, explicitly approved `piadmin`/root workflow after fresh review and independent operator confirmation. Creation is outside this plan and outside the future send launcher.
- The record must contain: format version; nonce; exact UTC creation time; short expiry; Devnet genesis; fixed canonical full-RPC SHA-256 digest and `confirmed` commitment; program ID and config PDA; artifact revision/byte size/SHA-256; protected CLI version/SHA-256; root-runtime manifest digest; fresh review-report digest and observed program/config absence; and exact text authorizing **one Devnet program deployment attempt only**.
- It must list explicit exclusions for launch initialization, collection creation, minting, claims, payments, uploads, authority changes, upgrades, mainnet, and all other transactions.
- Before any key read, the verifier checks schema, exact digest, root ownership/path chain, expiry, fixed facts, root-runtime manifest digest, and absence of a terminal result record.
- It obtains an exclusive **ephemeral** root-only nonce reservation using atomic `mkdir` at `/root/cumzillaraptors-send-authorizations/reservations/<nonce>`. Reservation failure means deny; there is no wait/retry path.
- Before staging, it checks for `/root/cumzillaraptors-send-authorizations/consumed/<nonce>`; any such immutable state record means deny, even if no reservation lock exists.
- State transitions use durable POSIX file operations: reservation creation by `mkdir`; state record creation in the separate immutable `consumed` directory using fresh root-only temporary files, file `fsync`, atomic `rename`, and parent-directory `fsync`. The permanent state machine is `started → terminal`; transitions are monotonic and any unexpected/missing state is deny.
- Immediately before the staged CLI spawn, it durably creates `consumed/<nonce>/started` and fsyncs the immutable-state parent. A process restart, SIGKILL, or power-loss recovery that finds this durable record treats the nonce as permanently consumed; it never attempts to infer that the CLI did not run and never retries.
- In `finally` for normal process control flow, it durably adds a sanitized terminal result beneath the same immutable nonce-state directory (`started`, exit class, UTC time; never raw CLI output, key data, RPC URL, transaction bytes, or signature). A terminal result does not restore usability. Cleanup may remove only staging directories and `reservations/<nonce>`; it is explicitly forbidden from deleting or modifying `consumed/<nonce>` after `started` exists.

**Pass criteria:** the template and verifier are tested as default-deny; the template itself grants no capability, no live record exists in this phase, and the directory is unreadable by `raspberrypi` and `cumzdeploy` until a later user-approved workflow creates a canonical record.

### Task 5: Independent review and no-send regression check

**Objective:** Obtain an independent security review before any capability is considered for future enablement.

**Review checklist:**
- privilege graph and active sudo rules;
- root ownership/mode/path-chain checks;
- code/dependency/CLI/artifact/key staging;
- final Devnet/account absence recheck;
- error redaction;
- no persistence of signed/serialized transactions;
- no automatic retries;
- no `--send` sudo rule;
- negative tests proving current launchers remain prepare/install-only.

**Pass criteria:** no blocker or major finding. If any finding exists, remediation and a fresh review are required before proceeding.

---

## Explicit stop point

After Tasks 1–5, stop. Do not create a send-capable sudo rule, do not create a live authorization envelope, do not call a send-capable launcher, and do not sign or broadcast. A separate explicit user instruction is required to decide whether any future send interface should be enabled.
