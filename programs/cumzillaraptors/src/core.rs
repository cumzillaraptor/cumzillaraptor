use crate::CumzillaraptorsError;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;

/// Exact account shape required by MPL Core `CreateV1`.
///
/// This Task 4 wrapper only constructs and validates the instruction. It deliberately does not
/// invoke it; atomic minting and signer-seed policy are introduced in the later mint/claim tasks.
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
    fn mpl_core_program_id_is_non_default() {
        assert_ne!(mpl_core::ID, Pubkey::default());
    }
}
