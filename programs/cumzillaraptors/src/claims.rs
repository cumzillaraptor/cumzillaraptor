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
    const NONCE_360: [u8; 32] = [0x9d, 0xfb, 0x1c, 0xcf, 0x9d, 0xc9, 0x65, 0x16, 0x32, 0x9c, 0x3d, 0x36, 0xee, 0x91, 0x2f, 0xd1, 0xc3, 0x78, 0x52, 0x54, 0x30, 0xf6, 0x13, 0xfa, 0xee, 0x69, 0xba, 0x6f, 0x3d, 0x1c, 0x0f, 0xee];
    const ROOT: [u8; 32] = [0x6b, 0x98, 0x74, 0x4c, 0x71, 0xcb, 0xa2, 0x7e, 0xc2, 0x39, 0x1b, 0x2c, 0x4c, 0xc7, 0x9f, 0xc8, 0x35, 0xb0, 0xc3, 0x25, 0xfa, 0xca, 0x0f, 0xf4, 0x0d, 0xea, 0x63, 0x26, 0xe3, 0xb2, 0x38, 0xfb];
    const PROOF_360: [[u8; 32]; 7] = [
        [0x67, 0x6f, 0x3a, 0xbe, 0x7a, 0xf1, 0xcf, 0x01, 0xca, 0x49, 0x80, 0x4e, 0xa1, 0xf7, 0xf1, 0x64, 0x2e, 0x67, 0xdf, 0xce, 0x7a, 0x6e, 0x38, 0xbf, 0x5a, 0x76, 0x8a, 0x9f, 0x44, 0xb1, 0x0c, 0x06],
        [0xe6, 0x4f, 0x56, 0x80, 0xf7, 0x7d, 0x08, 0xee, 0x67, 0x6f, 0xb3, 0x3b, 0xb4, 0xdd, 0x16, 0x9e, 0xb6, 0xab, 0x41, 0x9d, 0x62, 0x9d, 0x0c, 0x7d, 0x56, 0x95, 0xac, 0x79, 0x7e, 0x4e, 0xa3, 0xbf],
        [0x7a, 0x8d, 0x80, 0x68, 0xc4, 0x01, 0x0f, 0x30, 0x67, 0x9e, 0xa0, 0x21, 0xc1, 0x50, 0xa3, 0x29, 0x43, 0xcf, 0x56, 0x0e, 0x5b, 0x6e, 0x02, 0xb2, 0x5b, 0x90, 0xc3, 0x3d, 0x5c, 0x57, 0x51, 0x33],
        [0x6c, 0x3b, 0xda, 0xad, 0xd1, 0xd4, 0xa5, 0xb4, 0x7d, 0x6b, 0x71, 0x62, 0x49, 0x96, 0xb5, 0x13, 0x91, 0x96, 0x45, 0x43, 0x5a, 0xf5, 0x28, 0x8b, 0xaa, 0x31, 0x84, 0xcb, 0x8c, 0x59, 0x48, 0x6a],
        [0xcd, 0xce, 0x88, 0x2a, 0xe5, 0x9d, 0xbb, 0xe4, 0xa6, 0x4a, 0xba, 0x53, 0xcb, 0xcb, 0xa5, 0x20, 0x89, 0xc2, 0x61, 0x69, 0xfc, 0x81, 0x2c, 0xa0, 0x9b, 0xbf, 0x5a, 0x0f, 0x93, 0x08, 0x79, 0xf8],
        [0x96, 0x94, 0xae, 0x33, 0x45, 0x9b, 0x77, 0x14, 0xde, 0x9f, 0x74, 0x6b, 0xc0, 0x91, 0x77, 0xc4, 0x02, 0xc9, 0xba, 0x06, 0x02, 0x53, 0x01, 0xbb, 0xbd, 0xdd, 0xdc, 0x4e, 0xc9, 0xd6, 0x65, 0x36],
        [0xd7, 0x9a, 0x17, 0xff, 0x87, 0x8d, 0x96, 0x63, 0x23, 0x7c, 0x62, 0x11, 0xea, 0xac, 0x9a, 0x40, 0x10, 0x1d, 0x67, 0xb5, 0xb1, 0xb3, 0x66, 0xfd, 0x8c, 0xac, 0x75, 0xde, 0x57, 0x30, 0xa0, 0x3f],
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
        let program = Pubkey::from_str("AYE4iC2gp81H8jvMjk4EGxwP2sJFzuDptUwxqwTZYTMY").unwrap();
        let leaf = claim_leaf_v1(&program, DEVNET_CLUSTER, &ETH_360, 360, &NONCE_360).unwrap();
        assert_eq!(
            leaf,
            [0x5e, 0x80, 0x97, 0x10, 0x23, 0x10, 0x0b, 0x55, 0xfc, 0x21, 0xf4, 0x86, 0x64, 0x5f, 0x65, 0x1a, 0x98, 0x24, 0xc3, 0x6b, 0xa3, 0x40, 0x12, 0x15, 0x60, 0xed, 0xaf, 0x35, 0xe3, 0x17, 0x40, 0x55]
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
        let program = Pubkey::from_str("AYE4iC2gp81H8jvMjk4EGxwP2sJFzuDptUwxqwTZYTMY").unwrap();
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
