# v2 descriptor-pinned bootstrap (synthetic model)

This crate is a repository-only, synthetic Rust model for **Phase B Task 4a** of the descriptor-pinned bootstrap contract. It is **not** a privileged helper and does not interact with a host source tree.

## Deliberately implemented

- Adapter-supplied effective-root and caller-argument gate, checked before descriptor acquisition.
- A fail-closed `require_openat2` result that causes the model to issue an opaque capability proof only on success.
- Fixed, opaque synthetic source-root identity supplied internally to `acquire_fixed_root`; callers cannot provide it to the public entry point.
- Structurally distinct opaque root, component, and file descriptor tokens; `ValidatedSource` retains the file token.
- Capability-bound `open_beneath_no_symlinks` and `open_source_beneath_no_symlinks` model calls followed by an `fstat` regular-file check.
- Typed, non-echoing refusals and held opaque validated-source outcome.
- A separate, fixed Step 3 v5 fixture adapter extension. Its adapter supplies structured injected facts for revision, artifact SHA-256, size, authority, stage ID, ordered inventory, and a synthetic-byte-source classification; the model compares every field with private fixed policy values. It has no pre-approved observation value.
- v5 mismatch refusal before any staged copy or post-copy hash equivalent. The v5 opaque proof intentionally has no transfer API, so it cannot use the generic synthetic-only fixed seal.

The model and its tests are in-memory synthetic fixtures: they have no filesystem, process, network, or environment capability. The v5 byte-source classification is injected synthetic evidence only; it is never a claim of actual host artifact acquisition, does not name a host source, and does not seal real artifact bytes.

## Enforcement boundary

This trait is a synthetic contract only. Production system-call enforcement is explicitly deferred: the model cannot prove that a real system call supplied the modeled guarantees.

## Explicitly deferred to Task 4b or later

No host source bytes are transferred or acquired. No host post-transfer digest is computed. No host stage or destination is selected or created. No subprocess is spawned and no executable is run.

## Verification

```sh
cargo fmt --check --manifest-path tools/v2_descriptor_pinned_bootstrap/Cargo.toml
cargo clippy --manifest-path tools/v2_descriptor_pinned_bootstrap/Cargo.toml -- -D warnings
cargo test --manifest-path tools/v2_descriptor_pinned_bootstrap/Cargo.toml
```
