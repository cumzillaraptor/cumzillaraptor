use anchor_lang::prelude::*;
use solana_keccak_hasher::hashv;
#[cfg(test)]
use std::str::FromStr;

use crate::errors::CumzillaraptorsError;

pub const CLAIM_DOMAIN: &str = "CUMZILLARAPTORS_CLAIM_V1";
pub const MAX_NFT_ID: u16 = 420;
pub const MAX_CLUSTER_LEN: usize = 32;
pub const NONCE_LEN: usize = 32;
pub const ETH_ADDRESS_LEN: usize = 20;
pub const SECP_SIGNATURE_LEN: usize = 65;

fn require_canonical_cluster(cluster: &str) -> Result<()> {
    require!(
        !cluster.is_empty()
            && cluster.len() <= MAX_CLUSTER_LEN
            && cluster
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-'),
        CumzillaraptorsError::InvalidClaimMessage
    );
    Ok(())
}

fn require_nft_id(nft_id: u16) -> Result<()> {
    require!(
        (1..=MAX_NFT_ID).contains(&nft_id),
        CumzillaraptorsError::InvalidNftId
    );
    Ok(())
}

fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

#[cfg(test)]
fn parse_pubkey(value: &str) -> Result<Pubkey> {
    Pubkey::from_str(value).map_err(|_| error!(CumzillaraptorsError::InvalidClaimMessage))
}

pub fn build_claim_message(
    cluster: &str,
    program_id: Pubkey,
    recipient: Pubkey,
    nft_id: u16,
    eth_address: [u8; ETH_ADDRESS_LEN],
    nonce: [u8; NONCE_LEN],
    expiry_unix: u64,
) -> Result<String> {
    require_canonical_cluster(cluster)?;
    require_nft_id(nft_id)?;
    let eth_hex = encode_hex(&eth_address);
    let nonce_hex = encode_hex(&nonce);
    Ok(format!(
        "{CLAIM_DOMAIN}\ncluster: {cluster}\nprogram: {program_id}\nrecipient: {recipient}\nnft_id: {nft_id}\neth_address: 0x{eth_hex}\nnonce: 0x{nonce_hex}\nexpiry_unix: {expiry_unix}"
    ))
}

pub fn eip191_preimage(message: &str) -> Result<Vec<u8>> {
    require!(
        message.starts_with(&format!("{CLAIM_DOMAIN}\n")),
        CumzillaraptorsError::InvalidClaimMessage
    );
    let message_bytes = message.as_bytes();
    let prefix = format!("\x19Ethereum Signed Message:\n{}", message_bytes.len());
    let mut preimage = Vec::with_capacity(prefix.len() + message_bytes.len());
    preimage.extend_from_slice(prefix.as_bytes());
    preimage.extend_from_slice(message_bytes);
    Ok(preimage)
}

pub fn claim_message_hash(message: &str) -> Result<[u8; 32]> {
    let preimage = eip191_preimage(message)?;
    Ok(hashv(&[&preimage]).to_bytes())
}

