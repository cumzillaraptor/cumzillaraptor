use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::states::*;
use crate::errors::*;

/// Pre-mints all 173 claim NFTs into the vault authority PDA.
/// The vault authority PDA owns these NFTs until claimed.
/// Called once after deployment — requires funding for rent + mint fees.
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

    /// PDA that will own the pre-minted NFTs (no signer needed for init)
    /// CHECK: This is a PDA derived from seeds, no deserialization needed
    #[account(
        mut,
        seeds = [b"vault_authority"],
        bump
    )]
    pub vault_authority: AccountInfo<'info>,

    #[account(constraint = authority.key() == config.authority @ ErrorCode::Unauthorized)]
    pub authority: Signer<'info>,

    /// The Metaplex Core collection mint
    /// CHECK: Verified by MPL Core program
    pub collection_mint: AccountInfo<'info>,

    /// Metaplex Core program
    /// CHECK: Verified by CPI
    pub mpl_core_program: AccountInfo<'info>,

    /// SPL System Program
    pub system_program: Program<'info, System>,

    /// SPL Token Program (needed for Core minting)
    /// CHECK: Verified by CPI
    pub token_program: AccountInfo<'info>,

    /// SPL Associated Token Account program
    /// CHECK: Verified by CPI
    pub ata_program: AccountInfo<'info>,
}

pub fn handle_pre_mint_claims(ctx: Context<PreMintClaims>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(!config.claims_ready, ErrorCode::ClaimsAlreadyPreMinted);

    let claim_vault = &mut ctx.accounts.claim_vault;
    claim_vault.vault_authority = ctx.accounts.vault_authority.key();
    claim_vault.bump = ctx.bumps.claim_vault;
    claim_vault.claimed = vec![0u8; 22]; // bitmap for 173 items

    // This function just initializes the vault state.
    // The actual NFT pre-minting will be done via a separate script
    // that sends individual CreateV1 instructions for each of the 173 NFTs.
    // Each CreateV1 will set the vault_authority PDA as the owner.
    
    config.claims_ready = true;

    Ok(())
}
