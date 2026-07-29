use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::states::*;
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct MintRandom<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"mint_pool"],
        bump = mint_pool.bump
    )]
    pub mint_pool: Account<'info, MintPool>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// Treasury receives the 1 SOL payment
    /// CHECK: Config stores the treasury address
    #[account(mut)]
    pub treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_mint_random(ctx: Context<MintRandom>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let mint_pool = &mut ctx.accounts.mint_pool;

    require!(
        ctx.accounts.user.lamports() >= config.mint_price,
        ErrorCode::InsufficientPayment
    );
    require!(
        (mint_pool.next_index as usize) < mint_pool.order.len(),
        ErrorCode::PoolExhausted
    );

    // Transfer SOL from user to treasury
    let transfer_ix = system_program::Transfer {
        from: ctx.accounts.user.to_account_info(),
        to: ctx.accounts.treasury.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        transfer_ix,
    );
    system_program::transfer(cpi_ctx, config.mint_price)?;

    // Update state
    let nft_index = mint_pool.next_index;
    mint_pool.next_index += 1;
    config.mint_count += 1;

    emit!(MintedEvent {
        user: ctx.accounts.user.key(),
        nft_number: mint_pool.order[nft_index as usize],
        nft_index,
    });

    Ok(())
}

#[event]
pub struct MintedEvent {
    pub user: Pubkey,
    pub nft_number: u16,
    pub nft_index: u16,
}
