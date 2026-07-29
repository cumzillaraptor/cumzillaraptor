use anchor_lang::prelude::*;

/// Global config for the collection
#[account]
pub struct Config {
    /// Authority that can withdraw and manage
    pub authority: Pubkey,
    /// Treasury that receives mint proceeds and royalties
    pub treasury: Pubkey,
    /// Mint price in lamports (1 SOL = 1_000_000_000)
    pub mint_price: u64,
    /// Total NFTs minted via public mint so far
    pub mint_count: u16,
    /// Total NFTs claimed via claim so far
    pub claim_count: u16,
    /// Merkle root for claim verification (keccak256)
    pub merkle_root: [u8; 32],
    /// Metaplex Core collection mint address
    pub collection_mint: Pubkey,
    /// Whether claim vault has been pre-minted
    pub claims_ready: bool,
    /// PDA bump
    pub bump: u8,
}

impl Config {
    pub const INIT_SPACE: usize = 8 + 32 + 32 + 8 + 2 + 2 + 32 + 32 + 1 + 1;
}
