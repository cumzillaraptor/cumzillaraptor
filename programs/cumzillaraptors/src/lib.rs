use anchor_lang::prelude::*;

pub mod allocation;
pub mod core;
pub mod errors;
pub mod state;

use allocation::AllocationRegistry;
use errors::CumzillaraptorsError;
use state::{launch_authority, CollectionConfig, SaleState, CLAIM_COUNT, PUBLIC_COUNT};

declare_id!("2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2");

#[program]
pub mod cumzillaraptors {
    use super::*;

    /// One-time immutable devnet launch setup. Sale/mint/claim behavior is deferred.
    pub fn initialize_launch(
        ctx: Context<InitializeLaunch>,
        treasury: Pubkey,
        core_program: Pubkey,
        collection: Pubkey,
        allocation_hash: [u8; 32],
        claim_root: [u8; 32],
        metadata_hash: [u8; 32],
        cluster_tag_hash: [u8; 32],
        public_count: u16,
        claim_count: u16,
    ) -> Result<()> {
        validate_launch_parameters(
            ctx.accounts.launch_authority.key(),
            treasury,
            core_program,
            collection,
            allocation_hash,
            claim_root,
            metadata_hash,
            cluster_tag_hash,
            public_count,
            claim_count,
        )?;
        write_launch_config(
            &mut ctx.accounts.config,
            ctx.accounts.launch_authority.key(),
            treasury,
            core_program,
            collection,
            allocation_hash,
            claim_root,
            metadata_hash,
            cluster_tag_hash,
            ctx.bumps.config,
        );
        Ok(())
    }

    /// Persists the reviewed public/claim partition exactly once, bound to the allocation hash
    /// committed during `initialize_launch`. No allocation occurs in this Task 6 instruction.
    pub fn initialize_allocation_registry(
        ctx: Context<InitializeAllocationRegistry>,
        public_ids: Vec<u16>,
        claim_ids: Vec<u16>,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.launch_authority.key(),
            ctx.accounts.config.launch_authority,
            CumzillaraptorsError::UnauthorizedLaunchAuthority
        );
        ctx.accounts.registry.initialize(
            &ctx.accounts.config,
            ctx.program_id,
            &public_ids,
            &claim_ids,
            ctx.bumps.registry,
        )?;
        Ok(())
    }

    /// Creates the canonical Metaplex Core collection with the config PDA as update authority and
    /// the verified 500bp royalty plugin paying the primary treasury. The collection address is
    /// immutable: it must equal `config.collection` committed at `initialize_launch`, and the
    /// update authority is bound on-chain (no caller argument can redirect it).
    pub fn setup_collection(ctx: Context<SetupCollection>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.collection.key(),
            ctx.accounts.config.collection,
            CumzillaraptorsError::InvalidCollection
        );
        require_keys_eq!(
            ctx.accounts.mpl_core_program.key(),
            mpl_core::ID,
            CumzillaraptorsError::InvalidCoreProgram
        );

        let (name, uri, plugins) = core::collection_params();
        let mpl_core_program = ctx.accounts.mpl_core_program.to_account_info();
        let collection = ctx.accounts.collection.to_account_info();
        let config = ctx.accounts.config.to_account_info();
        let launch_authority = ctx.accounts.launch_authority.to_account_info();
        let system_program = ctx.accounts.system_program.to_account_info();
        let mut builder =
            mpl_core::instructions::CreateCollectionV1CpiBuilder::new(&mpl_core_program);
        builder
            .collection(&collection)
            .update_authority(Some(&config))
            .payer(&launch_authority)
            .system_program(&system_program)
            .name(name)
            .uri(uri)
            .plugins(vec![plugins]);
        builder.invoke()?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeAllocationRegistry<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = launch_authority)]
    pub config: Account<'info, CollectionConfig>,
    #[account(
        init,
        payer = launch_authority,
        space = 8 + AllocationRegistry::LEN,
        seeds = [b"allocation"],
        bump
    )]
    pub registry: Account<'info, AllocationRegistry>,
    #[account(mut)]
    pub launch_authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetupCollection<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = launch_authority)]
    pub config: Account<'info, CollectionConfig>,
    /// The new collection account. Must be a fresh keypair signer and must equal the
    /// address committed at `initialize_launch` (checked in the handler).
    #[account(mut)]
    pub collection: Signer<'info>,
    #[account(mut)]
    pub launch_authority: Signer<'info>,
    /// CHECK: validated against `mpl_core::ID` in the handler; not an Anchor program.
    #[account(constraint = mpl_core_program.key() == mpl_core::ID @ CumzillaraptorsError::InvalidCoreProgram)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
