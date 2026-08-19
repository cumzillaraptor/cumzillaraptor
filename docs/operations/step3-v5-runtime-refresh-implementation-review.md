# Step 3 v5 root refresh implementation review

## Scope and predecessor

This is a repository-only implementation review of the later v5 no-send protected-runtime refresh. It is not a host gate, execution procedure, installer, or authorization record.

- Predecessor commit: `2092ffa54628641a31ef2c44e23d050e4545be68`
- Predecessor contract SHA-256: `3fee0ea99385dbf733b86ad21aa836968383ed7a0be541c8288f85e4a73cc2cb`
- Production SBPF revision marker: `8b5bcf1d9278b61780be33dc2e4a9707859155da`
- Production SBPF SHA-256: `7af3f53c050aa613fd0a68ca461d93b51620e941775188f258ba33eb5305b44b`
- Production SBPF byte length: `411944`
- Compiled launch authority: `71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r`
- Required v5 stage identifier: `step3-refresh-v5`
- Required v5 inventory: review-only source, prepare-only executor source, manifest, production SBPF artifact, revision marker
- Decision: `BLOCKED_NO_DESCRIPTOR_PINNED_SOURCE_ACQUISITION`

## Review result

No executable root refresh procedure is approved at this gate. The existing shell-template model proves useful refusal semantics only; it does not provide descriptor-pinned source acquisition. A privileged implementation may not obtain files from mutable checkout paths through pathname `stat`/hash/copy sequences and claim that the selection is race-safe.

- No root execution command, installer, launcher, sudoers change, runtime replacement, or artifact copy is authorized by this review.
- The v4 stage and active protected runtime remain untouched and uninspected.
- Do not use a checkout path, `/tmp` download, any cache, or mutable local artifact directory as a privileged source.

## Required prerequisite before a later v5 implementation

- A future implementation must use a separately reviewed Linux descriptor-relative source-acquisition helper starting from an authenticated root FD and `openat2(RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS)` with no fallback.
- The helper must bind each obtained byte stream to a fixed object identity and a fixed SHA-256 before a root-owned v5 stage can be created.
- The later helper review must pin the complete v5 file inventory, fixed source identities, exact modes, root-only stage parent, create-once stage basename, artifact marker/size/SHA-256 equality, and public-key-only identity comparison.
- It must reject symlinks, pre-existing stages, source or staged hash mismatch, object-identity mismatch, unavailable `openat2`, cleanup uncertainty, and every unapproved output or capability.

## Non-authority boundary

- The user-supplied Devnet approval remains limited to the finite rehearsal plan; it is not approval for this root refresh.
- A future successful no-send refresh and `--prepare` report remain non-authoritative for signing, sending, or deployment. A separate fresh review and explicit approval remain required for any future signing or sending consideration.

## Explicit non-actions

This review does not authorize repository publication, host access, credentials or keypair contents, artifact download, stage creation, installer execution, runtime replacement, RPC use, transaction construction, signing, deployment, funding, minting, claiming, upload, mainnet activity, or any Devnet write.
