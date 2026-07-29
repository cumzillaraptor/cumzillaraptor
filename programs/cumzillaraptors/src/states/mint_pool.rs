use anchor_lang::prelude::*;

/// Stores the shuffled order of mintable NFTs (247 items)
#[account]
pub struct MintPool {
    /// The shuffled order of NFT IDs (0..247, each maps to an nft_number)
    pub order: Vec<u16>,
    /// Next index to use in the order
    pub next_index: u16,
    /// Bump seed
    pub bump: u8,
}

impl MintPool {
    // 8 + 4 (vec len) + 247*2 + 2 + 1 = 8 + 4 + 494 + 2 + 1 = 509
    pub const MAX_SIZE: usize = 8 + 4 + (247 * 2) + 2 + 1;
}
