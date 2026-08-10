# Remaining Devnet Send-Readiness Tasks

**Status:** planning only. This checklist authorizes no signing, transaction serialization for submission, broadcast, deployment, program initialization, collection creation, minting, claims, uploads, payments, funding, or mainnet activity.

**Current evidence baseline**

- Correct program ID: `AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY`
- Config PDA: `7JDvn8mkEousMqzasbDZazkq8EsRy42nB1Dxp74Kg3e6`
- Correct authority: `3DnrWsBbaT6BMbUKXL4x5cid9KRk7GbG89WdJNihEhU2`
- Reviewed SBPF revision: `01ae96e2542717438112c3244394e0d484210f34`
- Reviewed SBPF SHA-256: `2c88fe80ff4488e4034fdf2a724822a8413d0242b09176ed1710648eb110aa22`
- Reviewed SBPF size: `397040` bytes
- Current no-send guard terminal state: `send-disabled-no-live-authorization`

## Task 1 — Reconcile the plan’s stale fixed-fact table

**Objective:** Make the older future-send design plan agree with the currently reviewed program/artifact/identity facts before it guides any implementation.

- Update only public fixed facts and their regression assertions.
- Preserve historical review packets as historical evidence; do not rewrite them.
- Run offline policy/guard tests and `git diff --check`.
- Obtain an independent diff review.

**Done when:** every future-send policy, plan, and candidate manifest has the same program ID, config PDA, artifact revision/hash/size, and authority context.

## Task 2 — Define root runtime inputs and manifests without enabling send

**Objective:** Specify exact root-owned paths and hashes for the future runtime, but do not create a send launcher, sudo rule, live authorization, or key-accessing executor.

- Define manifest schemas for runtime code, dependency tree, reviewed artifact, root key files, protected CLI, and canonical RPC endpoint digest.
- Define required ownership/mode/path-chain validation (`root:root`, root-only parents, no group/world write).
- Define sanitized report format: RPC origin only; never full endpoint, key contents, raw signed bytes, or serialized transactions.
- Add pure/offline schema tests and negative tests.

**Done when:** inputs are deterministic, documented, test-covered, and still no executable send path exists.

## Task 3 — Implement a root-only default-deny runtime verifier

**Objective:** Implement the filesystem/provenance layer around the existing pure guard.

- Read only fixed root-owned paths; accept no caller-provided key, artifact, CLI, RPC, or authorization paths.
- Verify path chains, regular-file types, ownership, modes, and manifests before loading any key or dependency.
- Validate a root-only authorization record before key reads/staging.
- Default deny if the authorization directory/record is missing, malformed, expired, consumed, or mismatched.
- Keep this runtime unreachable: no sudo rule and no live authorization record.

**Tests:** fake filesystem fixtures only; prove failure occurs before key read/staging/CLI invocation on every invalid condition.

**Done when:** deterministic tests cover all reject paths and the runtime has no send invocation branch.

## Task 4 — Add durable nonce reservation/consumption mechanics

**Objective:** Replace in-memory nonce modeling with root-owned durable semantics, still without a live authorization record.

- Reserve nonce with atomic root-only `mkdir`.
- Reject a preexisting reservation or consumed nonce.
- Create and fsync immutable `started` state before any future CLI call.
- Permit cleanup only of staging and reservation paths, never `consumed/<nonce>`.
- Model power loss/restart after `started`; it must permanently deny reuse and never retry.

**Tests:** concurrent reservation, terminal failure, interrupted-state restart, immutable cleanup rejection, and malformed nonce cases.

**Done when:** nonce state is fail-closed and durable under tested simulated interruption.

## Task 5 — Build a fake-CLI integration harness

**Objective:** Exercise final gating without real keys, real RPC, or a Solana CLI deployment.

- Use fake root-owned artifact/key/CLI files in a test-only fixture root.
- Use an injected fake RPC responder for genesis/program/config reads.
- Prove final-state recheck rejects changed genesis, existing program, existing config, RPC failure, endpoint mismatch, and review-to-final races.
- In the one nominal mock path, allow only a fake CLI that records fixed staged arguments; it must never contact a network.
- Prove staged paths—not originals—would be supplied to the fake CLI.

**Done when:** all negative cases make zero fake-CLI calls; one bounded fake path confirms argument construction only.

## Task 6 — Independent security review of the candidate runtime

**Objective:** Review the exact candidate runtime before any capability decision.

Checklist:
- source/dependency/artifact/key/CLI TOCTOU handling;
- root path ownership and modes;
- authorization and nonce lifecycle;
- endpoint redaction and fixed-endpoint binding;
- final Devnet state recheck design;
- no retry/failover;
- no signed/serialized transaction persistence;
- no send sudo rule; and
- no scope beyond one Devnet program deployment attempt.

**Done when:** no blocker/major issue remains; remediation and a fresh review are complete.

## Task 7 — Separate human decision gate

**Objective:** Stop and obtain a new explicit decision only after Tasks 1–6 pass.

A future approval package must include:
- fresh unsigned review generated immediately before consideration;
- current program/config absence;
- current payer balance/cost estimate;
- exact artifact/runtime/CLI/manifest digests;
- exact Devnet genesis and endpoint-digest facts;
- the one-time authorization record format and expiry; and
- clear exclusions: no initialization, collection creation, minting, claims, payments, uploads, upgrades, authority changes, or mainnet.

**Explicit stop:** Do not create a send sudo rule, create a live authorization, invoke a send-capable executor, sign, or broadcast under this plan. Those are a separate later user authorization.

## Suggested execution order

1. Task 1 (fact reconciliation)
2. Task 2 (manifest/schema design)
3. Task 3 (default-deny verifier)
4. Task 4 (durable nonce state)
5. Task 5 (fake integration harness)
6. Task 6 (independent review)
7. Stop at Task 7

**Estimated effort:** 1–2 focused development sessions, plus a separate security-review/decision session. The work must remain Devnet-only and no-send through Task 7.
