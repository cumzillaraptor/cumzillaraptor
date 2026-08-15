# V2 r1 Step 16 Helius secret-handoff implementation review

## Status and published binding

This implementation-review package is repository-only. It is bound to the published Step 16 secret-handoff contract revision `36b0ff3e861c720f1e5488070bd56ea3b5ff5d94`; no branch, working tree, caller input, environment, configuration, path, URL, or endpoint can substitute that revision.

The reviewed source is `scripts/v2-r1-helius-secret-handoff.mjs` with its injected-dependency unit test `tests/v2-r1-helius-secret-handoff-adapter.test.mjs`. It is not a host invocation, secret read, runtime wrapper, reviewer invocation, RPC request, signing, sending, deployment, or launch procedure.

## Reviewed repository-only behavior

The adapter has one fixed secret-file constant: `/home/piadmin/.config/cumzillaraptors/helius-devnet-rpc.url`. It accepts no secret path, URL, CLI, environment, or configuration input. This is an **in-memory, injected primitive model only**. Its caller supplies a retained `rootHandle`, injected retained-handle primitives (`openDirectoryNoFollow`, `openFinalNoFollow`, `fstat`, `readHeldFile`, and `close`), pinned-reviewer-source dependency, and an immutable numeric expected-owner object. The caller retains ownership of `rootHandle`; the adapter never closes it.

Before a secret value can be read, the adapter verifies the fixed reviewer bytes against the published SHA-256 `eed10be9a2b5cb11dce9c5a217fad0419a6f096f5597b80671ed0d0e30b0bdae`. It directly `fstat`s the caller-provided root handle and requires a non-symlink directory owned by numeric uid/gid `0/0` with exact mode `0755`; this root policy is a fixed model fact, not piadmin identity selection. It then opens `home` using that retained root handle, then each remaining fixed component through the preceding retained directory handle, and directly `fstat`s each retained handle. Every component must be a non-symlink directory; the immediate containing directory must also have the injected owner/group and exact mode `0700`.

Only beneath that retained verified parent, the adapter opens the fixed basename `helius-devnet-rpc.url` with model no-follow semantics, `fstat`s the held final file, and requires a non-symlink regular file with the injected owner/group and exact mode `0600`. It reads solely through that held verified file handle. The adapter never reads the secret by pathname after metadata validation. Every opened directory or final handle must be a non-null object distinct (via `Object.is`) from the caller-owned root and every previously retained adapter-owned handle before it is used or retained. The adapter refuses an opener result that aliases the caller-owned root handle or a previously retained adapter-owned handle; it never closes the root and closes each distinct adapter-owned handle at most once in reverse acquisition order.

The public handoff function contains hostile injected dependency, metadata, and identity exceptions: argument access, reflection, reviewer checks, root and held metadata predicates/accessors, traversal, and cleanup all fail closed to frozen opaque denials without an error detail or URL. Open, stat, read, alias, or cleanup failures likewise deny opaquely. The synthetic tests model a replacement-with-symlink pathname race after final open, but this JavaScript model cannot itself prove OS descriptor provenance or establish real OS `O_NOFOLLOW` semantics from arbitrary injected primitives.

The raw secret value is accepted only when it exactly matches the canonical ASCII grammar `https://devnet.helius-rpc.com/?api-key=<token>` with nonempty `[A-Za-z0-9_-]+` token. Denials are frozen opaque result objects that contain no URL. A successful frozen result carries the URL solely for a later separately authorized wrapper to retain in private process memory; the module itself has no output, log, process, network, or reviewer-invocation capability.

## Deliberate non-selection and remaining authorization boundary

This review selects **no uid or gid**. Numeric `piadmin` uid/gid facts remain pending a later separately authorized host metadata check; they must not be guessed, inferred from a username, environment, or repository text. Without a frozen verified numeric identity, the adapter deliberately denies.

This package creates no authorized host wrapper and performs no host execution. It makes no RPC/Devnet request and has no authority to access a secret, invoke the unsigned reviewer, sign, serialize for submission, send, deploy, spend, fund, initialize, mint, claim, upload, upgrade, change authority, access mainnet, or launch. A later host metadata check, wrapper review, and explicit authorization are each separate gates.

The adapter must never be used directly as a host secret reader. A later, separately reviewed concrete native host wrapper must open a root FD itself and supply operations with real OS-enforced descriptor-relative `O_DIRECTORY/O_NOFOLLOW` (or platform-equivalent) behavior, final `O_NOFOLLOW`, `fstat` and FD read. That wrapper must be independently audited/tested before any secret handoff. Until then, this package remains review-only/non-authoritative.

## Test and capability evidence

The unit test uses only injected synthetic handles, metadata, and secret values; it never reads the piadmin-local file. It covers fixed retained traversal, no-follow final open, held-file metadata, immutable identity refusal, ancestor and owner/mode/type refusal, a final-name TOCTOU replacement to a symlink after open, no pathname read, no-follow open/fstat/held-read/close failures, cleanup, canonical URL acceptance, malformed and ambiguous URL refusal without echo, frozen results, reviewer-byte pin, and lexical absence of `fs`, `child_process`, `net`, `http`, `https`, `tls`, logging, fetch, and spawn/exec capability.

Passing repository tests is not secret-handoff, host, RPC, signing, sending, deployment, or publication authority.
