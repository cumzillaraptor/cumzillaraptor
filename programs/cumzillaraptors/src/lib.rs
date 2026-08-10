use anchor_lang::prelude::*;

pub mod allocation;
pub mod claims;
pub mod core;
pub mod errors;
pub mod metadata;
pub mod secp256k1;
pub mod state;

use allocation::AllocationRegistry;
use errors::CumzillaraptorsError;
use metadata::APPROVED_METADATA_ROOT;
use state::{
    launch_authority, ClaimReceipt, CollectionConfig, SaleState, CLAIM_COUNT, PUBLIC_COUNT,
};

declare_id!("AYE4iC2gp81H8jvMjk4EGxwP2sJFzuDptUwxqwTZYTMY");

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
        metadata_root: [u8; 32],
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
            metadata_root,
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
            metadata_root,
            cluster_tag_hash,
            ctx.bumps.config,
        );
        Ok(())
    }

    /// The launch authority may enable claims once setup is complete, or pause/resume them as the
    /// explicit kill switch. Configuration roots and collection identity remain immutable.
    pub fn set_claims_sale_state(
        ctx: Context<SetClaimsSaleState>,
        next_state: SaleState,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.launch_authority.key(),
            ctx.accounts.config.launch_authority,
            CumzillaraptorsError::UnauthorizedLaunchAuthority
        );
        validate_claims_sale_state_transition(ctx.accounts.config.sale_state, next_state)?;
        ctx.accounts.config.sale_state = next_state;
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

    #[allow(clippy::too_many_arguments)]
    pub fn claim_nft(
        ctx: Context<ClaimNft>,
        nft_id: u16,
        eth_address: [u8; 20],
        nonce: [u8; 32],
        expiry_unix: u64,
        claim_proof: Vec<[u8; 32]>,
        name: String,
        uri: String,
        metadata_proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        require!(
            ctx.accounts.config.sale_state == SaleState::Live,
            CumzillaraptorsError::ClaimsNotLive
        );
        let now = Clock::get()?.unix_timestamp;
        require!(
            now >= 0 && (now as u64) <= expiry_unix,
            CumzillaraptorsError::ClaimAuthorizationExpired
        );
        require!(
            ctx.accounts.config.claims_minted < CLAIM_COUNT,
            CumzillaraptorsError::ClaimCountExceeded
        );
        require_keys_eq!(
            ctx.accounts.collection.key(),
            ctx.accounts.config.collection,
            CumzillaraptorsError::InvalidCollection
        );
        require_keys_eq!(
            ctx.accounts.config.core_program,
            mpl_core::ID,
            CumzillaraptorsError::InvalidCoreProgram
        );
        require_keys_eq!(
            ctx.accounts.mpl_core_program.key(),
            mpl_core::ID,
            CumzillaraptorsError::InvalidCoreProgram
        );

        let claim_leaf = claims::verify_claim_eligibility(
            &ctx.accounts.config,
            &ctx.accounts.registry,
            ctx.program_id,
            &eth_address,
            nft_id,
            &nonce,
            &claim_proof,
        )?;
        let (expected_receipt, receipt_bump) =
            Pubkey::find_program_address(&[b"claim", &claim_leaf], ctx.program_id);
        require_keys_eq!(
            ctx.accounts.receipt.key(),
            expected_receipt,
            CumzillaraptorsError::InvalidClaimReceipt
        );
        require!(
            !ctx.accounts.registry.is_allocated(nft_id)?,
            CumzillaraptorsError::AllocationIdAlreadyUsed
        );
        metadata::verify_metadata_proof(
            ctx.program_id,
            &ctx.accounts.config.metadata_root,
            nft_id,
            &name,
            &uri,
            &metadata_proof,
        )?;
        let message = secp256k1::build_claim_message(
            "devnet",
            *ctx.program_id,
            ctx.accounts.claimer.key(),
            nft_id,
            eth_address,
            nonce,
            expiry_unix,
        )?;
        let preimage = secp256k1::eip191_preimage(&message)?;
        secp256k1::verify_preceding_secp_instruction(
            &ctx.accounts.instructions.to_account_info(),
            &eth_address,
            &preimage,
        )?;
        require_keys_eq!(
            ctx.accounts.receipt.key(),
            expected_receipt,
            CumzillaraptorsError::InvalidClaimReceipt
        );
        require_keys_eq!(
            *ctx.accounts.receipt.owner,
            anchor_lang::solana_program::system_program::ID,
            CumzillaraptorsError::InvalidClaimReceipt
        );
        require!(
            ctx.accounts.receipt.data_is_empty() && ctx.accounts.receipt.lamports() == 0,
            CumzillaraptorsError::InvalidClaimReceipt
        );
        require_keys_eq!(
            *ctx.accounts.asset.owner,
            anchor_lang::solana_program::system_program::ID,
            CumzillaraptorsError::InvalidCoreProgram
        );
        require!(
            ctx.accounts.asset.data_is_empty(),
            CumzillaraptorsError::InvalidCoreProgram
        );

        let nft_id_bytes = nft_id.to_be_bytes();
        let config_bump = ctx.accounts.config.bump;
        let asset_bump = ctx.bumps.asset;
        let config_seeds: &[&[u8]] = &[b"config", &[config_bump]];
        let asset_seeds: &[&[u8]] = &[b"asset", &nft_id_bytes, &[asset_bump]];
        // A third party can fund a predictable PDA. Drain only an empty system-owned asset PDA
        // using its signer seed, so dust cannot prevent the Core create instruction.
        let asset_lamports = ctx.accounts.asset.lamports();
        if asset_lamports > 0 {
            let recover_dust = anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.asset.key(),
                &ctx.accounts.claimer.key(),
                asset_lamports,
            );
            anchor_lang::solana_program::program::invoke_signed(
                &recover_dust,
                &[
                    ctx.accounts.asset.to_account_info(),
                    ctx.accounts.claimer.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                &[asset_seeds],
            )?;
        }
        let signer_seeds: &[&[&[u8]]] = &[config_seeds, asset_seeds];
        let core_program = ctx.accounts.mpl_core_program.to_account_info();
        let asset = ctx.accounts.asset.to_account_info();
        let collection = ctx.accounts.collection.to_account_info();
        let config = ctx.accounts.config.to_account_info();
        let claimer = ctx.accounts.claimer.to_account_info();
        let system_program = ctx.accounts.system_program.to_account_info();
        let mut builder = mpl_core::instructions::CreateV1CpiBuilder::new(&core_program);
        builder
            .asset(&asset)
            .collection(Some(&collection))
            .authority(Some(&config))
            .payer(&claimer)
            .owner(Some(&claimer))
            // Core derives an asset's update authority from its collection. The
            // collection itself is immutable-config-PDA controlled; passing a
            // second direct update authority is rejected by Core CreateV1.
            .system_program(&system_program)
            .data_state(mpl_core::types::DataState::AccountState)
            .name(name)
            .uri(uri);
        builder.invoke_signed(signer_seeds)?;

        let receipt_seeds: &[&[u8]] = &[b"claim", &claim_leaf, &[receipt_bump]];
        let create_receipt = anchor_lang::solana_program::system_instruction::create_account(
            &ctx.accounts.claimer.key(),
            &ctx.accounts.receipt.key(),
            Rent::get()?.minimum_balance(8 + ClaimReceipt::LEN),
            (8 + ClaimReceipt::LEN) as u64,
            ctx.program_id,
        );
        anchor_lang::solana_program::program::invoke_signed(
            &create_receipt,
            &[
                ctx.accounts.claimer.to_account_info(),
                ctx.accounts.receipt.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[receipt_seeds],
        )?;
        ClaimReceipt {
            claimer: ctx.accounts.claimer.key(),
            eth_address,
            nft_id,
            bump: receipt_bump,
        }
        .try_serialize(&mut &mut ctx.accounts.receipt.try_borrow_mut_data()?[..])?;

        ctx.accounts
            .registry
            .mark_allocated_after_core_success(nft_id)?;
        ctx.accounts.config.claims_minted = ctx
            .accounts
            .config
            .claims_minted
            .checked_add(1)
            .ok_or(error!(CumzillaraptorsError::ArithmeticOverflow))?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct SetClaimsSaleState<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = launch_authority)]
    pub config: Account<'info, CollectionConfig>,
    pub launch_authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(
    nft_id: u16,
    _eth_address: [u8; 20],
    _nonce: [u8; 32],
    _expiry_unix: u64,
    _claim_proof: Vec<[u8; 32]>,
    _name: String,
    _uri: String,
    _metadata_proof: Vec<[u8; 32]>
)]
pub struct ClaimNft<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, CollectionConfig>,
    #[account(mut, seeds = [b"allocation"], bump = registry.bump)]
    pub registry: Account<'info, AllocationRegistry>,
    #[account(mut)]
    pub claimer: Signer<'info>,
    /// CHECK: canonical collection key is checked against immutable config.
    #[account(mut, address = config.collection @ CumzillaraptorsError::InvalidCollection)]
    pub collection: UncheckedAccount<'info>,
    /// CHECK: Metaplex Core creates this deterministic PDA during the CPI.
    #[account(mut, seeds = [b"asset", &nft_id.to_be_bytes()], bump)]
    pub asset: UncheckedAccount<'info>,
    /// CHECK: handler derives and validates this receipt PDA from the canonical
    /// verified claim leaf; creation occurs only after the Core CPI succeeds.
    #[account(mut)]
    pub receipt: UncheckedAccount<'info>,
    /// CHECK: checked against the canonical mpl-core program ID.
    #[account(address = mpl_core::ID @ CumzillaraptorsError::InvalidCoreProgram)]
    pub mpl_core_program: UncheckedAccount<'info>,
    /// CHECK: Instructions sysvar is checked by the verifier.
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID @ CumzillaraptorsError::InvalidInstructionsSysvar)]
    pub instructions: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
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

