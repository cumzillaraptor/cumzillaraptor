use anchor_lang::prelude::*;
use solana_keccak_hasher::hashv;

use crate::{
    allocation::AllocationRegistry,
    errors::CumzillaraptorsError,
    secp256k1::{ETH_ADDRESS_LEN, MAX_NFT_ID, NONCE_LEN},
    state::CollectionConfig,
};

pub const CLAIM_DOMAIN: &[u8] = b"CUMZILLARAPTORS_CLAIM_V1";
pub const DEVNET_CLUSTER: &[u8] = b"devnet";
// The immutable V1 root covers 174 leaves. `merkletreejs` sorted-pair proofs for this exact
// odd-leaf tree contain at most 8 siblings; reject longer inputs before hashing.
pub const MAX_CLAIM_PROOF_LEN: usize = 8;

pub fn claim_leaf_v1(
    program_id: &Pubkey,
    cluster: &[u8],
    eth_address: &[u8; ETH_ADDRESS_LEN],
    nft_id: u16,
    nonce: &[u8; NONCE_LEN],
) -> Result<[u8; 32]> {
    require!(
        cluster == DEVNET_CLUSTER,
        CumzillaraptorsError::InvalidClaimMessage
    );
    require!(
        (1..=MAX_NFT_ID).contains(&nft_id),
        CumzillaraptorsError::InvalidNftId
    );
    Ok(hashv(&[
        CLAIM_DOMAIN,
        program_id.as_ref(),
        cluster,
        eth_address,
        &nft_id.to_be_bytes(),
        nonce,
    ])
    .to_bytes())
}

pub fn verify_sorted_keccak_proof(
    leaf: [u8; 32],
    proof: &[[u8; 32]],
    root: &[u8; 32],
) -> Result<()> {
    require!(
        proof.len() <= MAX_CLAIM_PROOF_LEN,
        CumzillaraptorsError::ProofTooLong
    );
    let computed = proof.iter().fold(leaf, |current, sibling| {
        if current <= *sibling {
            hashv(&[&current, sibling]).to_bytes()
        } else {
            hashv(&[sibling, &current]).to_bytes()
        }
    });
    require!(computed == *root, CumzillaraptorsError::InvalidMerkleProof);
    Ok(())
}

