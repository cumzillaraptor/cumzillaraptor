# Cumzillaraptors Security Status

## DO NOT DEPLOY

The current on-chain artifact is **build-pipeline evidence only**. It is not authorized for devnet public minting, claims, or any paid transaction.

## Launch gate

Mint and claim functionality stays disabled until all of the following are complete:

1. A reviewed Metaplex Core implementation atomically delivers every asset.
2. Ethereum claims verify a domain-separated secp256k1 signature binding the ETH holder, NFT ID, Solana recipient, nonce, and expiry.
3. The public 247 / claim 173 allocation is immutable and enforced on-chain.
4. Program, frontend, metadata, and release artifacts pass the test and provenance checks described in `docs/plans/2026-07-29_secure-core-mint-claim.md`.
5. A controlled devnet rehearsal succeeds with explicit user approval.

## Key and funding safety

Before funding or deploying, run the final preflight command against the selected local keypair and compare the derived public key with the intended recipient address. Use a **verified keypair** only; do not rely on a historical address from chat or an unverified file path.

No seed phrase, private key, or keypair JSON may be committed, uploaded to GitHub, or sent in chat.

## Current frontend behavior

The public `cumzillaraptors/` page is intentionally informational. It has no wallet connection, transaction construction, signature request, or claim submission code.

## Scope

This status applies to the devnet rebuild. Mainnet deployment, public sales, and production website release remain out of scope until a separate approval and security review.
