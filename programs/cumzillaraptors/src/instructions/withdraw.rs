use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::states::*;
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// CHECK: Config stores the treasury address
    #[account(mut)]
    pub treasury: AccountInfo<'info>,

    #[account(constraint = authority.key() == config.authority @ ErrorCode::Unauthorized)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_withdraw(ctx: Context<Withdraw>) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(ctx.accounts.treasury.key() == config.treasury, ErrorCode::InvalidTreasury);

    let balance = ctx.accounts.config.to_account_info().lamports();
    let rent_exempt = Rent::get()?.minimum_balance(Config::INIT_SPACE);
    let withdrawable = balance.saturating_sub(rent_exempt);

    if withdrawable > 0 {
        let transfer_ix = system_program::Transfer {
            from: ctx.accounts.config.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
        };
        let seeds = &[b"config".as_ref(), &[config.bump]];
        let signer_seeds = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            transfer_ix,
            signer_seeds,
        );
        system_program::transfer(cpi_ctx, withdrawable)?;
    }

    Ok(())
}
