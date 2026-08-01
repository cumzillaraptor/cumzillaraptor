use crate::CumzillaraptorsError;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::system_program;

pub const COLLECTION_NAME: &str = "cumzillaraptors";
pub const COLLECTION_METADATA_URI: &str = "ar://oGxXHkoQKnsq47U4KESzurJ0-qk0dJa2FWofHQc_-SQ";
pub const PRIMARY_TREASURY: Pubkey = pubkey!("FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6");
pub const ROYALTY_BASIS_POINTS: u16 = 500;

pub fn derive_config_pda(program_id: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"config"], program_id).0
}

pub fn collection_royalties() -> mpl_core::types::PluginAuthorityPair {
    mpl_core::types::PluginAuthorityPair {
        plugin: mpl_core::types::Plugin::Royalties(mpl_core::types::Royalties {
            basis_points: ROYALTY_BASIS_POINTS,
            creators: vec![mpl_core::types::Creator {
                address: PRIMARY_TREASURY,
                percentage: 100,
            }],
            rule_set: mpl_core::types::RuleSet::None,
        }),
        authority: Some(mpl_core::types::PluginAuthority::UpdateAuthority),
    }
}

/// Canonical collection name, metadata URI, and royalty plugin pair. Shared by the off-chain
/// dry-run planner and the on-chain `setup_collection` CPI so the created collection always
/// matches the verified verifier policy (500bp -> PRIMARY_TREASURY).
pub fn collection_params() -> (String, String, mpl_core::types::PluginAuthorityPair) {
    (
        COLLECTION_NAME.to_owned(),
        COLLECTION_METADATA_URI.to_owned(),
        collection_royalties(),
    )
}

/// Builds the exact `CreateCollectionV1` instruction that `setup_collection` issues via CPI.
/// `update_authority` is bound to the config PDA — no instruction argument can redirect it.
pub fn build_collection_cpi_instruction(
    collection: Pubkey,
    config_pda: Pubkey,
    payer: Pubkey,
) -> Instruction {
    let (name, uri, plugins) = collection_params();
    mpl_core::instructions::CreateCollectionV1 {
        collection,
        update_authority: Some(config_pda),
        payer,
        system_program: system_program::ID,
    }
    .instruction(mpl_core::instructions::CreateCollectionV1InstructionArgs {
        name,
        uri,
        plugins: Some(vec![plugins]),
    })
}

pub fn build_create_collection_instruction(
    collection: Pubkey,
    payer: Pubkey,
    program_id: &Pubkey,
) -> Instruction {
    build_collection_cpi_instruction(collection, derive_config_pda(program_id), payer)
}

pub struct CoreCreateAccounts<'info> {
    pub mpl_core_program: AccountInfo<'info>,
    pub collection: AccountInfo<'info>,
    pub asset: AccountInfo<'info>,
    pub owner: AccountInfo<'info>,
    pub authority: AccountInfo<'info>,
    pub payer: AccountInfo<'info>,
    pub system_program: AccountInfo<'info>,
}

pub fn build_create_asset_instruction(
    accounts: &CoreCreateAccounts<'_>,
    expected_collection: Pubkey,
    name: String,
    uri: String,
) -> Result<Instruction> {
    require_keys_eq!(
        accounts.mpl_core_program.key(),
        mpl_core::ID,
        CumzillaraptorsError::InvalidCoreProgram
    );
    require_keys_eq!(
        accounts.collection.key(),
        expected_collection,
        CumzillaraptorsError::InvalidCollection
    );
    require!(!name.is_empty(), CumzillaraptorsError::InvalidCoreAssetName);
    require!(!uri.is_empty(), CumzillaraptorsError::InvalidCoreAssetUri);

    Ok(mpl_core::instructions::CreateV1 {
        asset: accounts.asset.key(),
        collection: Some(accounts.collection.key()),
        authority: Some(accounts.authority.key()),
        payer: accounts.payer.key(),
        owner: Some(accounts.owner.key()),
        update_authority: None,
        system_program: accounts.system_program.key(),
        log_wrapper: None,
    }
    .instruction(mpl_core::instructions::CreateV1InstructionArgs {
        data_state: mpl_core::types::DataState::AccountState,
        name,
        uri,
        plugins: None,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_collection_has_program_authority_and_royalties() {
        assert_ne!(mpl_core::ID, Pubkey::default());
        assert_ne!(derive_config_pda(&crate::ID), Pubkey::default());
        let royalties = collection_royalties();
        match royalties.plugin {
            mpl_core::types::Plugin::Royalties(value) => {
                assert_eq!(value.basis_points, ROYALTY_BASIS_POINTS);
                assert_eq!(value.creators[0].address, PRIMARY_TREASURY);
                assert_eq!(value.creators[0].percentage, 100);
            }
            _ => panic!("expected royalties plugin"),
        }
    }

    #[test]
    fn collection_cpi_binds_config_pda_as_update_authority_and_canonical_fields() {
        let collection = Pubkey::new_unique();
        let config_pda = derive_config_pda(&crate::ID);
        let payer = Pubkey::new_unique();
        let ix = build_collection_cpi_instruction(collection, config_pda, payer);

        assert_eq!(ix.program_id, mpl_core::ID, "must target canonical mpl-core");
        assert_eq!(ix.accounts.len(), 4, "CreateCollectionV1 has exactly 4 accounts");

        // account 0: the new collection — writable + signer
        assert!(ix.accounts[0].is_writable && ix.accounts[0].is_signer);
        assert_eq!(ix.accounts[0].pubkey, collection, "account 0 is the new collection");

        // account 1: update authority bound to config PDA — read-only, never a signer
        assert!(!ix.accounts[1].is_writable && !ix.accounts[1].is_signer);
        assert_eq!(
            ix.accounts[1].pubkey, config_pda,
            "account 1 must be the config PDA update authority"
        );

        // account 2: fee payer — writable + signer
        assert!(ix.accounts[2].is_writable && ix.accounts[2].is_signer);
        assert_eq!(ix.accounts[2].pubkey, payer, "account 2 is the fee payer");

        // account 3: system program
        assert_eq!(ix.accounts[3].pubkey, system_program::ID, "account 3 is the system program");

        // royalty policy must be canonical (500bp -> PRIMARY_TREASURY)
        match collection_royalties().plugin {
            mpl_core::types::Plugin::Royalties(value) => {
                assert_eq!(value.basis_points, ROYALTY_BASIS_POINTS);
                assert_eq!(value.creators[0].address, PRIMARY_TREASURY);
            }
            _ => panic!("expected royalties plugin"),
        }
    }
}
