// Crosscheck: the exact batch message bytes this crate produces must match what
// the browser builds (cumzillaraptors/client/chain.js buildBatchClaimMessage).
// Verified against headless-Chromium output 2026-08-24:
//   CUMZILLARAPTORS_CLAIM_V1_BATCH
//   cluster: devnet
//   program: AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY
//   recipient: 8gUvnRYEcUMHwkt4WwWckMFCC9KUN1m47TgzttXR7TVg
//   nft_ids: 4,13,42
//   eth_address: 0xb0e683427202d14366977b7183d228a508b5a19c
//   expiry_unix: 1900000000
use cumzillaraptors::secp256k1;
use std::str::FromStr;

fn hex_decode(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}

#[test]
fn rust_batch_message_matches_browser_bytes() {
    let program = solana_program_pubkey("AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY");
    let recipient = solana_program_pubkey("8gUvnRYEcUMHwkt4WwWckMFCC9KUN1m47TgzttXR7TVg");
    let mut eth = [0u8; 20];
    eth.copy_from_slice(&hex_decode("b0e683427202d14366977b7183d228a508b5a19c"));

    // Unsorted input must be rejected by the canonical builder.
    assert!(secp256k1::build_batch_claim_message(
        "devnet", program, recipient, &[42, 4, 13], eth, 1_900_000_000
    )
    .is_err());
    // Duplicate input must be rejected.
    assert!(secp256k1::build_batch_claim_message(
        "devnet", program, recipient, &[4, 4, 13], eth, 1_900_000_000
    )
    .is_err());

    let msg = secp256k1::build_batch_claim_message(
        "devnet",
        program,
        recipient,
        &[4, 13, 42],
        eth,
        1_900_000_000,
    )
    .unwrap();
    let expected = "CUMZILLARAPTORS_CLAIM_V1_BATCH\n\
cluster: devnet\n\
program: AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY\n\
recipient: 8gUvnRYEcUMHwkt4WwWckMFCC9KUN1m47TgzttXR7TVg\n\
nft_ids: 4,13,42\n\
eth_address: 0xb0e683427202d14366977b7183d228a508b5a19c\n\
expiry_unix: 1900000000";
    assert_eq!(msg, expected, "batch message must stay byte-identical to the browser builder");
}

// The program crate re-exports anchor_lang's Pubkey; use it via the crate's own
// state module so no extra dependency is needed in dev-deps.
fn solana_program_pubkey(s: &str) -> anchor_lang::prelude::Pubkey {
    anchor_lang::prelude::Pubkey::from_str(s).unwrap()
}
