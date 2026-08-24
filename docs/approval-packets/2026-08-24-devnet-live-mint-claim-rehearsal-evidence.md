# Devnet live rehearsal evidence — mint #2 + claim #4 (in-program secp design)

**Prepared:** 2026-08-24

**Status:** Completed devnet rehearsal evidence. Records transactions that already executed on Solana devnet after explicit user approval. No mainnet action, no key material, and no future authorization.

## Source revision & deployment

| Field | Value |
|---|---|
| Repository | `cumzillaraptor/cumzillaraptor` |
| Source revision | `e00189b` (`8da7c28` contract change + fixture SigningKey fix) |
| x86 gate | [Build Solana Program #32674729341](https://github.com/cumzillaraptor/cumzillaraptor/actions/runs/32674729341) — `success` (all Bankrun gates + mandatory atomic Core-CPI claim gate 4/4) |
| Deploy | [Deploy Program to Devnet #32676855481](https://github.com/cumzillaraptor/cumzillaraptor/actions/runs/32676855481) — `success` |
| Program ID | `AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY` (executable, BPFLoaderUpgradeable) |
| Post-upgrade state intact | config 270B, registry 586B, collection Core-owned — all preserved |

Failed/aborted runs kept for the record: CI `32674171351` (fixture `signingKey.signDigest` TypeError — fixed in `e00189b`); deploy `32676017354` (payer below 4.1 SOL, faucet dry; user topped up payer).

## Leg (a) — public mint #2

- Buyer: ephemeral Pi-held keypair `DLjaSDpU5s8uAoqb9RNHokDnv9DENuzsoZAZuPt95Bvf` (funded by user from own wallet; never committed)
- Tx: `36JkCNc47V2E99rkBJFqAQeeGLuzCF1wrwYi3cnKPPQQcN62AB1QQhJyAzYDUuRnVoz3aeu6UskC1JkFP3ttmzM5`
- Treasury delta: **exactly +1.000000 SOL** (`FiHKQhwq…rovU6`, 70.999760 → 71.999760)
- Buyer delta: −1.003370 SOL (1 SOL price + Core asset rent + 5000-lamport fee)
- Legacy tx size: **777 bytes** (limit 1232)
- Post-state: `public_minted 0 → 1`; asset PDA `[asset, 0x0002]` = `4m1E69pUDECcDjYqpVFVzRRzPLAP9Lf78uX5YDRr4jS2` exists, Core-owned
- Metadata: canonical fixture name/URI for #2, 9-element metadata proof accepted

## Leg (b) — ETH claim #4 (new in-program secp256k1_recover path)

- Claimer/signer + recipient: user mobile wallet `8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d` (funded ~1.05 SOL by user)
- ETH holder: `0xb0E683427202D14366977B7183d228a508B5a19C` signed a fresh EIP-191 message via the LAN signer page (prior frozen signature had expired 2026-08-23 23:12 UTC)
- Fresh message hash: `0x6a41d503b4d5d7d21d609147124b9712898218c01d71f17f07eb631ab61d8138`; expiry `1787618331` (2026-08-25T00:38Z); nonce unchanged `0x0c05b48c…25c6`
- Signature verified twice pre-send (ethers verifyMessage on Pi + pure-JS in-page recovery) and once on-chain (in-program `secp256k1_recover`)
- Leaf unchanged across re-signing (expiry not leaf-bound): `0xb08aff22…28e7567`, matches committed tree and on-chain `claim_root`
- Receipt PDA `[claim, leaf]` = `BfwS7hxwHzCvq1Stn6wjoddxAiswhQGdfqZ3iJGYrLv3` created (63B), only after successful Core CPI
- Asset PDA `[asset, 0x0004]` = `CfFzKB53dgUboHwobevcGkMCYy5a7AwR52XoaFYuTe6Z` created; owner pubkey bytes confirmed at offset 1 of asset data
- Claim tx size: **1162 bytes legacy** (< 1232) — the original packet-size blocker is resolved in production
- Post-state: `claims_minted 0 → 1`; claimer balance 1.000000 → 0.995300 SOL (fees only; no price on claims)

## Dapp notes (for the future production client)

- Phantom extension (Brave) will not connect over plain HTTP on a LAN IP even with Shields off and popups allowed. Serving the identical page over self-signed HTTPS (`https://192.168.0.153:8444`, SAN=IP cert, user accepts warning) fixed connection immediately.
- Inline dapp scripts must be free of Node `Buffer` and CommonJS ethers CDN builds; use `Uint8Array`/`TextEncoder` with inline keccak + secp recovery.
- The rehearsal dapp remains at `/tmp/cumz-rehearsal/{sign-claim.html,claim-dapp.html}`; HTTP :8123 and HTTPS :8444 servers local-only.

## Cost accounting

Total devnet spend for the full rehearsal: ≈ 2.01 SOL equivalent value moved/funded (1 SOL mint price to own treasury + rent/fees on two funded keys). Within the approved 2-SOL cap. All funds are devnet test assets.

## Residual items

- None blocking. Program is deployed and both flows proven; production website work is out of scope for this packet per standing redirect.
