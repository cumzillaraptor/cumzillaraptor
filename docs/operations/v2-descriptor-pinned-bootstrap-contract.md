# v2 descriptor-pinned bootstrap contract

## Status and scope

This is contract documentation/specification only; it is not Rust code or a helper implementation. It authorizes no host action, helper creation, helper execution, installation, staging, destination selection, or runtime replacement.

The contract is Linux only, with the openat2 syscall; there is no portability fallback. It freezes the minimum syscall-level boundary required before privileged code may be proposed. It does not claim that a shell pathname check/copy/hash sequence is race-safe.

The legacy candidate path is permanently excluded: `/opt/cumzillaraptors-send-runtime-candidate-v2`.
The current active runtime is permanently excluded.

## Entry gate, environment, and refusal API

The future Rust helper API is specified only by these conceptual types, not by an implementation:

- a private zero-argument entry point returning `Result<BootstrapOutcome, BootstrapRefusal>`;
- `BootstrapRefusal` has typed, non-echoing cases including `NotEffectiveRoot`, `CallerInputPresent`, `Openat2Unavailable`, `ResolutionViolation`, `NotRegularFile`, `StageAlreadyExists`, `SealMismatch`, `UnapprovedConstants`, and `ExecutionNotApproved`;
- no public or private caller API accepts arguments, environment, paths, a manifest, a commit, or a digest as input.

Before any source or destination interaction, the helper must decide that the effective UID is root and there are no caller arguments. It accepts no caller arguments, environment, paths, manifest, commit, or digest input, and rejects those inputs before even opening source or destination. A gate failure is a typed refusal without echoing input.

Inherited environment is neither parsed, read, nor consulted for any authority, path, seal, or behavior. The helper begins with only hard-coded compile-time identities. No environment sanitization implementation is authorized in this contract; no environment-derived behavior is permitted. The contract makes no broader claim about root creation, system APIs, or byte-wrapper APIs.

## Compile-time identities, release seal, and approval gates

The source root is identified solely by a private compile-time source-root identity. Its descriptor acquisition path is fixed only when that private identity is compiled after approval; this document contains no literal host source candidate string. `FUTURE_STAGING_CONSTANT` and `FUTURE_DESTINATION_CONSTANT` are fixed FUTURE staging and destination constants, but their values are TODO and unselected here. There is no fixed staging or destination path. Actual fixed installer-stage path: NOT DECIDED.

The exact Phase B release seal is fixed compiled-in/operator-provisioned trusted data, selected only at compile time after separate approval. No file, environment, configuration, caller value, runtime manifest, or reference may select, reload, or replace it. The compiled trusted seal retains the complete pinned commit, strict canonical grammar, exact complete allowlist, per-entry actual-bytes digests, and package/lock/dependency cross-binding defined in `v2-phase-b-release-seal-format.md`.

The API cannot create until those additionally approved constants are compiled; no runtime configuration may select or replace them. It cannot run until the compiled release seal is separately approved and a later host-specific staging path is independently approved. The future helper must compare the post-copy digest only to this compiled trusted seal. There is no on-disk seal/manifest action.

## Descriptor-pinned resolution and file transfer

Acquire the initial fixed root descriptor only through the later-approved private compile-time identity. From that point, use Linux openat2 with `RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS`. If openat2 is unavailable, fail closed. It must not use openat, stat, or any other pathname fallback.

Retain trusted directory descriptors for every component after `/`, and use descriptor-relative opens only. Every descriptor-relative operation is relative to a retained trusted FD. Never construct an absolute, stage, destination, or source path after initial fixed root acquisition; no `/proc/self/fd` escape or reopen is permitted.

Create only descriptor-relative beneath the retained approved staging-parent FD: create the staged file using `O_CREAT | O_EXCL | O_NOFOLLOW` with restrictive `0600`. Preexistence must be a typed refusal. Immediately `fstat` the staged FD; require a regular file, root ownership, and mode only under separate later approval. The actual owner/mode policy is a future approved compile-time constant. No chown/chmod behavior implementation is permitted now. There is no path reopen or replacement.

Use `O_NOFOLLOW` and `fstat` for the specified descriptor checks. Source and staged artifacts must be regular files. The required transfer is: copy from the open source FD to this exclusive staged FD; rehash the staged FD from its held descriptor after copy; and compare the post-copy digest only to this compiled trusted seal before execution or install. No stage-path lookup is permitted. This is a contract constraint, not a claim that the present repository contains a byte-copy wrapper.

## Prohibited capability surface and future work

The future helper has no system, no execve checkout source, no shell/PATH lookup, fallback, retry, network, secrets, or Solana capability. It must not obtain a checkout source through `execve`, consult a shell or `PATH`, or retry through alternate path resolution.

Later separate tests and approval are required before any helper execution or install. Those later tests must cover the compiled approved constants, typed pre-open refusals, `openat2` availability refusal, descriptor retention, regular-file checks, staged-descriptor hashing and compiled-seal binding, and the separately approved host-specific staging path.
