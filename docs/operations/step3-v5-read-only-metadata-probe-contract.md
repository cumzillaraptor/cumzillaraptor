# Step 3 v5 future read-only metadata-probe contract

## Status and immutable predecessor binding

This is a repository-only design contract for one possible future metadata-only probe. It is not a host gate, command, helper implementation, inspection, or authorization record.

- Published Step 3.9 predecessor commit: `ed7b55f1a3c858ee4ba40aa2e4cd91890458a23e`
- v5 refresh-contract SHA-256: `3fee0ea99385dbf733b86ad21aa836968383ed7a0be541c8288f85e4a73cc2cb`
- v5 implementation-review SHA-256: `c4d775b59f81636407488ca858fb2bf318f73b34cc3a8b41cd477a435366d570`

This contract selects no host path, trusted root descriptor, source root, stage parent, destination, key location, endpoint, command, or helper binary. It nominates no object for inspection and creates no authority to discover one.

## Required future authorization and narrow scope

A future probe requires a separate explicit human host-gate approval after a concrete parent and one exact leaf are selected and independently reviewed. That separate approval must bind the complete predecessor commit, this exact repository-relative contract path, this contract's complete-byte SHA-256, one authenticated retained parent descriptor, and one exact relative leaf basename before any host operation.

The exact future parent and leaf must be bound by a separate immutable authorization record before any host operation; this document does not nominate them. The only permitted observation categories are non-dereferencing existence, file type, numeric uid, numeric gid, and octal mode.

The future probe must never read file contents, list directories, recurse, glob, resolve or print symlink targets, hash bytes, open a regular file for content, access keys, access endpoints, invoke RPC, sign, send, deploy, or change host state. It must not inspect adjacent objects, infer a source or stage, or treat a result as source-acquisition evidence.

The previously excluded stage and active runtime remain permanently excluded: they are not probe targets, source, stage, destination, or fallback.

## Descriptor-only future mechanism

The future probe must start from a caller-retained trusted root FD and acquire every approved component through Linux `openat2(RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS)` with held-FD `fstat`, no pathname reconstruction, no `openat` fallback, no retry, and no compatibility path. The authenticated retained parent descriptor and exact leaf basename are the only future resolution inputs. No current implementation or syscall invocation is authorized here.

If evidence is missing, inaccessible, symlinked, malformed, ambiguous, substituted, stale, or uncertain, the probe must emit only a typed opaque denial and stop. It must not echo a path, symlink target, key, endpoint, object contents, or underlying system error.

The future canonical report is exactly one LF-terminated ASCII line and no other bytes. A denial is exactly `DENY opaque-metadata-refusal\n`. A metadata result is exactly `META regular <uid> <gid> <mode>\n`, where `<uid>` and `<gid>` each match `0|[1-9][0-9]*` and `<mode>` matches `[0-7]{4}`. A `META` result is allowed only for the one exact authorized regular leaf; every symlink or unsupported type produces exactly `DENY opaque-metadata-refusal\n` without target facts.

## Non-authority conclusion

A successful metadata probe is evidence only and authorizes no source acquisition, stage creation, runtime refresh, `--prepare`, key access, RPC, signing, sending, or deployment. Any later source acquisition, root-only refresh, no-send prepare, or Devnet action requires its own freshly reviewed design, explicit authorization, and evidence.

## Explicit non-actions

This contract authorizes no repository publication, host access, root execution, filesystem inspection, secret/key access, network/RPC call, transaction construction, signing, sending, deployment, or Devnet write.
