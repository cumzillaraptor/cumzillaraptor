use crate::errors::CumzillaraptorsError;
use crate::state::{CollectionConfig, CLAIM_COUNT, PUBLIC_COUNT};
use anchor_lang::prelude::*;
use solana_keccak_hasher::hash;

pub const TOTAL_NFT_COUNT: u16 = 420;
pub const ALLOCATION_BITMAP_BYTES: usize = 53;

/// Immutable membership plus one-way allocation state. `public_ids` is stored in the reviewed
/// manifest order; claim membership is the exact complement of the public IDs in 1..=420.
#[account]
pub struct AllocationRegistry {
    pub manifest_hash: [u8; 32],
    pub public_ids: [u16; PUBLIC_COUNT as usize],
    pub allocated: [u8; ALLOCATION_BITMAP_BYTES],
    pub bump: u8,
}

impl AllocationRegistry {
    pub const LEN: usize = 32 + (PUBLIC_COUNT as usize * 2) + ALLOCATION_BITMAP_BYTES + 1;

    pub fn initialize(
        &mut self,
        config: &CollectionConfig,
        program_id: &Pubkey,
        public_ids: &[u16],
        claim_ids: &[u16],
        bump: u8,
    ) -> Result<()> {
        validate_partition(public_ids, claim_ids)?;
        let manifest_hash = allocation_hash_v1(program_id, config, public_ids)?;
        require!(
            manifest_hash == config.allocation_hash,
            CumzillaraptorsError::AllocationManifestMismatch
        );
        self.manifest_hash = manifest_hash;
        self.public_ids.copy_from_slice(public_ids);
        self.allocated = [0; ALLOCATION_BITMAP_BYTES];
        self.bump = bump;
        Ok(())
    }

    pub fn is_public_id(&self, id: u16) -> Result<bool> {
        id_to_index(id)?;
        Ok(self.public_ids.contains(&id))
    }

    pub fn assert_public_id(&self, id: u16) -> Result<()> {
        require!(
            self.is_public_id(id)?,
            CumzillaraptorsError::PublicClaimPartitionViolation
        );
        Ok(())
    }

    pub fn assert_claim_id(&self, id: u16) -> Result<()> {
        require!(
            !self.is_public_id(id)?,
            CumzillaraptorsError::PublicClaimPartitionViolation
        );
        Ok(())
    }

    pub fn is_allocated(&self, id: u16) -> Result<bool> {
        is_allocated(&self.allocated, id)
    }

    /// Call only after the Core CPI has returned success. A later task performs that CPI; keeping
    /// this mutation separate prevents an NFT ID from being consumed if Core asset creation fails.
    pub fn mark_allocated_after_core_success(&mut self, id: u16) -> Result<()> {
        mark_allocated(&mut self.allocated, id)
    }
}

/// Recomputes Launch Manifest V1's allocation hash from immutable config and submitted public IDs.
/// Claim IDs are validated as the exact complement; V1 commits the public list and claim root.
pub fn allocation_hash_v1(
    program_id: &Pubkey,
    config: &CollectionConfig,
    public_ids: &[u16],
) -> Result<[u8; 32]> {
    require!(
        public_ids.len() == PUBLIC_COUNT as usize,
        CumzillaraptorsError::InvalidAllocationPartition
    );
    let mut id_bytes = Vec::with_capacity(public_ids.len() * 2);
    for id in public_ids {
        id_to_index(*id)?;
        id_bytes.extend_from_slice(&id.to_be_bytes());
    }
    let prefix = b"CUMZILLARAPTORS_ALLOCATION_V1";
    // Compile-time cluster tag (see claims.rs); default devnet, `--features mainnet` for mainnet.
    #[cfg(feature = "mainnet")]
    let cluster = b"mainnet";
    #[cfg(not(feature = "mainnet"))]
    let cluster = b"devnet";
    let mut payload = Vec::with_capacity(
        prefix.len() + 32 + 1 + cluster.len() + 32 + 2 + id_bytes.len() + 32 + 32,
    );
    payload.extend_from_slice(prefix);
    payload.extend_from_slice(program_id.as_ref());
    payload.push(cluster.len() as u8);
    payload.extend_from_slice(cluster);
    payload.extend_from_slice(config.collection.as_ref());
    payload.extend_from_slice(&PUBLIC_COUNT.to_be_bytes());
    payload.extend_from_slice(&id_bytes);
    payload.extend_from_slice(&config.claim_root);
    payload.extend_from_slice(&config.metadata_root);
    Ok(hash(&payload).to_bytes())
}

