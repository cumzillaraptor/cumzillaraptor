# Cumzillaraptors Launch Manifest V1

This document defines the canonical immutable allocation manifest for the Cumzillaraptors devnet rebuild.

## Purpose

The manifest commits one collection to:

- exactly **246** public-sale IDs;
- exactly **174** ETH-holder claim IDs;
- an approved claim Merkle root;
- an approved metadata-URI map;
- a specific Solana program, cluster, and Metaplex Core collection.

The program must store the resulting `allocationHash` at initialization and reject any initialization data that does not match the reviewed manifest.

## Source of truth

- Public IDs: `/home/raspberrypi/nft-collection/cumzillaraptors_solana/mint_list.csv`
- Claim IDs: `/home/raspberrypi/nft-collection/cumzillaraptors_solana/reserve_list.csv`
- Current eligibility root: `nft-data/merkle-config.json`
- Metadata URIs: a reviewed `uri-map` JSON generated after completed Arweave/Irys upload.

## URI map schema

```json
{
  "collectionUri": "ar://<43-character-transaction-id>",
  "metadataUris": {
    "1": "ar://<43-character-transaction-id>",
    "2": "ar://<43-character-transaction-id>"
  }
}
```

All 420 numeric IDs must be present. Every URI must use the exact `ar://` scheme and a 43-character Arweave transaction ID. Strings containing `PLACEHOLDER` are rejected.

## Metadata URI hash

`metadataUriHash = keccak256(payload)` where `payload` is:

```text
"CUMZILLARAPTORS_URI_MAP_V1" (UTF-8 bytes) ||
collection_uri_length (u16 big-endian) || collection_uri (UTF-8 bytes) ||
for nft_id = 1 through 420, in numeric order:
  nft_id (u16 big-endian) || metadata_uri_length (u16 big-endian) || metadata_uri (UTF-8 bytes)
```

## Allocation hash

`allocationHash = keccak256(payload)` where `payload` is:

```text
"CUMZILLARAPTORS_ALLOCATION_V1" (UTF-8 bytes) ||
program_id (32 raw Solana public-key bytes) ||
cluster_tag_length (u8) || cluster_tag (UTF-8 bytes) ||
collection (32 raw Solana public-key bytes) ||
public_count (u16 big-endian) ||
public_ids (246 × u16 big-endian, in canonical CSV order) ||
claim_root (32 raw bytes) ||
metadataUriHash (32 raw bytes)
```

The cluster tag is currently the literal UTF-8 string `devnet`.

## Required invariants

1. Public count is exactly 246.
2. Claim count is exactly 174.
3. Each ID is an integer in `1..=420`.
4. No ID appears twice in either list.
5. Public and claim lists are disjoint.
6. Combined lists contain every integer in `1..=420` exactly once.
7. Claim root is a 32-byte `0x`-prefixed lowercase hex value.
8. The manifest generator is deterministic: same inputs produce byte-identical JSON and identical hashes.

## Generation command

```bash
node scripts/generate-launch-manifest.js \
  --cluster devnet \
  --program-id <provisional-program-id> \
  --collection <verified-core-collection-address> \
  --uri-map nft-data/uri-map.devnet.json \
  --output nft-data/launch-manifest.devnet.json
```

The collection and URI map do not exist yet, so no release manifest is generated or committed in Task 2. The test suite uses synthetic valid `ar://` values only to validate deterministic encoding. A real manifest is generated only after the metadata upload and collection setup have completed and been reviewed.

### Reproducible source overrides

The generator defaults to the verified local source-data path. For CI, isolated tests, or a reviewed copy of the data, these environment variables may override only the corresponding input path:

- `CUMZ_SOURCE_DIR`
- `CUMZ_MINT_CSV`
- `CUMZ_RESERVE_CSV`
- `CUMZ_CLAIM_CONFIG`
- `CUMZ_CLAIM_PROOFS`

The generator verifies each proof record against the canonical reserve CSV: the JSON key, record NFT ID, and normalized ETH wallet must match the reserve row exactly. It then recomputes the sorted-pair Keccak root from those proof records and refuses to emit a manifest unless it exactly equals `merkle-config.json`'s committed root.

## Security properties and limits

- This manifest prevents an initializer from quietly substituting a different public pool, claim root, metadata URI set, program, collection, or cluster.
- It does not authenticate an ETH holder. Claim authorization is addressed separately by the domain-separated signature scheme in Task 3 and on-chain secp256k1 verification in Task 9.
- It does not itself prove the Core collection or assets exist. Those are validated during controlled setup and launch finalization.

## Change policy

Manifest V1 values are immutable once accepted by the program. This repository currently approves the pre-launch 246-public/174-claim split, including #360 reserved to `0xfadf08b0ecc8f128b22d8fb738024db10d34df91`. Changing a root, URI, collection, public allocation, program ID, or cluster after initialization requires a new manifest version and a new reviewed launch process.
