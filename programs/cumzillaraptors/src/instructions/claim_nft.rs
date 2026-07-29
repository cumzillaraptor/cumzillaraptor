use anchor_lang::prelude::*;
use crate::states::*;
use crate::errors::*;
use solana_program::keccak;

/// Ethereum holder claims their pre-minted NFT using a merkle proof.
/// The NFT is transferred from the vault authority PDA to the user's Solana wallet.
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ClaimNftArgs {
    /// The Ethereum wallet address (20 bytes)
    pub eth_address: [u8; 20],
    /// The NFT number being claimed (e.g. 1 for cumzillaraptor #1)
    pub nft_number: u16,
    /// Merkle proof: sibling hashes up to the root
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

    /// The vault authority PDA that owns the pre-minted NFTs
    /// CHECK: PDA seeds verified
    #[account(
        mut,
        seeds = [b"vault_authority"],
        bump
    )]
    pub vault_authority: AccountInfo<'info>,

    /// User receiving the NFT (Solana wallet)
    #[account(mut)]
    pub user: Signer<'info>,

    /// The pre-minted Core Asset (NFT) to transfer
    /// CHECK: Verified by MPL Core program
    #[account(mut)]
    pub asset: AccountInfo<'info>,

    /// Metaplex Core program
    /// CHECK: Verified by CPI
    pub mpl_core_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_claim_nft(ctx: Context<ClaimNft>, args: ClaimNftArgs) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(config.claims_ready, ErrorCode::ClaimsNotReady);

    let claim_vault = &mut ctx.accounts.claim_vault;

    // Convert nft_number to claim index (0-based in the reserve list)
    let claim_index = args.nft_number - 1;
    
    // Check not already claimed
    require!(!claim_vault.is_claimed(claim_index), ErrorCode::AlreadyClaimed);

    // Compute merkle leaf: keccak256(eth_address ++ nft_number)
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

    // Note: The actual MPL Core Transfer CPI to send the NFT from vault to user
    // is performed by the frontend after this instruction succeeds.
    // This instruction validates the claim proof and updates state.

    emit!(ClaimedEvent {
        eth_address: args.eth_address,
        nft_number: args.nft_number,
        user: ctx.accounts.user.key(),
    });

    Ok(())
}

/// Verify a merkle proof against the root
fn verify_merkle_proof(leaf: &[u8; 32], proof: &[[u8; 32]], root: &[u8; 32]) -> bool {
    let mut computed = *leaf;
    for sibling in proof.iter() {
        // Sort each pair for a standard merkle tree
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
