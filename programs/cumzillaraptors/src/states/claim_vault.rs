use anchor_lang::prelude::*;

/// Tracks which claim NFTs have been claimed
#[account]
pub struct ClaimVault {
    /// Which NFT IDs have been claimed (bitmap: 173 bits = 22 bytes)
    pub claimed: Vec<u8>,
    /// PDA that owns the pre-minted NFTs
    pub vault_authority: Pubkey,
    /// Bump seed for the vault authority PDA
    pub bump: u8,
}

impl ClaimVault {
    // 8 + 4 + 22 + 32 + 1 = 67
    pub const MAX_SIZE: usize = 8 + 4 + 22 + 32 + 1;

    /// Check if a specific NFT index has been claimed
    pub fn is_claimed(&self, index: u16) -> bool {
        let byte_pos = (index / 8) as usize;
        let bit_pos = (index % 8) as u8;
        if byte_pos >= self.claimed.len() {
            return false;
        }
        (self.claimed[byte_pos] & (1 << bit_pos)) != 0
    }

    /// Mark an NFT as claimed
    pub fn mark_claimed(&mut self, index: u16) {
        let byte_pos = (index / 8) as usize;
        let bit_pos = (index % 8) as u8;
        while self.claimed.len() <= byte_pos {
            self.claimed.push(0);
        }
        self.claimed[byte_pos] |= 1 << bit_pos;
    }
}
