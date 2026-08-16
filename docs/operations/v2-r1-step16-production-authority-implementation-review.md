# Step16 production-authority fixture-model implementation review

## Status and pinned predecessor

This review covers a repository-only, fixture-only C model created after trusted-boundary architecture commit `4f4efc22055992bfd025f8c2988c5e28a8ce5a56`, whose immediate predecessor is `f3f0a64b2da9b50717817a3332aea1d1e273ff75`. Those published revisions are historical design bindings only. This model is **not a production authority** and it does not select a canonical root, identity, compiler, source bytes, stage, host fact, or authorization.

No host enforcement occurs here. The model has no live capabilities: it does not inspect a host, keys, runtime, current repository root, worktree, object database, compiler, descriptor, or any external service. It does not authorize or perform activation, replacement, stage creation, compilation, execve, build, wrapper use, endpoint access, network/RPC, signing, sending, deployment, commit, or publication.

## Review-only model boundary

`production_authority.c` has no `main` and deliberately fails compilation unless `STEP16_PRODUCTION_AUTHORITY_REVIEW_FIXTURE` is supplied. The only executable is the isolated test fixture; it supplies synthetic, injected facts entirely in memory. The fixture performs no filesystem operation, creates no temporary directory or file, and leaves no filesystem residue. It is not a production helper and is never an implementation of a privileged boundary.

The C library and fixture neither read nor stage any artifact. They have no filesystem, process, network, Git-command, procfs, endpoint, secret, compiler-launch, or current-host selection surface. Their inputs are already modeled results and capability tags. The lexical test locks that prohibition down independently of the model behavior.

## Modeled capability composition

The model accepts only a composed request whose injected policy contains exactly six inventory rows. Each modeled Git-reader result must map one-to-one to a fixed historical commit, tree, repository-relative path, blob, and SHA-256 inventory row. It carries bounded-byte identity and cap facts, and rejects a missing, extra, duplicate, substituted path, object, digest, byte cap, or non-valid result. These are modeled reader outputs, not a Git reader.

Canonical-root evidence is a capability token with a valid state, bounded freshness interval, capability tag, approval and authority references, and the injected fixed commit/tree facts. A caller root or caller worktree input is rejected before composition. No pathname or current working-directory fact is accepted.

Opaque issuance is represented only by a private verification state, private binding tag, and issuer tag. Raw identifiers are intentionally absent from the API. Any unknown state, binding mismatch, issuer mismatch, replayed state, or other non-verified opaque result is rejected.

Linux containment is represented by an injected openat2 capability report. A missing/unsupported report, a non-valid result, a wrong capability tag, or absence of either `RESOLVE_BENEATH` or `RESOLVE_NO_SYMLINKS` is rejected. This validates no syscall and supplies no fallback behavior.

The policy, not the request or compiler evidence, owns the fixed expected execve manifest. Compiler evidence carries only its own fresh token and a compiler identity tag that must equal the policy compiler identity tag. Validation requires the policy manifest to exist, have no inherited environment, and be exact before it compares the request launch manifest to that policy-owned value; no request field can replace the expected manifest. The manifest rejects altered argv/envp length or value and arbitrary `-D` and `-include` arguments. It does not invoke a compiler or any process.

B (reader), D (stage/containment), and E (compiler) evidence must be valid and fresh with non-null approval/authority references. Root, reader, stage, and compiler approvals must be independent; a missing or reused approval fails closed. Unknown enums and absent tags are not treated as success.

## Fixture coverage and non-authority conclusion

The fixture verifies one synthetic positive composition plus expiration/release, wrong/missing/extra inventory (including exactly seven results), object/blob/digest/cap mismatches, missing bounded-byte tags, invalid Git result state, opaque private-binding, issuer-mismatch, and replay failures, non-valid or wrong-capability containment reports, absent and weak openat2 flags, caller root/worktree injection, missing or inherited policy manifests, inherited environment, launch argv substitution, `-D` and `-include` argv mutation, compiler identity mismatch, expired/invalid compiler tokens, and missing independent approvals. It prints only the fixed nonsecret result `production-authority fixture: 30 checks passed` on success. All strings are synthetic facts; there are no encoded endpoint paths, URLs, or source payloads.

A passing fixture proves only that this review model rejects the listed malformed injected inputs. It is not host enforcement, does not authenticate any live capability, and grants no operational authority. Any future authority implementation requires a new separately authorized design, source review, host evidence, independent approvals, and dedicated live-operation gates.
