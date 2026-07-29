use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

pub mod core;

// Devnet-only program keypair. Replace only through an explicit upgrade/deployment plan.
declare_id!("2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2");

pub const MINT_POOL_SIZE: usize = 247;
pub const CLAIM_SUPPLY: u16 = 173;
pub const MAX_PROOF_DEPTH: usize = 32;
pub const MINT_PRICE_LAMPORTS: u64 = 1_000_000_000;

#[program]
pub mod cumzillaraptors {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        merkle_root: [u8; 32],
        treasury: Pubkey,
    ) -> Result<()> {
        require_keys_neq!(
            treasury,
            Pubkey::default(),
            CumzillaraptorsError::InvalidTreasury
        );

        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.treasury = treasury;
        config.merkle_root = merkle_root;
        config.mint_price_lamports = MINT_PRICE_LAMPORTS;
        config.minted_count = 0;
        config.claimed_count = 0;
        config.claims_enabled = false;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    /// Writes the complete, pre-shuffled public-mint inventory once.
    pub fn initialize_mint_pool(ctx: Context<InitializeMintPool>, nft_ids: Vec<u16>) -> Result<()> {
        require!(
            nft_ids.len() == MINT_POOL_SIZE,
            CumzillaraptorsError::InvalidMintPool
        );
        assert_unique_and_in_range(&nft_ids)?;

        let pool = &mut ctx.accounts.mint_pool;
        pool.nft_ids = nft_ids;
        pool.next_index = 0;
        pool.bump = ctx.bumps.mint_pool;
        Ok(())
    }

    /// Enables claims after the off-chain claim-vault minting procedure is complete.
    pub fn enable_claims(ctx: Context<EnableClaims>) -> Result<()> {
        ctx.accounts.config.claims_enabled = true;
        Ok(())
    }

    /// Records one paid public-sale allocation and transfers the fixed 1 SOL price to treasury.
    /// The NFT asset itself is minted by the explicit Metaplex Core integration introduced later.
    pub fn mint_random(ctx: Context<MintRandom>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require_keys_eq!(
            ctx.accounts.treasury.key(),
            config.treasury,
            CumzillaraptorsError::InvalidTreasury
        );

        let pool = &mut ctx.accounts.mint_pool;
        let index = usize::from(pool.next_index);
        require!(
            index < pool.nft_ids.len(),
            CumzillaraptorsError::MintPoolExhausted
        );

        let nft_id = pool.nft_ids[index];
        let cpi_accounts = Transfer {
            from: ctx.accounts.buyer.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
        };
        system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts),
            config.mint_price_lamports,
        )?;

        pool.next_index = pool
            .next_index
            .checked_add(1)
            .ok_or(CumzillaraptorsError::ArithmeticOverflow)?;
        config.minted_count = config
            .minted_count
            .checked_add(1)
            .ok_or(CumzillaraptorsError::ArithmeticOverflow)?;
        emit!(PublicMintAllocated {
            buyer: ctx.accounts.buyer.key(),
            nft_id,
            mint_index: pool.next_index - 1
        });
        Ok(())
    }

    /// Validates a sorted Merkle proof and consumes the matching claim exactly once.
    /// `nft_id` is the collection ID reserved for this Ethereum address.
    pub fn claim_nft(
        ctx: Context<ClaimNft>,
        eth_address: [u8; 20],
        nft_id: u16,
        proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        require!(
            ctx.accounts.config.claims_enabled,
            CumzillaraptorsError::ClaimsNotEnabled
        );
        require!(
            proof.len() <= MAX_PROOF_DEPTH,
            CumzillaraptorsError::ProofTooLong
        );
        require!(
            nft_id > 0 && nft_id <= 420,
            CumzillaraptorsError::InvalidNftId
        );

        let leaf = hash_leaf(&eth_address, nft_id);
        require!(
            verify_sorted_proof(leaf, &proof, ctx.accounts.config.merkle_root),
            CumzillaraptorsError::InvalidMerkleProof
        );

        let receipt = &mut ctx.accounts.claim_receipt;
        receipt.claimer = ctx.accounts.claimer.key();
        receipt.eth_address = eth_address;
        receipt.nft_id = nft_id;
        receipt.bump = ctx.bumps.claim_receipt;

        let config = &mut ctx.accounts.config;
        config.claimed_count = config
            .claimed_count
            .checked_add(1)
            .ok_or(CumzillaraptorsError::ArithmeticOverflow)?;
        emit!(ClaimConsumed {
            claimer: receipt.claimer,
            eth_address,
            nft_id
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + CollectionConfig::LEN, seeds = [b"config"], bump)]
    pub config: Account<'info, CollectionConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeMintPool<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, CollectionConfig>,
    #[account(init, payer = authority, space = 8 + MintPool::LEN, seeds = [b"mint-pool"], bump)]
    pub mint_pool: Account<'info, MintPool>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EnableClaims<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, CollectionConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct MintRandom<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, CollectionConfig>,
    #[account(mut, seeds = [b"mint-pool"], bump = mint_pool.bump)]
    pub mint_pool: Account<'info, MintPool>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: constrained against config.treasury before transfer.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(eth_address: [u8; 20], nft_id: u16)]
pub struct ClaimNft<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, CollectionConfig>,
    #[account(
        init,
        payer = claimer,
        space = 8 + ClaimReceipt::LEN,
        seeds = [b"claim", eth_address.as_ref(), &nft_id.to_be_bytes()],
        bump
    )]
    pub claim_receipt: Account<'info, ClaimReceipt>,
    #[account(mut)]
    pub claimer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct CollectionConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub merkle_root: [u8; 32],
    pub mint_price_lamports: u64,
    pub minted_count: u16,
    pub claimed_count: u16,
    pub claims_enabled: bool,
    pub bump: u8,
}
impl CollectionConfig {
    pub const LEN: usize = 32 + 32 + 32 + 8 + 2 + 2 + 1 + 1;
}

