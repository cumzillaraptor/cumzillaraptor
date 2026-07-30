use anchor_lang::prelude::*;

#[error_code]
pub enum CumzillaraptorsError {
    #[msg("The supplied launch authority is not authorized for this devnet launch.")]
    UnauthorizedLaunchAuthority,
    #[msg("The immutable launch configuration already exists.")]
    AlreadyInitialized,
    #[msg("Treasury must not be the default public key.")]
    InvalidTreasury,
    #[msg("Core program must equal the canonical mpl-core program ID.")]
    InvalidLaunchCoreProgram,
    #[msg("Collection must not be the default public key.")]
    InvalidLaunchCollection,
    #[msg("Public allocation count must equal 247.")]
    InvalidPublicCount,
    #[msg("Claim allocation count must equal 173.")]
    InvalidClaimCount,
    #[msg("Allocation manifest hash must not be all zeros.")]
    InvalidAllocationHash,
    #[msg("Claim root must not be all zeros.")]
    InvalidClaimRoot,
    #[msg("Metadata mapping hash must not be all zeros.")]
    InvalidMetadataHash,
    #[msg("Cluster tag hash must not be all zeros.")]
    InvalidClusterTagHash,
    #[msg("Mint pool must contain exactly the 247 unique public-sale NFT IDs.")]
    InvalidMintPool,
    #[msg("Mint pool has been exhausted.")]
    MintPoolExhausted,
    #[msg("Claims have not been enabled yet.")]
    ClaimsNotEnabled,
    #[msg("Merkle proof is too long.")]
    ProofTooLong,
    #[msg("Merkle proof is invalid.")]
    InvalidMerkleProof,
    #[msg("NFT id must be between 1 and 420.")]
    InvalidNftId,
    #[msg("Arithmetic overflow.")]
    ArithmeticOverflow,
    #[msg("The supplied Metaplex Core program account is invalid.")]
    InvalidCoreProgram,
    #[msg("The supplied Metaplex Core collection does not match configuration.")]
    InvalidCollection,
    #[msg("Core asset name must not be empty.")]
    InvalidCoreAssetName,
    #[msg("Core asset URI must not be empty.")]
    InvalidCoreAssetUri,
}