pub fn id_to_index(id: u16) -> Result<usize> {
    require!(
        (1..=TOTAL_NFT_COUNT).contains(&id),
        CumzillaraptorsError::InvalidAllocationId
    );
    Ok((id - 1) as usize)
}

pub fn is_allocated(bitmap: &[u8; ALLOCATION_BITMAP_BYTES], id: u16) -> Result<bool> {
    let index = id_to_index(id)?;
    Ok(bitmap[index / 8] & (1 << (index % 8)) != 0)
}

pub fn mark_allocated(bitmap: &mut [u8; ALLOCATION_BITMAP_BYTES], id: u16) -> Result<()> {
    let index = id_to_index(id)?;
    let byte = &mut bitmap[index / 8];
    let mask = 1 << (index % 8);
    require!(
        *byte & mask == 0,
        CumzillaraptorsError::AllocationIdAlreadyUsed
    );
    *byte |= mask;
    Ok(())
}

pub fn validate_partition(public_ids: &[u16], claim_ids: &[u16]) -> Result<()> {
    require!(
        public_ids.len() == PUBLIC_COUNT as usize,
        CumzillaraptorsError::InvalidAllocationPartition
    );
    require!(
        claim_ids.len() == CLAIM_COUNT as usize,
        CumzillaraptorsError::InvalidAllocationPartition
    );
    let mut seen = [false; TOTAL_NFT_COUNT as usize];
    for id in public_ids.iter().chain(claim_ids.iter()) {
        let index = id_to_index(*id)?;
        require!(!seen[index], CumzillaraptorsError::DuplicateAllocationId);
        seen[index] = true;
    }
    require!(
        seen.iter().all(|present| *present),
        CumzillaraptorsError::InvalidAllocationPartition
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    fn partition() -> (Vec<u16>, Vec<u16>) {
        (
            (1..=PUBLIC_COUNT).collect(),
            ((PUBLIC_COUNT + 1)..=TOTAL_NFT_COUNT).collect(),
        )
    }

    fn config() -> CollectionConfig {
        CollectionConfig {
            launch_authority: Pubkey::new_unique(),
            treasury: Pubkey::new_unique(),
            core_program: mpl_core::ID,
            collection: Pubkey::new_unique(),
            allocation_hash: [0; 32],
            claim_root: [2; 32],
            metadata_root: [3; 32],
            cluster_tag_hash: [4; 32],
            sale_state: crate::state::SaleState::Setup,
            public_minted: 0,
            claims_minted: 0,
            bump: 1,
        }
    }

    #[test]
    fn partition_requires_exact_disjoint_complete_sets() {
        let (public, claims) = partition();
        assert!(validate_partition(&public, &claims).is_ok());
        let mut duplicate = claims.clone();
        duplicate[0] = public[0];
        assert!(validate_partition(&public, &duplicate).is_err());
        let mut zero = public.clone();
        zero[0] = 0;
        assert!(validate_partition(&zero, &claims).is_err());
        let mut out_of_range = public.clone();
        out_of_range[0] = 421;
        assert!(validate_partition(&out_of_range, &claims).is_err());
        assert!(validate_partition(&public[..245], &claims).is_err());
        assert!(validate_partition(&public, &claims[..173]).is_err());
    }

    #[cfg(not(feature = "mainnet"))]
#[test]
    fn allocation_hash_matches_independent_js_v1_known_answer() {
        let (public, _) = partition();
        let mut config = config();
        config.collection =
            Pubkey::from_str("8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d").unwrap();
        let program_id = Pubkey::from_str("AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY").unwrap();
        assert_eq!(
            allocation_hash_v1(&program_id, &config, &public).unwrap(),
            [
                162, 167, 91, 97, 214, 203, 39, 231, 189, 107, 184, 55, 0, 250, 150, 6, 25, 194,
                203, 170, 178, 119, 173, 62, 248, 58, 235, 80, 219, 40, 175, 201,
            ]
        );
    }

    /// Cross-cluster guard: a devnet-tagged manifest must NEVER validate on a mainnet build
    /// (and vice versa). The cluster tag is the only differing byte in the preimage.
    #[test]
    fn allocation_hash_is_cluster_bound() {
        // The known answer above was produced with the devnet tag. On a mainnet-feature
        // build the same inputs MUST hash differently; on the default (devnet) build they
        // must match it exactly.
        let (public, _) = partition();
        let mut config = config();
        config.collection =
            Pubkey::from_str("8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d").unwrap();
        let program_id = Pubkey::from_str("AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY").unwrap();
        let devnet_known_answer: [u8; 32] = [
            162, 167, 91, 97, 214, 203, 39, 231, 189, 107, 184, 55, 0, 250, 150, 6, 25, 194, 203,
            170, 178, 119, 173, 62, 248, 58, 235, 80, 219, 40, 175, 201,
        ];
        let computed = allocation_hash_v1(&program_id, &config, &public).unwrap();
        if cfg!(feature = "mainnet") {
            assert_ne!(
                computed, devnet_known_answer,
                "mainnet build must not reproduce the devnet-tagged manifest hash"
            );
            assert_eq!(
                crate::claims::DEVNET_CLUSTER,
                b"mainnet",
                "mainnet feature must retarget the cluster tag"
            );
        } else {
            assert_eq!(
                computed, devnet_known_answer,
                "default build must stay bit-identical to the deployed devnet program"
            );
            assert_eq!(
                crate::claims::DEVNET_CLUSTER,
                b"devnet",
                "default build must keep the devnet cluster tag"
            );
        }
    }

    #[test]
    fn bitmap_boundaries_are_exact_and_manifest_mismatch_rejects() {
        let mut bitmap = [0; ALLOCATION_BITMAP_BYTES];
        for id in [1, 8, 9, 420] {
            assert!(!is_allocated(&bitmap, id).unwrap());
            mark_allocated(&mut bitmap, id).unwrap();
            assert!(is_allocated(&bitmap, id).unwrap());
        }
        assert_eq!(bitmap[0], 0b1000_0001);
        assert_eq!(bitmap[1], 0b0000_0001);
        assert_eq!(bitmap[52], 0b0000_1000);
        assert!(mark_allocated(&mut bitmap, 420).is_err());

        let (public, claims) = partition();
        let config = config();
        let program_id = Pubkey::new_unique();
        let mut registry = AllocationRegistry {
            manifest_hash: [0; 32],
            public_ids: [0; PUBLIC_COUNT as usize],
            allocated: [0; ALLOCATION_BITMAP_BYTES],
            bump: 0,
        };
        assert!(registry
            .initialize(&config, &program_id, &public, &claims, 1)
            .is_err());
    }

    #[test]
    fn registry_enforces_partition_and_one_way_allocation() {
        let (public, claims) = partition();
        let mut config = config();
        let program_id = Pubkey::new_unique();
        config.allocation_hash = allocation_hash_v1(&program_id, &config, &public).unwrap();
        let mut registry = AllocationRegistry {
            manifest_hash: [0; 32],
            public_ids: [0; PUBLIC_COUNT as usize],
            allocated: [0; ALLOCATION_BITMAP_BYTES],
            bump: 0,
        };
        registry
            .initialize(&config, &program_id, &public, &claims, 1)
            .unwrap();
        assert!(registry.assert_public_id(1).is_ok());
        assert!(registry.assert_claim_id(1).is_err());
        assert!(registry.assert_claim_id(420).is_ok());
        assert!(registry.assert_public_id(420).is_err());
        registry.mark_allocated_after_core_success(1).unwrap();
        assert!(registry.is_allocated(1).unwrap());
        assert!(registry.mark_allocated_after_core_success(1).is_err());
        let mut substituted_public = public.clone();
        substituted_public.swap(0, 1);
        let mut substituted_registry = AllocationRegistry {
            manifest_hash: [0; 32],
            public_ids: [0; PUBLIC_COUNT as usize],
            allocated: [0; ALLOCATION_BITMAP_BYTES],
            bump: 0,
        };
        assert!(substituted_registry
            .initialize(&config, &program_id, &substituted_public, &claims, 1)
            .is_err());
    }
}
