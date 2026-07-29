use anchor_lang::prelude::*;
use crate::states::*;
use crate::errors::ErrorCode;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeArgs {
    pub mint_price: u64,
    pub treasury: Pubkey,
    pub merkle_root: [u8; 32],
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.treasury = args.treasury;
    config.mint_price = args.mint_price;
    config.mint_count = 0;
    config.claim_count = 0;
    config.merkle_root = args.merkle_root;
    config.claims_ready = false;
    config.bump = ctx.bumps.config;
    Ok(())
}
