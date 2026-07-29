use anchor_lang::prelude::*;

#[account]
pub struct Config {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub mint_price: u64,
    pub mint_count: u16,
    pub claim_count: u16,
    pub merkle_root: [u8; 32],
    pub claims_ready: bool,
    pub bump: u8,
}

impl Config {
    pub const INIT_SPACE: usize = 8 + 32 + 32 + 8 + 2 + 2 + 32 + 1 + 1;
}
