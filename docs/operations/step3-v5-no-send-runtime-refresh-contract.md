# Step 3 v5 no-send protected-runtime refresh contract

## Purpose

This repository-only contract defines the later, separately authorized refresh boundary for the stale protected **prepare-only** Devnet runtime. It selects no root command, credential location, keypair contents, RPC credential, live transaction, signature, or broadcast.

## Immutable approved inputs

- Published migration revision: `8b5bcf1d9278b61780be33dc2e4a9707859155da`
- Production SBPF SHA-256: `7af3f53c050aa613fd0a68ca461d93b51620e941775188f258ba33eb5305b44b`
- Production SBPF byte length: `411944`
- Compiled launch authority: `71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r`
- New opaque, input-independent stage identifier: `step3-refresh-v5`

These bindings are integrity requirements only. They do not authorize host access or an operational refresh.

## Fresh-stage and provenance requirements

- The existing v4 stage is permanently excluded: do not inspect, reuse, alter, or remove it.
- A fresh v5 stage must not exist (including as a dangling symlink); collision is a terminal refusal.
- The refreshed package must contain exactly: the current review-only source, the current prepare-only executor source, their manifest, the production SBPF artifact, and its revision marker.
- Every v5 staged file must be a non-symlink regular file, root-owned, exact mode, and SHA-256-verified after copy and again immediately before any use.
- The staged production artifact SHA-256 must equal the immutable value above and its byte length must equal `411944`; the staged revision marker must equal the published migration revision above. Any mismatch refuses.
- The artifact and marker must be copied into a fresh root-owned artifact stage; no mutable checkout, temporary directory, cache, or previous artifact root may be consumed.
- The operator must verify the program, payer, and upgrade-authority public keys only; it must never print keypair contents.
- The upgrade-authority public key must equal the compiled authority above; any mismatch refuses before the review begins.

## No-send boundary

- The runtime refresh may run only `--prepare`; `--send`, Solana CLI deployment, signing, serialization, broadcasting, launch initialization, collection creation, minting, claiming, funding, upload, and mainnet activity are prohibited.
- The existing root-owned launcher and active runtime are not selected, inspected, modified, or relied on by this contract.
- A successful `--prepare` remains evidence only and is not authority to sign, send, deploy, or perform any later rehearsal transaction.

## Later gates

- A later separately authorized root execution may be considered only after a host implementation review and an explicit user approval.
- That later execution must produce a fresh, canonical no-send report proving the current artifact and authority bindings. Any mismatch, missing item, unsafe metadata, stale stage, or uncertain result refuses.
- A separate fresh review and separate explicit approval remain required before any signing or send consideration.

## Explicit non-actions

This contract does not authorize repository publication, root access, runtime replacement, artifact download, private-key access, Ethereum signing, Solana signing, transaction construction, transaction serialization, deployment, funding, or any Devnet write.
