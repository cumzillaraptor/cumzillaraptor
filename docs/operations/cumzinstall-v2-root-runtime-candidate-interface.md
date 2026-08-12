# cumzinstall v2 root runtime candidate interface

candidate-root: /opt/cumzillaraptors-send-runtime-candidate-v2
invocation: no arguments
prerequisite: effective uid 0 (root)

## Phase A boundary

This is a static specification only, not an executable installer. Phase A creates no candidate directory and performs no installation. A later, separately authorized helper is required before any privileged action.

The later helper must reject non-root before parsing arguments, source hashing, or filesystem changes, and must reject every argument. It must use a descriptor-pinned, no-follow, descriptor-relative design with post-open byte hashing; pathname check/copy/hash sequences are not sufficient.

## Fixed sealing policy

The future helper has one fixed absolute source root, `/home/raspberrypi/workspace-cumzillaraptor`, and one fixed absolute destination, `/opt/cumzillaraptors-send-runtime-candidate-v2`. It uses fixed absolute paths and SHA-256 hashes from an immutable expected source-digest map derived from canonical labeled synthetic fixture text. Caller-provided matching manifest records or digest pairs are not authoritative.

The candidate seal includes sealed package.json, package-lock.json, and dependency tree cross-bindings, plus these exact required file entries:

- `package.json`
- `package-lock.json`
- `node_modules/example/index.js`
- `scripts/future-send-v2-schema.mjs`
- `scripts/prepare-launcher.mjs`
- `scripts/v2-root-runtime-prepare-contract.mjs`
- `scripts/v2-root-runtime-provenance.mjs`
- `scripts/v2-root-runtime-prepare-coordinator.mjs`
- `tests/v2-root-runtime-prepare-contract.test.mjs`
- `tests/v2-root-runtime-prepare-coordinator.test.mjs`
- `tests/v2-root-runtime-provenance.test.mjs`

The helper must refuse missing, extra, substituted, non-file, symlink, non-pinned, or no-follow-violating entries. It must bind the package, lock, and dependency-tree cross-digests to that complete exact seal.

## Required helper execution environment

Every utility is invoked by an absolute trusted path; the future helper must not search the caller PATH or invoke a shell. Before any validation or copy, it must discard inherited environment values and construct this exact safe environment: `PATH=/usr/sbin:/usr/bin:/sbin:/bin`, `LC_ALL=C`, and `HOME=/root`. It must use only that fixed environment for every helper invocation.

The pure Phase A model treats caller environment and cleanup properties as non-authoritative metadata. Its frozen model acceptance plan exposes only the internally fixed safe data: `environment: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LC_ALL: 'C', HOME: '/root' }` and `cleanup: { trapInstalledBeforeTemporary: true, temporaryClearedOnlyAfterSuccessfulRename: true, cleanupOnFailure: true }`. It never echoes caller environment or lifecycle values.

### Future-helper utility inventory

The later helper has this closed inventory of literal absolute utility paths: `/usr/bin/sha256sum` for pinned post-open SHA-256 hashing; `/usr/bin/stat` for descriptor-validated type, ownership, and mode checks; `/usr/bin/mkdir` for create-once staging directories; `/usr/bin/cp` for copy without dereference; `/usr/bin/chown` for root ownership; `/usr/bin/chmod` for required modes; `/usr/bin/mv` for the same-parent atomic rename; and `/usr/bin/rm` for descriptor-revalidated temporary-state cleanup. The helper must retain the descriptor-pinned/no-follow requirements for each operation; this inventory does not authorize path-based validation.

`/usr/bin/awk`, `/usr/bin/printf`, and `/usr/bin/wc` are not applicable and are not invoked: this static design needs no text parsing, formatting, byte-counting, shell command substitution, or pipeline. Every utility invocation, including any invocation that a future implementation might otherwise place in a substitution or pipeline, must use the literal absolute inventory path and no PATH lookup; a shell substitution or pipeline remains prohibited by the no-shell requirement.

## Staging, cleanup, and atomic destination policy

Staging is create-once. The future helper must refuse a preexisting stage or destination, including a symlinked stage or destination. Before stage, copy, temporary placement, or rename, it must validate every parent directory using descriptor-relative no-follow operations.

The pure model records an ordered immutable synthetic metadata list named `ancestors` for each of `source`, `stage`, `destination`, `temporary`, and `rename`, rather than reducing validation to one direct parent. Every ancestor record must describe a real directory with `path`, `type: 'directory'`, `isSymlink: false`, `uid: 0`, a non-group/world-writable `mode`, `descriptorPinned: true`, and `noFollow: true`; every record in every accepted chain must validate. Destination-facing records additionally carry `parent` as a trusted synthetic `{device,inode}` identity, and the terminal ancestor record is bound to that identity.

The helper must install a cleanup trap before temporary state is created. The cleanup trap must clear temporary state on failure or signal before return; after a successful atomic rename it must clear the temporary-state record without deleting the renamed destination. Cleanup may remove only the exact temporary path it created after revalidating it by descriptor, and must never delete/reuse a pre-existing path.

Atomic destination semantics are mandatory, not a future design choice. The helper must retain and compare literal destination-parent identity (device and inode) from validation through rename: `temporary.parent`, `destination.parent`, and `rename.parent` identities must be exactly equal. The candidate destination parent is literally `/opt`, so the temporary path is beneath that parent (`/opt/.candidate-temp`), never beneath the stage. It must create each temporary path under that same directory, perform no-follow/open validation for the temporary and destination-parent descriptors, and create the temporary file with mode `0600` and root ownership before copy. It must post-copy hash/mode validation against the pinned source digest and required mode, atomically rename only into the validated literal destination parent, and perform final revalidation of the destination descriptor, ownership, mode, and hash. It must refuse a pre-existing destination: no delete/reuse of a pre-existing path is permitted to make rename succeed.

## Explicit exclusions

There are no keys, no artifact bytes, no endpoint bytes, no Solana CLI, no network, no send, no sudoers, and no active-runtime replacement in this specification or Phase A model. It does not read host files, create directories, copy files, invoke a shell, or change a runtime.