fn validate_claims_sale_state_transition(current: SaleState, next: SaleState) -> Result<()> {
    require!(
        matches!(
            (current, next),
            (SaleState::Setup, SaleState::Live)
                | (SaleState::Live, SaleState::Paused)
                | (SaleState::Paused, SaleState::Live)
        ),
        CumzillaraptorsError::InvalidSaleStateTransition
    );
    Ok(())
}

/// The `InitializeLaunch` account context already requires this key to sign the transaction.
/// Default/production builds additionally bind that signer to the immutable devnet authority.
/// `test-validation` is intentionally a build-time-only exception for a separately named SBPF
/// binary that the x86 harness loads only into its private loopback validator.
fn validate_launch_authority(authority: Pubkey) -> Result<()> {
    #[cfg(feature = "test-validation")]
    {
        let _ephemeral_transaction_signer = authority;
        Ok(())
    }

    #[cfg(not(feature = "test-validation"))]
    {
        require_keys_eq!(
            authority,
            launch_authority(),
            CumzillaraptorsError::UnauthorizedLaunchAuthority
        );
        Ok(())
    }
}

#[allow(clippy::too_many_arguments)]
fn validate_launch_parameters(
    authority: Pubkey,
    treasury: Pubkey,
    core_program: Pubkey,
    collection: Pubkey,
    allocation_hash: [u8; 32],
    claim_root: [u8; 32],
    metadata_root: [u8; 32],
    cluster_tag_hash: [u8; 32],
    public_count: u16,
    claim_count: u16,
) -> Result<()> {
    validate_launch_authority(authority)?;
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
        metadata_root == APPROVED_METADATA_ROOT,
        CumzillaraptorsError::InvalidMetadataRoot
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
    metadata_root: [u8; 32],
    cluster_tag_hash: [u8; 32],
    bump: u8,
) {
    config.launch_authority = authority;
    config.treasury = treasury;
    config.core_program = core_program;
    config.collection = collection;
    config.allocation_hash = allocation_hash;
    config.claim_root = claim_root;
    config.metadata_root = metadata_root;
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

    #[cfg(not(feature = "test-validation"))]
    #[test]
    fn default_production_validation_rejects_an_arbitrary_authority() {
        assert!(validate_launch_authority(Pubkey::new_unique()).is_err());
        assert!(validate_launch_authority(launch_authority()).is_ok());
    }

    #[cfg(feature = "test-validation")]
    #[test]
    fn test_validation_accepts_an_ephemeral_transaction_signer_without_relaxing_metadata_root() {
        let signer = Pubkey::new_unique();
        let valid = [7; 32];
        let collection = Pubkey::new_unique();

        assert!(validate_launch_parameters(
            signer,
            Pubkey::new_unique(),
            mpl_core::ID,
            collection,
            valid,
            valid,
            APPROVED_METADATA_ROOT,
            valid,
            PUBLIC_COUNT,
            CLAIM_COUNT,
        )
        .is_ok());
        assert!(validate_launch_parameters(
            signer,
            Pubkey::new_unique(),
            mpl_core::ID,
            collection,
            valid,
            valid,
            [9; 32],
            valid,
            PUBLIC_COUNT,
            CLAIM_COUNT,
        )
        .is_err());
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
            ([0; 32], valid, APPROVED_METADATA_ROOT, valid),
            (valid, [0; 32], APPROVED_METADATA_ROOT, valid),
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
        assert!(validate_launch_parameters(
            launch_authority(),
            Pubkey::new_unique(),
            mpl_core::ID,
            collection,
            valid,
            valid,
            [9; 32],
            valid,
            PUBLIC_COUNT,
            CLAIM_COUNT,
        )
        .is_err());
        assert!(validate_launch_parameters(
            launch_authority(),
            Pubkey::new_unique(),
            mpl_core::ID,
            collection,
            valid,
            valid,
            APPROVED_METADATA_ROOT,
            valid,
            PUBLIC_COUNT,
            CLAIM_COUNT,
        )
        .is_ok());
    }

    #[test]
    fn claims_sale_state_has_only_live_pause_kill_switch_transitions() {
        assert!(validate_claims_sale_state_transition(SaleState::Setup, SaleState::Live).is_ok());
        assert!(validate_claims_sale_state_transition(SaleState::Live, SaleState::Paused).is_ok());
        assert!(validate_claims_sale_state_transition(SaleState::Paused, SaleState::Live).is_ok());
        for (current, next) in [
            (SaleState::Setup, SaleState::Paused),
            (SaleState::Setup, SaleState::Setup),
            (SaleState::Live, SaleState::Live),
            (SaleState::Paused, SaleState::Paused),
        ] {
            assert!(validate_claims_sale_state_transition(current, next).is_err());
        }
    }

    #[test]
    fn write_launch_config_commits_every_immutable_field_and_setup_defaults() {
        let authority = launch_authority();
        let treasury = Pubkey::new_unique();
        let collection = Pubkey::new_unique();
        let allocation_hash = [1; 32];
        let claim_root = [2; 32];
        let metadata_root = [3; 32];
        let cluster_tag_hash = [4; 32];
        let mut config = CollectionConfig {
            launch_authority: Pubkey::default(),
            treasury: Pubkey::default(),
            core_program: Pubkey::default(),
            collection: Pubkey::default(),
            allocation_hash: [0; 32],
            claim_root: [0; 32],
            metadata_root: [0; 32],
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
            metadata_root,
            cluster_tag_hash,
            254,
        );
        assert_eq!(config.launch_authority, authority);
        assert_eq!(config.treasury, treasury);
        assert_eq!(config.core_program, mpl_core::ID);
        assert_eq!(config.collection, collection);
        assert_eq!(config.allocation_hash, allocation_hash);
        assert_eq!(config.claim_root, claim_root);
        assert_eq!(config.metadata_root, metadata_root);
        assert_eq!(config.cluster_tag_hash, cluster_tag_hash);
        assert_eq!(config.sale_state, SaleState::Setup);
        assert_eq!(config.public_minted, 0);
        assert_eq!(config.claims_minted, 0);
        assert_eq!(config.bump, 254);
    }
}
