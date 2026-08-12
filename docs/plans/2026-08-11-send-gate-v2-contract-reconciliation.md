# Send-Gate v2 Contract Reconciliation

> **For Hermes:** This is a design-only contract. It does not authorize implementation, candidate-runtime creation, key access, CLI installation, sudoers changes, authorization creation, RPC access, signing, serialization of a submission transaction, broadcast, deployment, or any launch action.

**Goal:** Resolve the five design blockers found in the future Devnet send-gate review before any implementation plan is considered.

**Architecture:** A future protected runtime is a separate root-owned component whose default behavior is denial. This contract specifies fixed paths, a human-approval trust boundary, a credentials-free RPC policy, a fully pinned future CLI process contract, and monotonic durable nonce state. It deliberately supplies no executable command, no private material, and no live authorization.

**Status:** Design-only; independently review this document before creating implementation tasks.

---

## 1. Canonical v2 namespace

The sole canonical future candidate runtime root is:

`/opt/cumzillaraptors-send-runtime-candidate-v2`

no other candidate runtime root is valid. The following path set is the only permitted v2 set:

| Purpose | Fixed pathname |
|---|---|
| Runtime root | `/opt/cumzillaraptors-send-runtime-candidate-v2` |
| Runtime source manifest | `/opt/cumzillaraptors-send-runtime-candidate-v2/config/runtime-root-sha256.txt` |
| Dependency manifest | `/opt/cumzillaraptors-send-runtime-candidate-v2/config/node-modules-sha256.txt` |
| Endpoint-digest manifest | `/opt/cumzillaraptors-send-runtime-candidate-v2/config/rpc-endpoint-sha256.txt` |
| Root-only endpoint value | `/root/cumzillaraptors-send-runtime-candidate-v2/config/rpc-endpoint` |
| Artifact | `/opt/cumzillaraptors-approved-artifact/cumzillaraptors.so` |
| Revision marker | `/opt/cumzillaraptors-approved-artifact/cumzillaraptors.build-revision` |
| Solana CLI | `/opt/cumzillaraptors-solana-cli/v1.18.26/bin/solana` |
| Key root | `/root/cumzillaraptors-deploy-keypairs` |
| Authorization root | `/root/cumzillaraptors-send-authorizations` |
| Reservation root | `/root/cumzillaraptors-send-authorizations/reservations` |
| Durable state root | `/root/cumzillaraptors-send-authorizations/consumed` |

The active prepare-only runtime remains `/opt/cumzillaraptors-deploy-runtime`; v2 work must never replace it. The obsolete unversioned candidate pathname is retired from active design references. Historical evidence remains historical and is not rewritten.

## 2. Fixed public deployment facts

Any future v2 implementation must continue to bind exactly these public facts and reject all substitutions:

- Cluster: Devnet only.
- Genesis hash: `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`.
- Program ID: `AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY`.
- Config PDA: `7JDvn8mkEousMqzasbDZazkq8EsRy42nB1Dxp74Kg3e6`.
- Artifact revision: `01ae96e2542717438112c3244394e0d484210f34`.
- Artifact length: `397040` bytes.
- Artifact SHA-256: `2c88fe80ff4488e4034fdf2a724822a8413d0242b09176ed1710648eb110aa22`.
- CLI version: `v1.18.26`.
- CLI SHA-256: `1ef9999ed4bce11226170a312775c8b6439f54331ac4bf249957d587deda6852`.
- Commitment: `confirmed`.

## 3. Approval-record trust contract

Root ownership alone is not proof of human approval. A future authorization is valid only if all three independently checkable bindings exist:

1. **Human approval:** the exact canonical UTF-8 authorization JSON has a detached Ed25519 signature made by an explicitly designated approver key.
2. **Pinned verifier identity:** the verifier accepts only a root-pinned approver public key in a fixed root-owned `0600` regular file beneath a root-owned `0700` parent. The key fingerprint is recorded in the root-runtime manifest.
3. **independent reviewer attestation:** a separate reviewer produces a canonical review-attestation JSON, also signed by a distinct root-pinned reviewer public key. It binds the authorization SHA-256, current runtime-manifest SHA-256, review-report SHA-256, exact public facts, observed first-deployment absence, and expiry.

The authorization record must not itself contain a private key, endpoint, signed transaction, serialized transaction, or a generic “approve” statement. It contains an authorization SHA-256, random 32-byte base64url nonce, created/expires timestamps, all fixed public facts, endpoint SHA-256, runtime-manifest SHA-256, fresh-review-report SHA-256, the fixed one-attempt text, and fixed exclusions.

Both detached signatures are verified before any key is read, artifact/CLI is staged, reservation is created, or network call is made. Signature verification failure, key-file provenance failure, signer-key equality between approver and reviewer, unknown field, canonical-byte mismatch, expiry, or any digest mismatch is denial. Neither local root convenience nor a chat message substitutes for this record-and-attestation pair.

No live authorization record is created by this specification.

## 4. Endpoint and credentials contract

The future protected runtime accepts exactly one canonical absolute HTTPS endpoint and binds its SHA-256. It rejects userinfo outright. No URL credential mechanism exists.