fn validate_launch_parameters(
    authority: Pubkey,
    treasury: Pubkey,
    core_program: Pubkey,
    collection: Pubkey,
    allocation_hash: [u8; 32],
    claim_root: [u8; 32],
    metadata_hash: [u8; 32],
    cluster_tag_hash: [u8; 32],
    public_count: u16,
    claim_count: u16,
) -> Result<()> {
    require_keys_eq!(
        authority,
        launch_authority(),
        CumzillaraptorsError::UnauthorizedLaunchAuthority
    );
    require_keys_neq!(
        treasury,
        Pubkey::default(),
        CumzillaraptorsError::InvalidTreasury
    );
    require_keys_eq!(
        core_program,
        mpl_core::ID,
        CumzillaraptorsError::InvalidLaunchCoreProgram
    );
    require_keys_neq!(
        collection,
        Pubkey::default(),
        CumzillaraptorsError::InvalidLaunchCollection
    );
    require!(
        public_count == PUBLIC_COUNT,
        CumzillaraptorsError::InvalidPublicCount
    );
    require!(
        claim_count == CLAIM_COUNT,
        CumzillaraptorsError::InvalidClaimCount
    );
    require!(
        allocation_hash != [0; 32],
        CumzillaraptorsError::InvalidAllocationHash
    );
    require!(
        claim_root != [0; 32],
        CumzillaraptorsError::InvalidClaimRoot
    );
    require!(
        metadata_hash != [0; 32],
        CumzillaraptorsError::InvalidMetadataHash
    );
    require!(
        cluster_tag_hash != [0; 32],
        CumzillaraptorsError::InvalidClusterTagHash
    );
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn write_launch_config(
    config: &mut CollectionConfig,
    authority: Pubkey,
    treasury: Pubkey,
    core_program: Pubkey,
    collection: Pubkey,
    allocation_hash: [u8; 32],
    claim_root: [u8; 32],
    metadata_hash: [u8; 32],
    cluster_tag_hash: [u8; 32],
    bump: u8,
) {
    config.launch_authority = authority;
    config.treasury = treasury;
    config.core_program = core_program;
    config.collection = collection;
    config.allocation_hash = allocation_hash;
    config.claim_root = claim_root;
    config.metadata_hash = metadata_hash;
    config.cluster_tag_hash = cluster_tag_hash;
    config.sale_state = SaleState::Setup;
    config.public_minted = 0;
    config.claims_minted = 0;
    config.bump = bump;
}

#[derive(Accounts)]
pub struct InitializeLaunch<'info> {
    #[account(init, payer = launch_authority, space = 8 + CollectionConfig::LEN, seeds = [b"config"], bump)]
    pub config: Account<'info, CollectionConfig>,
    #[account(mut)]
    pub launch_authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configured_authority_is_not_default() {
        assert_ne!(launch_authority(), Pubkey::default());
    }

    #[test]
    fn launch_validation_rejects_wrong_authority_and_invalid_critical_values() {
        let valid = [7; 32];
        let collection = Pubkey::new_unique();
        assert!(validate_launch_parameters(
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            mpl_core::ID,
            collection,
            valid,
            valid,
            valid,
            valid,
            PUBLIC_COUNT,
            CLAIM_COUNT
        )
        .is_err());
        assert!(validate_launch_parameters(
            launch_authority(),
            Pubkey::default(),
            mpl_core::ID,
            collection,
            valid,
            valid,
            valid,
            valid,
            PUBLIC_COUNT,
            CLAIM_COUNT
        )
        .is_err());
        assert!(validate_launch_parameters(
            launch_authority(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            collection,
            valid,
            valid,
            valid,
            valid,
            PUBLIC_COUNT,
            CLAIM_COUNT
        )
        .is_err());
        assert!(validate_launch_parameters(
            launch_authority(),
            Pubkey::new_unique(),
            mpl_core::ID,
            Pubkey::default(),
            valid,
            valid,
            valid,
            valid,
            PUBLIC_COUNT,
            CLAIM_COUNT
        )
        .is_err());
        assert!(validate_launch_parameters(
            launch_authority(),
            Pubkey::new_unique(),
            mpl_core::ID,
            collection,
            valid,
            valid,
            valid,
            valid,
            245,
            CLAIM_COUNT
        )
        .is_err());
        assert!(validate_launch_parameters(
            launch_authority(),
            Pubkey::new_unique(),
            mpl_core::ID,
            collection,
            valid,
            valid,
            valid,
            valid,
            PUBLIC_COUNT,
            173
        )
        .is_err());
        for hashes in [
            ([0; 32], valid, valid, valid),
            (valid, [0; 32], valid, valid),
            (valid, valid, [0; 32], valid),
            (valid, valid, valid, [0; 32]),
        ] {
            assert!(validate_launch_parameters(
                launch_authority(),
                Pubkey::new_unique(),
                mpl_core::ID,
                collection,
                hashes.0,
                hashes.1,
                hashes.2,
                hashes.3,
                PUBLIC_COUNT,
                CLAIM_COUNT,
            )
            .is_err());
        }
    }

    #[test]
    fn write_launch_config_commits_every_immutable_field_and_setup_defaults() {
        let authority = launch_authority();
        let treasury = Pubkey::new_unique();
        let collection = Pubkey::new_unique();
        let allocation_hash = [1; 32];
        let claim_root = [2; 32];
        let metadata_hash = [3; 32];
        let cluster_tag_hash = [4; 32];
        let mut config = CollectionConfig {
            launch_authority: Pubkey::default(),
            treasury: Pubkey::default(),
            core_program: Pubkey::default(),
            collection: Pubkey::default(),
            allocation_hash: [0; 32],
            claim_root: [0; 32],
            metadata_hash: [0; 32],
            cluster_tag_hash: [0; 32],
            sale_state: SaleState::Live,
            public_minted: 99,
            claims_minted: 88,
            bump: 0,
        };
        write_launch_config(
            &mut config,
            authority,
            treasury,
            mpl_core::ID,
            collection,
            allocation_hash,
            claim_root,
            metadata_hash,
            cluster_tag_hash,
            254,
        );
        assert_eq!(config.launch_authority, authority);
        assert_eq!(config.treasury, treasury);
        assert_eq!(config.core_program, mpl_core::ID);
        assert_eq!(config.collection, collection);
        assert_eq!(config.allocation_hash, allocation_hash);
        assert_eq!(config.claim_root, claim_root);
        assert_eq!(config.metadata_hash, metadata_hash);
        assert_eq!(config.cluster_tag_hash, cluster_tag_hash);
        assert_eq!(config.sale_state, SaleState::Setup);
        assert_eq!(config.public_minted, 0);
        assert_eq!(config.claims_minted, 0);
        assert_eq!(config.bump, 254);
    }
}
