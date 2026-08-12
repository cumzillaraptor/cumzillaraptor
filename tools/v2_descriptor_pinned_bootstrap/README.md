# v2 descriptor-pinned bootstrap (synthetic model)

This crate is a repository-only, synthetic Rust model for **Phase B Task 4a** of the descriptor-pinned bootstrap contract. It is **not** a privileged helper and does not interact with a host source tree.

## Deliberately implemented

- Adapter-supplied effective-root and caller-argument gate, checked before descriptor acquisition.
- A fail-closed `require_openat2` result that causes the model to issue an opaque capability proof only on success.
- Fixed, opaque synthetic source-root identity supplied internally to `acquire_fixed_root`; callers cannot provide it to the public entry point.
- Structurally distinct opaque root, component, and file descriptor tokens; `ValidatedSource` retains the file token.
- Capability-bound `open_beneath_no_symlinks` and `open_source_beneath_no_symlinks` model calls followed by an `fstat` regular-file check.
- Typed, non-echoing refusals and held opaque validated-source outcome.

The integration tests build temporary marker trees and derive a synthetic snapshot using marker metadata, including actual symlink metadata. The model itself neither reads environment variables nor uses filesystem, subprocess, networking, runtime resolution, transfer, hashing, staging, destination, or execution behavior.

## Enforcement boundary

This trait is a synthetic contract only. Production system-call enforcement is explicitly deferred: the model cannot prove that a real system call supplied the modeled guarantees.

## Explicitly deferred to Task 4b or later

No source bytes are transferred. No post-transfer digest is computed. No stage or destination is selected or created. No subprocess is spawned and no executable is run.

## Verification

```sh
cargo fmt --check --manifest-path tools/v2_descriptor_pinned_bootstrap/Cargo.toml
cargo clippy --manifest-path tools/v2_descriptor_pinned_bootstrap/Cargo.toml -- -D warnings
cargo test --manifest-path tools/v2_descriptor_pinned_bootstrap/Cargo.toml
```
