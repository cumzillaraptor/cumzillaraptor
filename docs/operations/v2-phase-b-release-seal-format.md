# v2 Phase B release seal format

A Phase B release seal is the production input for a separately authorized future privileged helper. It is distinct from the Phase A synthetic manifest: it pins published repository bytes, not labeled fixture text.

## Grammar

A seal is UTF-8 text using LF line endings and contains only these records, in this order: the three header records followed by entry records. Each record label (`format:`, `repository:`, `commit:`, and `entry:`) is followed by exactly one ASCII space (`0x20`), with no tab, additional space, or other whitespace. Each `entry` has exactly one further ASCII space between its digest and path. There are no comments, no blank lines, and no symlink entries. The final entry is followed by exactly one single LF (`0x0a`) and no other trailing byte.

```text
format: cumzillaraptors-v2-release-seal-v1
repository: cumzillaraptor/cumzillaraptor
commit: <40-or-64-lowercase-hex immutable full commit id>
entry: <sha256-64-lowercase-hex> <repository-relative-regular-file-path>
```

`commit` is a complete immutable 40- or 64-character lowercase ASCII hexadecimal commit ID, never an abbreviated identifier, branch, tag, or mutable ref. Each `entry` digest is exactly 64 lowercase ASCII hexadecimal characters: the SHA-256 actual-byte digest of that regular file at the pinned commit, not a digest of fixture text, metadata, or a pathname.

## Explicit runtime artifact allowlist

The entry path must exactly equal one complete item in the explicit runtime artifact allowlist below; prefixes, suffixes, normalization, aliases, and partial matches are invalid. Symlink entries are forbidden. Entries are sorted by their repository-relative path using UTF-8 byte sorting. The seal must contain exactly one entry for every allowlist item: no missing entry, no extra entry, and no duplicate entry.

The explicit runtime artifact allowlist is:

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

## Trusted production source

The Phase B production seal is fixed, operator-provisioned, embedded trusted data in the separately authorized future helper or its protected deployment configuration. It is not a caller input. Every caller-supplied Phase B seal, commit ID, digest, or entry record is rejected and non-authoritative; validation compares only against the fixed trusted data.

The static Phase A synthetic manifest is never a release seal and is never supplied to a privileged helper. It remains a pure model fixture only. This document authorizes no host action.
