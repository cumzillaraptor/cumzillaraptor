use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Mint pool already initialized")]
    PoolAlreadyInitialized,
    #[msg("Mint pool is empty — all NFTs have been minted")]
    PoolExhausted,
    #[msg("Invalid merkle proof — you are not authorized to claim this NFT")]
    InvalidMerkleProof,
    #[msg("This NFT has already been claimed")]
    AlreadyClaimed,
    #[msg("All claim NFTs have been pre-minted")]
    ClaimsAlreadyPreMinted,
    #[msg("Not all claim NFTs have been pre-minted yet")]
    ClaimsNotReady,
    #[msg("Unauthorized — only the program authority can call this")]
    Unauthorized,
    #[msg("Invalid treasury address")]
    InvalidTreasury,
    #[msg("Insufficient payment — must send exactly 1 SOL")]
    InsufficientPayment,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("NFT not found in mint pool")]
    NftNotFound,
    #[msg("Claim not available for this NFT")]
    ClaimNotAvailable,
    #[msg("Invalid proof data — leaf does not match")]
    InvalidLeaf,
}
