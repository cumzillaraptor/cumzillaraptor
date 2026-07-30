use crate::CumzillaraptorsError;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;

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

pub fn build_create_collection_instruction(
    collection: Pubkey,
    payer: Pubkey,
    program_id: &Pubkey,
) -> Instruction {
    mpl_core::instructions::CreateCollectionV1 {
        collection,
        update_authority: Some(derive_config_pda(program_id)),
        payer,
        system_program: anchor_lang::system_program::ID,
    }
    .instruction(mpl_core::instructions::CreateCollectionV1InstructionArgs {
        name: COLLECTION_NAME.to_owned(),
        uri: COLLECTION_METADATA_URI.to_owned(),
        plugins: Some(vec![collection_royalties()]),
    })
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
}
