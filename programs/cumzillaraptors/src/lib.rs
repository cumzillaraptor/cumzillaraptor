use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

pub mod errors;
pub mod instructions;
pub mod states;

use instructions::*;
use states::*;
use errors::*;

#[program]
pub mod cumzillaraptors {
    use super::*;

    /// Initialize the collection config
    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        instructions::initialize::handle_initialize(ctx, args)
    }

    /// Set up the shuffled mint pool (247 items)
    pub fn init_mint_pool(ctx: Context<InitMintPool>, args: InitMintPoolArgs) -> Result<()> {
        instructions::init_mint_pool::handle_init_mint_pool(ctx, args)
    }

    /// Initialize the claim vault (called before pre-minting claim NFTs)
    pub fn pre_mint_claims(ctx: Context<PreMintClaims>) -> Result<()> {
        instructions::pre_mint_claims::handle_pre_mint_claims(ctx)
    }

    /// Mint a random NFT (user pays 1 SOL)
    pub fn mint_random(ctx: Context<MintRandom>) -> Result<()> {
        instructions::mint_random::handle_mint_random(ctx)
    }

    /// Claim a pre-minted NFT (Ethereum holder, free)
    pub fn claim_nft(ctx: Context<ClaimNft>, args: ClaimNftArgs) -> Result<()> {
        instructions::claim_nft::handle_claim_nft(ctx, args)
    }

    /// Withdraw collected SOL to treasury
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        instructions::withdraw::handle_withdraw(ctx)
    }
}
