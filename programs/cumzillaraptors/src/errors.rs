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
    #[msg("Public allocation count must equal 246.")]
    InvalidPublicCount,
    #[msg("Claim allocation count must equal 174.")]
    InvalidClaimCount,
    #[msg("Allocation manifest hash must not be all zeros.")]
    InvalidAllocationHash,
    #[msg("Claim root must not be all zeros.")]
    InvalidClaimRoot,
    #[msg("Metadata Merkle root must not be all zeros.")]
    InvalidMetadataRoot,
    #[msg("Cluster tag hash must not be all zeros.")]
    InvalidClusterTagHash,
    #[msg("Mint pool must contain exactly the 246 unique public-sale NFT IDs.")]
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
    #[msg("Collection update authority does not equal the deterministic config PDA.")]
    InvalidCollectionUpdateAuthority,
    #[msg("Collection royalty recipient does not equal the configured primary-sale treasury.")]
    InvalidCollectionRoyaltyRecipient,
    #[msg("Collection royalty basis points must equal 500.")]
    InvalidCollectionRoyaltyBasisPoints,
    #[msg("Core asset name must not be empty.")]
    InvalidCoreAssetName,
    #[msg("Core asset URI must not be empty.")]
    InvalidCoreAssetUri,
    #[msg("Allocation list contains a duplicate NFT ID.")]
    DuplicateAllocationId,
    #[msg("Allocation NFT ID must be between 1 and 420.")]
    InvalidAllocationId,
    #[msg("Allocation lists must be the exact disjoint 246/174 partition of IDs 1 through 420.")]
    InvalidAllocationPartition,
    #[msg("Allocation registry does not match the immutable launch manifest hash.")]
    AllocationManifestMismatch,
    #[msg("NFT ID has already been allocated.")]
    AllocationIdAlreadyUsed,
    #[msg("NFT ID belongs to the opposite public/claim allocation partition.")]
    PublicClaimPartitionViolation,
    #[msg("Instructions sysvar account is invalid.")]
    InvalidInstructionsSysvar,
    #[msg("The required immediately preceding secp256k1 instruction is missing.")]
    MissingSecpInstruction,
    #[msg("The preceding instruction is not the canonical secp256k1 precompile.")]
    InvalidSecpProgram,
    #[msg("The secp256k1 instruction layout is malformed.")]
    MalformedSecpInstruction,
    #[msg("secp256k1 offsets must reference the secp instruction itself.")]
    CrossInstructionSecpData,
    #[msg("The secp256k1 signer does not match the authorized ETH address.")]
    WrongSecpSigner,
    #[msg("The secp256k1 message does not match the canonical authorization preimage.")]
    WrongSecpMessage,
    #[msg("Claim message input is not canonical.")]
    InvalidClaimMessage,
    #[msg("Metadata name, URI, or proof is invalid.")]
    InvalidMetadataProof,
}