It also rejects whitespace, fragments, non-default ports, percent encoding, empty or duplicate query fields, malformed query pairs, a non-HTTPS scheme, and endpoint substitution. The endpoint is read once from its root-only pathname into memory; that same canonical value is used for fresh review, final state recheck, and the later CLI URL argument. Only the origin may be logged. Error messages must not contain an endpoint, path, query, URL, credential, or connection string.

If an authenticated RPC is ever required, it is a new design decision, not an exception to this contract. It requires a separate root-only credentials design, binding, redaction analysis, test plan, and independent review.

## 5. Future CLI process contract

This section specifies a hypothetical future process boundary; it does not provide a runnable command.

For nonce `N`, the only future CLI argument vector is the following exact ordered token sequence, after every displayed path has been root-staged, hash-verified, and made non-writable. `N` is validated as the authorization record's canonical nonce; it is not caller input.

```text
/opt/cumzillaraptors-send-runtime-candidate-v2/staging/N/solana
program
deploy
--url
<canonical endpoint held only in memory>
--commitment
confirmed
--keypair
/opt/cumzillaraptors-send-runtime-candidate-v2/staging/N/payer.json
--program-id
/opt/cumzillaraptors-send-runtime-candidate-v2/staging/N/program.json
--upgrade-authority
/opt/cumzillaraptors-send-runtime-candidate-v2/staging/N/upgrade-authority.json
/opt/cumzillaraptors-send-runtime-candidate-v2/staging/N/cumzillaraptors.so
```

The `--url` value must be the one canonical root-only endpoint read once into memory, whose SHA-256 equals the signed authorization and runtime manifests. Its value must never be logged or persisted. No other option is permitted, including `--buffer`, `--skip-fee-check`, `--use-rpc`, `--final`, `--max-len`, `--with-compute-unit-price`, config-file switches, or an additional signer. The process must reject any different argument count, ordering, token, path, program command, or CLI executable. It contains no caller-controlled values, shell evaluation, wildcard expansion, relative path, response file, config-file fallback, or environment-derived argument.

Required process controls:

- executable is the hash-verified staged CLI only, never a `PATH` lookup;
- environment is cleared and rebuilt with `PATH=/usr/sbin:/usr/bin:/sbin:/bin`, fixed locale `LC_ALL=C`, `HOME=/nonexistent`, and no credential/key/RPC variables;
- working directory is a newly created root-owned `0700` staging directory;
- stdin: /dev/null;
- stdout/stderr are captured in bounded memory, redacted before persistence, and never treated as authorization;
- all nonessential inherited file descriptors are closed; only standard descriptors remain;
- one fixed wall-clock timeout and a fixed TERM-then-KILL policy are used;
- the child is spawned once only; it never retries, falls back, changes endpoint, or selects another binary;
- success requires exit status zero and a separately specified, sanitized postcondition check; process text alone is insufficient;
- no signed bytes, serialized transaction, private key, full endpoint, or raw CLI output is written to disk.

A future implementation must add deterministic fake-process tests for every process control above before it can reach a real CLI.

## 6. Durable nonce-state contract

For a valid future authorization nonce `N`, all state is beneath the fixed durable root and follows these create-once objects:

- Reservation lock: `reservations/N/`, created by atomic `mkdir`; it is ephemeral.
- Started evidence: `consumed/N/started.json`, created once before the single CLI spawn.
- Terminal evidence: `consumed/N/terminal.json`, created once after a normal child outcome.

`consumed/N/` is root-owned `0700`. Each state file is a root-owned `0600` regular file written through a fresh same-directory temporary file, `fsync`ed, atomically renamed only into an absent final pathname, then followed by parent-directory `fsync`. The implementation must reject pre-existing, symlinked, non-regular, incorrectly owned/mode, malformed, duplicate, or unexpected state objects.

The permanent state machine is exactly:

`absent → started → terminal`

There is no overwrite, append, replacement, downgrade, deletion, reuse, or retry transition. `started.json` and `terminal.json` are separate create-once files; terminal evidence never modifies started evidence. If restart/recovery finds `started.json` with no terminal file, the nonce remains permanently consumed with outcome `interrupted`; it must not infer a safe retry. Cleanup may remove only the reservation lock and private staging directories. It must never remove, rewrite, or downgrade durable consumed state.

## 7. Required future implementation sequence

This is a sequencing contract, not authorization to implement:

1. Write pure-schema tests for the canonical v2 paths, approval record, detached signatures, endpoint policy, CLI process specification, and state-file transition grammar.
2. Run those tests red, then implement only pure parsing/validation modules with no filesystem, process, network, key, transaction, signing, CLI-spawn, or send capability.
3. Obtain independent review of the pure contract implementation.
4. Draft a separate root-runtime implementation plan. That later plan must use TDD, root-only temporary test fixtures, and fake CLI/RPC adapters only.
5. Obtain another independent security review before creating a candidate runtime.
6. Stop again. A later explicit authorization is required for candidate-runtime creation, and a distinct later authorization is required for any actual one-time Devnet attempt.

## Explicit exclusions and stop point

No runtime, key, CLI, sudoers, or network action is authorized by this contract. No live authorization record is created. No Devnet request, signing, serialization of a submission transaction, broadcast, program deployment, initialization, collection creation, mint, claim, payment, upload, authority change, upgrade, or mainnet action is authorized.

After this v2 contract is independently approved, stop before implementation planning or any host change unless the user provides a new explicit scope decision.
