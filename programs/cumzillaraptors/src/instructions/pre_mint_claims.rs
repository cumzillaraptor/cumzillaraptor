use anchor_lang::prelude::*;
use crate::states::*;
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct PreMintClaims<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init_if_needed,
        payer = authority,
        space = ClaimVault::MAX_SIZE,
        seeds = [b"claim_vault"],
        bump
    )]
    pub claim_vault: Account<'info, ClaimVault>,

    #[account(mut, constraint = authority.key() == config.authority @ ErrorCode::Unauthorized)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_pre_mint_claims(ctx: Context<PreMintClaims>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(!config.claims_ready, ErrorCode::ClaimsAlreadyPreMinted);

    let claim_vault = &mut ctx.accounts.claim_vault;
    claim_vault.claimed = vec![0u8; 22]; // bitmap for 173 items
    config.claims_ready = true;

    Ok(())
}
