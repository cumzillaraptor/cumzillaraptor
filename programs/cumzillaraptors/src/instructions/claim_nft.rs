use anchor_lang::prelude::*;
use crate::states::*;
use crate::errors::ErrorCode;
use solana_program::keccak;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ClaimNftArgs {
    pub eth_address: [u8; 20],
    pub nft_number: u16,
    pub proof: Vec<[u8; 32]>,
}

#[derive(Accounts)]
pub struct ClaimNft<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"claim_vault"],
        bump = claim_vault.bump
    )]
    pub claim_vault: Account<'info, ClaimVault>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_claim_nft(ctx: Context<ClaimNft>, args: ClaimNftArgs) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let claim_vault = &mut ctx.accounts.claim_vault;

    require!(config.claims_ready, ErrorCode::ClaimsNotReady);

    // NFT number is 1-based, convert to 0-based index
    let claim_index = args.nft_number - 1;
    require!(!claim_vault.is_claimed(claim_index), ErrorCode::AlreadyClaimed);

    // Compute merkle leaf: keccak256(eth_address ++ nft_number_be)
    let mut leaf_input = Vec::with_capacity(22);
    leaf_input.extend_from_slice(&args.eth_address);
    leaf_input.extend_from_slice(&args.nft_number.to_be_bytes());
    let leaf = keccak::hashv(&[&leaf_input]).to_bytes();

    // Verify merkle proof
    require!(
        verify_merkle_proof(&leaf, &args.proof, &config.merkle_root),
        ErrorCode::InvalidMerkleProof
    );

    // Mark as claimed
    claim_vault.mark_claimed(claim_index);
    config.claim_count += 1;

    emit!(ClaimedEvent {
        eth_address: args.eth_address,
        nft_number: args.nft_number,
        user: ctx.accounts.user.key(),
    });

    Ok(())
}

fn verify_merkle_proof(leaf: &[u8; 32], proof: &[[u8; 32]], root: &[u8; 32]) -> bool {
    let mut computed = *leaf;
    for sibling in proof {
        if computed <= *sibling {
            computed = keccak::hashv(&[&computed, sibling]).to_bytes();
        } else {
            computed = keccak::hashv(&[sibling, &computed]).to_bytes();
        }
    }
    computed == *root
}

#[event]
pub struct ClaimedEvent {
    pub eth_address: [u8; 20],
    pub nft_number: u16,
    pub user: Pubkey,
}
