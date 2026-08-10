use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked,
};
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
const OFFSETS_LEN: usize = 11;
const HEADER_LEN: usize = 1 + OFFSETS_LEN;
const SECP256K1_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    4, 198, 252, 32, 240, 80, 204, 240, 85, 132, 215, 33, 28, 159, 140, 245, 158, 193, 71, 133,
    187, 22, 106, 30, 40, 48, 232, 18, 32, 0, 0, 0,
]);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct SecpOffsets {
    signature_offset: usize,
    signature_instruction_index: u8,
    eth_address_offset: usize,
    eth_address_instruction_index: u8,
    message_offset: usize,
    message_size: usize,
    message_instruction_index: u8,
}

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

fn parse_offsets(data: &[u8]) -> Result<SecpOffsets> {
    require!(
        data.len() >= HEADER_LEN,
        CumzillaraptorsError::MalformedSecpInstruction
    );
    require!(data[0] == 1, CumzillaraptorsError::MalformedSecpInstruction);
    let read_u16 = |offset: usize| -> Result<usize> {
        let bytes: [u8; 2] = data
            .get(offset..offset + 2)
            .ok_or(error!(CumzillaraptorsError::MalformedSecpInstruction))?
            .try_into()
            .map_err(|_| error!(CumzillaraptorsError::MalformedSecpInstruction))?;
        Ok(u16::from_le_bytes(bytes) as usize)
    };
    Ok(SecpOffsets {
        signature_offset: read_u16(1)?,
        signature_instruction_index: *data
            .get(3)
            .ok_or(error!(CumzillaraptorsError::MalformedSecpInstruction))?,
        eth_address_offset: read_u16(4)?,
        eth_address_instruction_index: *data
            .get(6)
            .ok_or(error!(CumzillaraptorsError::MalformedSecpInstruction))?,
        message_offset: read_u16(7)?,
        message_size: read_u16(9)?,
        message_instruction_index: *data
            .get(11)
            .ok_or(error!(CumzillaraptorsError::MalformedSecpInstruction))?,
    })
}

fn checked_slice<'a>(data: &'a [u8], offset: usize, size: usize) -> Result<&'a [u8]> {
    let end = offset
        .checked_add(size)
        .ok_or(error!(CumzillaraptorsError::MalformedSecpInstruction))?;
    data.get(offset..end)
        .ok_or(error!(CumzillaraptorsError::MalformedSecpInstruction))
}

/// Validates a canonical one-signature secp precompile instruction. All referenced bytes must be
/// embedded in that same precompile instruction and point at its transaction instruction index.
pub fn verify_secp_instruction_data(
    data: &[u8],
    secp_instruction_index: u8,
    expected_eth_address: &[u8; ETH_ADDRESS_LEN],
    expected_preimage: &[u8],
) -> Result<()> {
    let offsets = parse_offsets(data)?;
    require!(
        offsets.signature_instruction_index == secp_instruction_index
            && offsets.eth_address_instruction_index == secp_instruction_index
            && offsets.message_instruction_index == secp_instruction_index,
        CumzillaraptorsError::CrossInstructionSecpData
    );
    let signature = checked_slice(data, offsets.signature_offset, SECP_SIGNATURE_LEN)?;
    require!(
        signature[64] <= 3,
        CumzillaraptorsError::MalformedSecpInstruction
    );
    let eth_address = checked_slice(data, offsets.eth_address_offset, ETH_ADDRESS_LEN)?;
    require!(
        eth_address == expected_eth_address,
        CumzillaraptorsError::WrongSecpSigner
    );
    let message = checked_slice(data, offsets.message_offset, offsets.message_size)?;
    require!(
        message == expected_preimage,
        CumzillaraptorsError::WrongSecpMessage
    );
    Ok(())
}

