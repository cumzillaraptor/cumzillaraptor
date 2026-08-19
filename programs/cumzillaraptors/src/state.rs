use anchor_lang::prelude::*;

pub const PUBLIC_COUNT: u16 = 246;
pub const CLAIM_COUNT: u16 = 174;

// Generated from the user-approved public address in config/devnet-launch.json.
// No private key, seed phrase, or keypair file is embedded in program source.
pub const DEVNET_LAUNCH_AUTHORITY_BYTES: [u8; 32] = [
    89, 71, 31, 157, 100, 56, 159, 24, 65, 145, 55, 9, 62, 38, 66, 48, 245, 115, 74, 45, 245, 140,
    92, 146, 18, 176, 38, 222, 202, 170, 215, 239,
];

pub fn launch_authority() -> Pubkey {
    Pubkey::new_from_array(DEVNET_LAUNCH_AUTHORITY_BYTES)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub enum SaleState {
    Setup,
    Paused,
    Live,
}

#[account]
pub struct CollectionConfig {
    pub launch_authority: Pubkey,
    pub treasury: Pubkey,
    pub core_program: Pubkey,
    pub collection: Pubkey,
    pub allocation_hash: [u8; 32],
    pub claim_root: [u8; 32],
    pub metadata_root: [u8; 32],
    pub cluster_tag_hash: [u8; 32],
    pub sale_state: SaleState,
    pub public_minted: u16,
    pub claims_minted: u16,
    pub bump: u8,
}

impl CollectionConfig {
    pub const LEN: usize = (32 * 8) + 1 + 2 + 2 + 1;
}

#[account]
pub struct MintPool {
    pub nft_ids: Vec<u16>,
    pub next_index: u16,
    pub bump: u8,
}

impl MintPool {
    pub const LEN: usize = 4 + (PUBLIC_COUNT as usize * 2) + 2 + 1;
}

#[account]
pub struct ClaimReceipt {
    pub claimer: Pubkey,
    pub eth_address: [u8; 20],
    pub nft_id: u16,
    pub bump: u8,
}

impl ClaimReceipt {
    pub const LEN: usize = 32 + 20 + 2 + 1;
}