/// Verifies V1 ETH eligibility against the immutable config root and rejects public-pool IDs.
/// Allocation/replay mutation remains deliberately outside this helper and must occur only after
/// the eventual Core asset CPI succeeds.
pub fn verify_claim_eligibility(
    config: &CollectionConfig,
    registry: &AllocationRegistry,
    program_id: &Pubkey,
    eth_address: &[u8; ETH_ADDRESS_LEN],
    nft_id: u16,
    nonce: &[u8; NONCE_LEN],
    proof: &[[u8; 32]],
) -> Result<[u8; 32]> {
    registry.assert_claim_id(nft_id)?;
    let leaf = claim_leaf_v1(program_id, DEVNET_CLUSTER, eth_address, nft_id, nonce)?;
    verify_sorted_keccak_proof(leaf, proof, &config.claim_root)?;
    Ok(leaf)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{allocation::ALLOCATION_BITMAP_BYTES, state::SaleState, PUBLIC_COUNT};
    use std::str::FromStr;

    const ETH_360: [u8; 20] = [
        0xfa, 0xdf, 0x08, 0xb0, 0xec, 0xc8, 0xf1, 0x28, 0xb2, 0x2d, 0x8f, 0xb7, 0x38, 0x02, 0x4d,
        0xb1, 0x0d, 0x34, 0xdf, 0x91,
    ];
    const NONCE_360: [u8; 32] = [
        0xa4, 0x9b, 0xcd, 0x89, 0xe4, 0x12, 0x46, 0x98, 0x10, 0x1d, 0x61, 0xf5, 0xb2, 0x7a, 0x21,
        0xf9, 0xf4, 0x86, 0x4a, 0xd2, 0xf0, 0x2d, 0x85, 0x69, 0xe5, 0x68, 0x0e, 0xc4, 0xda, 0x68,
        0x85, 0x2e,
    ];
    const ROOT: [u8; 32] = [
        0x79, 0x1d, 0x01, 0x2f, 0xcb, 0x22, 0x1a, 0x20, 0x9f, 0x77, 0x6d, 0xf0, 0x44, 0x65, 0x7f,
        0x81, 0xd6, 0x9b, 0x16, 0x86, 0x85, 0x34, 0x36, 0x72, 0x42, 0x57, 0x76, 0x04, 0xfc, 0x61,
        0xb0, 0x86,
    ];
    const PROOF_360: [[u8; 32]; 7] = [
        [
            0x62, 0xbf, 0xc5, 0xa9, 0x26, 0xd7, 0x38, 0xd3, 0x9c, 0xae, 0x90, 0x63, 0x71, 0x99,
            0x31, 0x83, 0x9a, 0xb0, 0x5c, 0x79, 0xdd, 0x0b, 0xde, 0xf1, 0x5b, 0x99, 0x49, 0xd4,
            0xb8, 0x8f, 0xe5, 0x30,
        ],
        [
            0xfd, 0x34, 0x35, 0xe6, 0x19, 0x6e, 0xfc, 0xa7, 0x3a, 0x26, 0xa6, 0x18, 0x1f, 0x02,
            0xaa, 0xb5, 0x13, 0xca, 0xc6, 0x60, 0x21, 0x4b, 0x9c, 0x01, 0x69, 0x0a, 0xcf, 0x80,
            0xed, 0xfb, 0xc7, 0x5f,
        ],
        [
            0x8a, 0x11, 0xbe, 0xf2, 0xb7, 0x32, 0xb7, 0xdd, 0xd9, 0xfb, 0x82, 0x35, 0xf1, 0xb0,
            0xb7, 0x3f, 0x76, 0x5c, 0x2c, 0x03, 0xdc, 0x30, 0x3b, 0x1a, 0x91, 0xe5, 0xae, 0x18,
            0x57, 0x93, 0x4e, 0x66,
        ],
        [
            0x22, 0xa3, 0x6b, 0x92, 0xa3, 0xbc, 0x3b, 0x72, 0x90, 0xeb, 0xf6, 0x4c, 0x21, 0xa5,
            0xfd, 0xb7, 0x9d, 0xa5, 0x72, 0xce, 0xf4, 0x43, 0x53, 0x09, 0x03, 0xc4, 0xd2, 0x66,
            0x39, 0x8c, 0x13, 0xc4,
        ],
        [
            0xd8, 0xda, 0xb0, 0xa2, 0x6f, 0xf7, 0x64, 0xb7, 0x33, 0xbe, 0x4f, 0x6e, 0x32, 0xd8,
            0x3e, 0xa1, 0xf6, 0x39, 0x28, 0x6b, 0xc1, 0x58, 0x5d, 0x98, 0x26, 0xc8, 0x2d, 0x30,
            0xe9, 0xb7, 0x81, 0x88,
        ],
        [
            0xb7, 0x44, 0xea, 0x47, 0x8f, 0x7e, 0x1c, 0x85, 0x7b, 0xad, 0xad, 0x7d, 0x07, 0x09,
            0xb1, 0x76, 0x3b, 0x38, 0x74, 0x98, 0x57, 0xc4, 0x8a, 0x53, 0xdf, 0x84, 0xa2, 0xcb,
            0xe1, 0x4f, 0x77, 0x1b,
        ],
        [
            0x9d, 0xf1, 0xc4, 0x39, 0x70, 0xa3, 0xee, 0x3d, 0x8f, 0xd5, 0x41, 0x5f, 0x20, 0x24,
            0x8f, 0x84, 0x80, 0xd7, 0x79, 0x0a, 0x51, 0xd2, 0x92, 0xe6, 0x2a, 0x0f, 0x05, 0x86,
            0x20, 0x2f, 0x22, 0x80,
        ],
    ];

    fn config() -> CollectionConfig {
        CollectionConfig {
            launch_authority: Pubkey::new_unique(),
            treasury: Pubkey::new_unique(),
            core_program: mpl_core::ID,
            collection: Pubkey::new_unique(),
            allocation_hash: [0; 32],
            claim_root: ROOT,
            metadata_root: [0; 32],
            cluster_tag_hash: [0; 32],
            sale_state: SaleState::Setup,
            public_minted: 0,
            claims_minted: 0,
            bump: 1,
        }
    }

    fn registry_with_360_claimable() -> AllocationRegistry {
        let mut public_ids = [0; PUBLIC_COUNT as usize];
        for (index, id) in (1..PUBLIC_COUNT).enumerate() {
            public_ids[index] = id;
        }
        // A 246-item public pool retaining #1 while excluding #360; #247 is the final public ID.
        public_ids[(PUBLIC_COUNT - 1) as usize] = 247;
        AllocationRegistry {
            manifest_hash: [0; 32],
            public_ids,
            allocated: [0; ALLOCATION_BITMAP_BYTES],
            bump: 1,
        }
    }

    #[test]
    fn approved_360_claim_proof_and_leaf_match_v1_artifact() {
        let program = Pubkey::from_str("2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2").unwrap();
        let leaf = claim_leaf_v1(&program, DEVNET_CLUSTER, &ETH_360, 360, &NONCE_360).unwrap();
        assert_eq!(
            leaf,
            [
                0x00, 0x32, 0x12, 0x87, 0xdf, 0xfa, 0x89, 0x45, 0xbc, 0x2c, 0xcf, 0x95, 0x66, 0xf8,
                0xe8, 0x80, 0xf5, 0x7a, 0x09, 0x40, 0xdb, 0x03, 0x93, 0x41, 0x4b, 0xb7, 0x13, 0xcb,
                0xd0, 0xed, 0x5b, 0x86
            ]
        );
        assert!(verify_claim_eligibility(
            &config(),
            &registry_with_360_claimable(),
            &program,
            &ETH_360,
            360,
            &NONCE_360,
            &PROOF_360
        )
        .is_ok());
    }

    #[test]
    fn eligibility_rejects_public_id_mutated_claim_data_and_excessive_proof() {
        let program = Pubkey::from_str("2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2").unwrap();
        let registry = registry_with_360_claimable();
        assert!(verify_claim_eligibility(
            &config(),
            &registry,
            &program,
            &ETH_360,
            1,
            &NONCE_360,
            &PROOF_360
        )
        .is_err());
        let mut wrong_eth = ETH_360;
        wrong_eth[0] ^= 1;
        assert!(verify_claim_eligibility(
            &config(),
            &registry,
            &program,
            &wrong_eth,
            360,
            &NONCE_360,
            &PROOF_360
        )
        .is_err());
        let mut wrong_nonce = NONCE_360;
        wrong_nonce[0] ^= 1;
        assert!(verify_claim_eligibility(
            &config(),
            &registry,
            &program,
            &ETH_360,
            360,
            &wrong_nonce,
            &PROOF_360
        )
        .is_err());
        let mut bad_proof = PROOF_360;
        bad_proof[0][0] ^= 1;
        assert!(verify_claim_eligibility(
            &config(),
            &registry,
            &program,
            &ETH_360,
            360,
            &NONCE_360,
            &bad_proof
        )
        .is_err());
        let oversized = vec![[0u8; 32]; MAX_CLAIM_PROOF_LEN + 1];
        assert!(verify_sorted_keccak_proof([0; 32], &oversized, &ROOT).is_err());
    }
}