/// Loads only the immediately preceding transaction instruction and applies strict verification.
pub fn verify_preceding_secp_instruction(
    instructions_sysvar: &AccountInfo,
    expected_eth_address: &[u8; ETH_ADDRESS_LEN],
    expected_preimage: &[u8],
) -> Result<()> {
    let current_index = load_current_index_checked(instructions_sysvar)
        .map_err(|_| error!(CumzillaraptorsError::InvalidInstructionsSysvar))?;
    require!(
        current_index > 0,
        CumzillaraptorsError::MissingSecpInstruction
    );
    let secp_instruction =
        load_instruction_at_checked(usize::from(current_index - 1), instructions_sysvar)
            .map_err(|_| error!(CumzillaraptorsError::MissingSecpInstruction))?;
    require_keys_eq!(
        secp_instruction.program_id,
        SECP256K1_PROGRAM_ID,
        CumzillaraptorsError::InvalidSecpProgram
    );
    require!(
        secp_instruction.accounts.is_empty(),
        CumzillaraptorsError::MalformedSecpInstruction
    );
    let secp_instruction_index = u8::try_from(current_index - 1)
        .map_err(|_| error!(CumzillaraptorsError::MalformedSecpInstruction))?;
    verify_secp_instruction_data(
        &secp_instruction.data,
        secp_instruction_index,
        expected_eth_address,
        expected_preimage,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const ETH: [u8; 20] = [
        0xb9, 0xb1, 0xd4, 0x25, 0x14, 0x16, 0x06, 0x6a, 0xff, 0x6c, 0x06, 0xe4, 0xab, 0x7a, 0x8e,
        0xe4, 0xd2, 0x31, 0x2e, 0x29,
    ];
    const NONCE: [u8; 32] = [
        0x79, 0xe9, 0x94, 0x1d, 0x74, 0xe1, 0xab, 0xc6, 0x14, 0xb1, 0x08, 0x7e, 0xbc, 0x9e, 0x1b,
        0xca, 0xe4, 0xdf, 0x25, 0xf1, 0xc1, 0xa1, 0x27, 0xec, 0xea, 0xe7, 0x17, 0x80, 0xb4, 0xa3,
        0x7d, 0x63,
    ];

    fn fixture_preimage() -> Vec<u8> {
        let program = parse_pubkey("AYE4iC2gp81H8jvMjk4EGxwP2sJFzuDptUwxqwTZYTMY").unwrap();
        let recipient = parse_pubkey("8gUvnRYEcUMHwkt4WwWckMFCC9KUN1m47TgzttXR7TVg").unwrap();
        eip191_preimage(
            &build_claim_message("devnet", program, recipient, 1, ETH, NONCE, 2_000_000_000)
                .unwrap(),
        )
        .unwrap()
    }

    fn encoded_instruction(preimage: &[u8]) -> Vec<u8> {
        let signature_offset = HEADER_LEN;
        let eth_offset = signature_offset + SECP_SIGNATURE_LEN;
        let message_offset = eth_offset + ETH_ADDRESS_LEN;
        let mut data = vec![0; message_offset + preimage.len()];
        data[0] = 1;
        data[1..3].copy_from_slice(&(signature_offset as u16).to_le_bytes());
        data[3] = 0;
        data[4..6].copy_from_slice(&(eth_offset as u16).to_le_bytes());
        data[6] = 0;
        data[7..9].copy_from_slice(&(message_offset as u16).to_le_bytes());
        data[9..11].copy_from_slice(&(preimage.len() as u16).to_le_bytes());
        data[11] = 0;
        data[signature_offset + 64] = 1;
        data[eth_offset..eth_offset + ETH_ADDRESS_LEN].copy_from_slice(&ETH);
        data[message_offset..].copy_from_slice(preimage);
        data
    }

    #[test]
    fn v1_message_and_eip191_hash_match_committed_vector() {
        let preimage = fixture_preimage();
        let digest = hashv(&[&preimage]).to_bytes();
        assert_eq!(
            encode_hex(&digest),
            "d63ea82c133fd09e348f17bea749d1a1d04e21fcaf9659242b55474898957dd6"
        );
        assert!(std::str::from_utf8(&preimage)
            .unwrap()
            .starts_with("\x19Ethereum Signed Message:\n"));
    }

    #[test]
    fn canonical_single_signature_layout_is_accepted() {
        let preimage = fixture_preimage();
        assert!(
            verify_secp_instruction_data(&encoded_instruction(&preimage), 0, &ETH, &preimage)
                .is_ok()
        );
    }

    #[test]
    fn parser_rejects_multi_signature_cross_instruction_bad_recovery_and_substitution() {
        let preimage = fixture_preimage();
        let valid = encoded_instruction(&preimage);
        let mut multi = valid.clone();
        multi[0] = 2;
        assert!(verify_secp_instruction_data(&multi, 0, &ETH, &preimage).is_err());
        let mut cross_instruction = valid.clone();
        cross_instruction[3] = 1;
        assert!(verify_secp_instruction_data(&cross_instruction, 0, &ETH, &preimage).is_err());
        let mut bad_recovery = valid.clone();
        bad_recovery[HEADER_LEN + 64] = 4;
        assert!(verify_secp_instruction_data(&bad_recovery, 0, &ETH, &preimage).is_err());
        let mut out_of_bounds = valid.clone();
        out_of_bounds[7..9].copy_from_slice(&u16::MAX.to_le_bytes());
        assert!(verify_secp_instruction_data(&out_of_bounds, 0, &ETH, &preimage).is_err());
        let mut transaction_index_one = valid.clone();
        transaction_index_one[3] = 1;
        transaction_index_one[6] = 1;
        transaction_index_one[11] = 1;
        assert!(verify_secp_instruction_data(&transaction_index_one, 1, &ETH, &preimage).is_ok());
        let mut wrong_signer = ETH;
        wrong_signer[0] ^= 1;
        assert!(verify_secp_instruction_data(&valid, 0, &wrong_signer, &preimage).is_err());
        let mut wrong_message = preimage.clone();
        *wrong_message.last_mut().unwrap() ^= 1;
        assert!(verify_secp_instruction_data(&valid, 0, &ETH, &wrong_message).is_err());
    }
}
