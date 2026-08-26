# Durable-nonce claim flow (relaxed wallet approval window)

## Problem
Blockhash-based transactions expire after ~150 blocks (~60-90s). Mobile users
who take longer than that to approve in Phantom/Solflare get
"block height exceeded" and must retry.

## Solution: per-wallet durable nonce accounts

A transaction whose FIRST instruction is `SystemProgram::AdvanceNonceAccount`
and whose `recentBlockhash` equals the nonce account's stored hash stays valid
**until the nonce is advanced or the account is closed** — no time limit.

### Design

- **Nonce authority = the claimer (user's Solana wallet)**. The user always
  controls their own nonce; we never hold custody.
- **Rent + fees funded by the deployer payer**: creating a nonce account costs
  ~0.0015 SOL rent, paid by the deployer in a setup tx (user pays nothing).
- **One nonce per wallet**, PDA-style derived off-chain:
  `nonce = findProgramAddress([utf8("cumz-claim-nonce"), claimer], deployerProgramId)`
  — deterministic so the page can find it without a registry. NOTE: these are
  plain system nonces; the "PDA" here just means a deterministic address the
  deployer can recompute — created via SystemProgram.initializeNonceAccount
  with `nonceAuthority = claimer`.
- **Claim tx shape (v0 message)**:
  1. `advanceNonce { nonceAccount }` (system program)
  2. `claim_nft_batch ...` (program)
  - `recentBlockhash` = the nonce hash READ FRESH at build time; valid forever
    until used.
  - ALT still used for static keys to stay under 1232 bytes.
- **Wallet path**: use `provider.signTransaction` + page-side
  `sendRawTransaction` for nonce txs (Phantom's `signAndSendTransaction` may
  substitute its own recent blockhash, which would break durability).

### Flow on the page

1. On Solana connect, derive the expected nonce address and fetch it.
2. If missing/uninitialized → button "prepare relaxed claiming" → builds a
   setup tx (deployer pays rent? NO — deployer cannot pre-sign; instead the
   USER pays ~0.0015 SOL once) → initializeNonce(nonceAuthority=claimer).
   Simpler and trustless: **user funds their own nonce account**.
3. When claiming with an initialized nonce present: read stored blockhash,
   build [advanceNonce, claim] tx, sign via signTransaction, send raw,
   confirm by websocket/poll (no blockheight dependence).

## Status
- d2 script: scripts/setup-claim-nonce.js (devnet tooling)
- d3 page support: pending
