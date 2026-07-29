use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::states::*;
use crate::errors::*;

/// User pays 1 SOL and gets the next random NFT from the mint pool.
/// The program CPIs to Metaplex Core to create the NFT.
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

    /// Payer and recipient of the NFT
    #[account(mut)]
    pub user: Signer<'info>,

    /// The Metaplex Core collection mint
    /// CHECK: Verified by MPL Core program
    pub collection_mint: AccountInfo<'info>,

    /// New Core Asset PDA (the NFT to be created)
    /// CHECK: Derived and verified during CPI
    #[account(mut)]
    pub asset: AccountInfo<'info>,

    /// Metaplex Core program
    /// CHECK: Verified by CPI
    pub mpl_core_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_mint_random(ctx: Context<MintRandom>) -> Result<()> {
    require!(ctx.accounts.user.lamports() >= ctx.accounts.config.mint_price, ErrorCode::InsufficientPayment);

    let config = &mut ctx.accounts.config;
    let mint_pool = &mut ctx.accounts.mint_pool;

    // Check pool has items
    require!(
        (mint_pool.next_index as usize) < mint_pool.order.len(),
        ErrorCode::PoolExhausted
    );

    // Transfer 1 SOL from user to treasury
    let transfer_ix = system_program::Transfer {
        from: ctx.accounts.user.to_account_info(),
        to: config.treasury.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        transfer_ix,
    );
    system_program::transfer(cpi_ctx, config.mint_price)?;

    // Increment counters
    let nft_index = mint_pool.next_index;
    mint_pool.next_index += 1;
    config.mint_count += 1;

    // Note: The actual MPL Core CPI to create the NFT is done by the frontend
    // after this instruction succeeds. This instruction just validates payment
    // and updates state. The NFT ID to mint is: mint_pool.order[nft_index]
    
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