/// Recovers the secp256k1 public key from the 65-byte signature (r‖s‖v) over the
/// 32-byte message hash and asserts it derives the authorized ETH address. This
/// replaces the old precompile-preceded design: the full EIP-191 preimage (up to
/// ~440 bytes) is never placed on-chain, so a real 7/8-proof claim fits the
/// 1232-byte transaction limit. The signature is supplied as claim_nft data and
/// recovered in-program via the secp256k1_recover syscall.
pub fn verify_secp_signature(
    signature: &[u8; SECP_SIGNATURE_LEN],
    expected_eth_address: &[u8; ETH_ADDRESS_LEN],
    message_hash: &[u8; 32],
) -> Result<()> {
    // v is 27/28 for EIP-191 personal_sign; recover uses 0/1.
    let recovery_id = match signature[64] {
        27 | 28 => signature[64] - 27,
        other => other,
    };
    let recovered_pubkey = solana_secp256k1_recover::secp256k1_recover(
        message_hash,
        recovery_id,
        &signature[..64],
    )
    .map_err(|_| error!(CumzillaraptorsError::WrongSecpSigner))?;
    let pubkey_bytes = recovered_pubkey.to_bytes();
    // ETH address = last 20 bytes of keccak256(uncompressed pubkey x‖y).
    let digest = hashv(&[&pubkey_bytes]).to_bytes();
    let recovered_eth: [u8; ETH_ADDRESS_LEN] = digest[12..32]
        .try_into()
        .map_err(|_| error!(CumzillaraptorsError::WrongSecpSigner))?;
    require!(
        recovered_eth == *expected_eth_address,
        CumzillaraptorsError::WrongSecpSigner
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Committed production vector: ETH holder 0xb0e683... signs the claim for
    /// NFT #4 to recipient 8eCKWEH... on devnet (message hash 0x2ce0e1...).
    /// This is the exact authorization captured during the devnet rehearsal.
    const ETH4: [u8; 20] = [
        0xb0, 0xe6, 0x83, 0x42, 0x72, 0x02, 0xd1, 0x43, 0x66, 0x97, 0x7b, 0x71, 0x83, 0xd2, 0x28,
        0xa5, 0x08, 0xb5, 0xa1, 0x9c,
    ];
    const NONCE4: [u8; 32] = [
        0x0c, 0x05, 0xb4, 0x8c, 0xa9, 0x16, 0x81, 0x6d, 0x5f, 0xeb, 0x03, 0x5d, 0x5e, 0x0b, 0x75,
        0xd0, 0xc8, 0xc8, 0x6d, 0xf0, 0x23, 0x32, 0x37, 0xe9, 0xf6, 0xb0, 0x1a, 0x51, 0x8e, 0x70,
        0x25, 0xc6,
    ];
    const SIG4: [u8; 65] = [
        0x16, 0x71, 0x85, 0xbc, 0x59, 0x81, 0x08, 0x63, 0x99, 0xef, 0x6d, 0xdf, 0x15, 0xca, 0xf7,
        0x6d, 0x3b, 0xf0, 0x49, 0x98, 0xac, 0x27, 0x8a, 0xd1, 0xd2, 0xcd, 0x47, 0xe0, 0x14, 0xdb,
        0x6e, 0x72, 0x51, 0x3c, 0x1f, 0xf6, 0x24, 0x5e, 0xf1, 0x41, 0x86, 0xc7, 0x29, 0xec, 0x30,
        0x1f, 0xb6, 0x06, 0x5e, 0x54, 0x72, 0x73, 0xf4, 0xae, 0x72, 0xf7, 0x04, 0x5d, 0x8b, 0x02,
        0x67, 0x6a, 0xa1, 0x9d, 0x1c,
    ];

    fn claim4_message() -> String {
        let program = parse_pubkey("AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY").unwrap();
        let recipient = parse_pubkey("8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d").unwrap();
        build_claim_message("devnet", program, recipient, 4, ETH4, NONCE4, 1_787_526_746).unwrap()
    }

    #[test]
    fn v1_message_and_eip191_hash_match_committed_vector() {
        let message = claim4_message();
        let digest = claim_message_hash(&message).unwrap();
        // Committed by the devnet rehearsal (the ETH holder signed this exact hash).
        assert_eq!(
            encode_hex(&digest),
            "2ce0e14b5b391043fef75b88f4f13564f11b69aa829f9357f6b880a33d1e971f"
        );
        let preimage = eip191_preimage(&message).unwrap();
        assert!(std::str::from_utf8(&preimage)
            .unwrap()
            .starts_with("\x19Ethereum Signed Message:\n"));
    }

    #[test]
    fn valid_production_signature_recovers_expected_eth_address() {
        let message = claim4_message();
        let digest = claim_message_hash(&message).unwrap();
        assert!(verify_secp_signature(&SIG4, &ETH4, &digest).is_ok());
    }

    #[test]
    fn rejects_wrong_signer_bad_recovery_and_malformed_signatures() {
        let message = claim4_message();
        let digest = claim_message_hash(&message).unwrap();

        let mut wrong_signer = ETH4;
        wrong_signer[0] ^= 1;
        assert!(verify_secp_signature(&SIG4, &wrong_signer, &digest).is_err());

        let mut bad_recovery = SIG4;
        bad_recovery[64] = 4;
        assert!(verify_secp_signature(&bad_recovery, &ETH4, &digest).is_err());

        let mut truncated_r = SIG4;
        truncated_r[0] ^= 0xff;
        assert!(verify_secp_signature(&truncated_r, &ETH4, &digest).is_err());

        let mut wrong_hash = digest;
        wrong_hash[0] ^= 1;
        assert!(verify_secp_signature(&SIG4, &ETH4, &wrong_hash).is_err());
    }
}