#[account]
pub struct MintPool {
    pub nft_ids: Vec<u16>,
    pub next_index: u16,
    pub bump: u8,
}
impl MintPool {
    pub const LEN: usize = 4 + (MINT_POOL_SIZE * 2) + 2 + 1;
}

#[account]
pub struct ClaimReceipt {
    pub claimer: Pubkey,
    pub eth_address: [u8; 20],
    pub nft_id: u16,
    pub bump: u8,
}
impl ClaimReceipt {
    pub const LEN: usize = 32 + 20 + 2 + 1;
}

#[event]
pub struct PublicMintAllocated {
    pub buyer: Pubkey,
    pub nft_id: u16,
    pub mint_index: u16,
}
#[event]
pub struct ClaimConsumed {
    pub claimer: Pubkey,
    pub eth_address: [u8; 20],
    pub nft_id: u16,
}

#[error_code]
pub enum CumzillaraptorsError {
    #[msg("Treasury does not match the configured collection treasury.")]
    InvalidTreasury,
    #[msg("Mint pool must contain exactly the 247 unique public-sale NFT IDs.")]
    InvalidMintPool,
    #[msg("Mint pool has been exhausted.")]
    MintPoolExhausted,
    #[msg("Claims have not been enabled yet.")]
    ClaimsNotEnabled,
    #[msg("Merkle proof is too long.")]
    ProofTooLong,
    #[msg("Merkle proof is invalid.")]
    InvalidMerkleProof,
    #[msg("NFT id must be between 1 and 420.")]
    InvalidNftId,
    #[msg("Arithmetic overflow.")]
    ArithmeticOverflow,
    #[msg("The supplied Metaplex Core program account is invalid.")]
    InvalidCoreProgram,
    #[msg("The supplied Metaplex Core collection does not match configuration.")]
    InvalidCollection,
    #[msg("Core asset name must not be empty.")]
    InvalidCoreAssetName,
    #[msg("Core asset URI must not be empty.")]
    InvalidCoreAssetUri,
}

fn assert_unique_and_in_range(ids: &[u16]) -> Result<()> {
    let mut seen = [false; 421];
    for id in ids {
        let index = usize::from(*id);
        require!(
            index > 0 && index <= 420 && !seen[index],
            CumzillaraptorsError::InvalidMintPool
        );
        seen[index] = true;
    }
    Ok(())
}

fn hash_leaf(eth_address: &[u8; 20], nft_id: u16) -> [u8; 32] {
    anchor_lang::solana_program::keccak::hashv(&[eth_address, &nft_id.to_be_bytes()]).to_bytes()
}

fn verify_sorted_proof(mut computed: [u8; 32], proof: &[[u8; 32]], root: [u8; 32]) -> bool {
    for sibling in proof {
        computed = if computed <= *sibling {
            anchor_lang::solana_program::keccak::hashv(&[&computed, sibling]).to_bytes()
        } else {
            anchor_lang::solana_program::keccak::hashv(&[sibling, &computed]).to_bytes()
        };
    }
    computed == root
}
