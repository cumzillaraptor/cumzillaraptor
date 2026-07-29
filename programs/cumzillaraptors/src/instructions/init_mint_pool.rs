use anchor_lang::prelude::*;
use crate::states::*;
use crate::errors::ErrorCode;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitMintPoolArgs {
    pub order: Vec<u16>,
}

#[derive(Accounts)]
pub struct InitMintPool<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = authority,
        space = MintPool::MAX_SIZE,
        seeds = [b"mint_pool"],
        bump
    )]
    pub mint_pool: Account<'info, MintPool>,

    #[account(mut, constraint = authority.key() == config.authority @ ErrorCode::Unauthorized)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_init_mint_pool(ctx: Context<InitMintPool>, args: InitMintPoolArgs) -> Result<()> {
    require!(args.order.len() == 247, ErrorCode::NftNotFound);
    let pool = &mut ctx.accounts.mint_pool;
    pool.order = args.order;
    pool.next_index = 0;
    pool.bump = ctx.bumps.mint_pool;
    Ok(())
}
