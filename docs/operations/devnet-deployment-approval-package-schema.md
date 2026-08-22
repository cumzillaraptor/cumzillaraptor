# Devnet deployment approval-package schema

## Status and immutable release binding

This is a repository-only schema for a later short-lived Devnet deployment approval package. It creates no approval record, live report, key verification result, signature, transaction, or authorization.

- Published predecessor commit: `262dfb8d69105edd5b97efec0145203574440f99`
- Program ID: `AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY`
- SBPF revision: `51d225d87ee36b6ac74e523cf8fdec86df35ea9b`
- SBPF SHA-256: `7af3f53c050aa613fd0a68ca461d93b51620e941775188f258ba33eb5305b44b`
- SBPF byte length: `411944`
- Upgrade authority: `71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r`
- Cluster identity: Solana Devnet only, with genesis hash `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`

## Required future package records

A later package must contain exactly the immutable release identity, one fresh public-key-only preflight report, one fresh unsigned deployment review, and placeholders for separate human approval and independent review references.

The exact canonical future package field order is: schema, release, preflight, unsigned_review, approval_placeholder, independent_review_placeholder, boundary.

The fresh reports must be generated after this schema is published and must agree exactly on program ID, revision, artifact SHA-256, artifact byte length, upgrade authority, Devnet genesis hash, and first-deployment state.

The package must reject missing, extra, reordered, duplicated, stale, malformed, or inconsistent records and must not infer approval from any digest, report, or prior packet.

## Required future approval boundary

The approval placeholder may authorize only review of the complete unsigned deployment transaction set and a bounded fee/rent cap; it may not authorize signing or sending.

The later public-key-only preflight must prove that the selected program keypair public key equals the bound Program ID, that the selected upgrade-authority public key equals the bound Upgrade authority, and that payer and upgrade authority are distinct. Private key material is never included in the package.

The later unsigned review must show the complete transaction summaries, required public signers, null signatures only, current first-deployment state, current balances, current rent/fee evidence, and current blockhash. Its blockhash and fee data are ephemeral and expire as chain state changes.

A valid future package is not authority to access keys, sign, send, deploy, initialize launch state, create a collection, mint, claim, fund, upload, or perform mainnet activity.

A separate final explicit confirmation immediately before signing or broadcast remains required even after a future package is approved.

## Explicit non-actions

This schema authorizes no repository publication, host action, RPC request, key access, transaction construction, signing, sending, deployment, or Devnet write.
