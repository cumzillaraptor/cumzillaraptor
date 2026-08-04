import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const programPath = path.join(root, 'programs', 'cumzillaraptors', 'src', 'lib.rs');
const corePath = path.join(root, 'programs', 'cumzillaraptors', 'src', 'core.rs');

async function sources() {
  return {
    lib: await readFile(programPath, 'utf8'),
    core: await readFile(corePath, 'utf8'),
  };
}

test('claim_nft composes all completed authorization boundaries before Core CPI', async () => {
  const { lib } = await sources();
  assert.match(lib, /pub fn claim_nft\(/);
  for (const required of [
    'ClaimsNotLive',
    'ClaimAuthorizationExpired',
    'claims::verify_claim_eligibility(',
    'metadata::verify_metadata_proof(',
    'secp256k1::verify_preceding_secp_instruction(',
    'ctx.accounts.claimer.key()',
  ]) assert.match(lib, new RegExp(required.replace(/[()]/g, '\\$&')));

  const cpi = lib.indexOf('builder.invoke_signed(signer_seeds)?;');
  const allocation = lib.indexOf('mark_allocated_after_core_success(nft_id)?;', cpi);
  const counter = lib.indexOf('.claims_minted', cpi);
  assert.ok(cpi >= 0 && allocation > cpi && counter > cpi, 'all durable claim state changes must follow Core CPI');
});

test('claim_nft binds deterministic asset and receipt PDAs to verified claim data', async () => {
  const { lib } = await sources();
  assert.match(lib, /seeds = \[b"asset", &nft_id\.to_be_bytes\(\)\]/);
  assert.match(lib, /let \(expected_receipt, receipt_bump\) =\s*Pubkey::find_program_address\(&\[b"claim", &claim_leaf\], ctx\.program_id\)/);
  assert.match(lib, /ctx\.accounts\.receipt\.key\(\),\s*expected_receipt/);
  assert.doesNotMatch(lib, /expected_claim_leaf/);
  assert.match(lib, /data_is_empty\(\) && ctx\.accounts\.receipt\.lamports\(\) == 0/);
  assert.doesNotMatch(lib, /space = 8 \+ ClaimReceipt::LEN,[\s\S]*seeds = \[b"claim"/);
  assert.match(lib, /let create_receipt = anchor_lang::solana_program::system_instruction::create_account/);
  assert.match(lib, /ctx\.accounts\.asset\.data_is_empty\(\)/);
  assert.match(lib, /let recover_dust = anchor_lang::solana_program::system_instruction::transfer/);
  assert.match(lib, /builder\.invoke_signed\(signer_seeds\)\?;[\s\S]*create_receipt/);
  assert.match(lib, /pub claimer: Signer<'info>/);
  assert.match(lib, /\.payer\(&claimer\)[\s\S]*\.owner\(Some\(&claimer\)\)/);
});

test('claim_nft retains fail-closed fixed account checks and guarded live-state kill switch', async () => {
  const { lib } = await sources();
  assert.match(lib, /address = config\.collection @ CumzillaraptorsError::InvalidCollection/);
  assert.match(lib, /address = mpl_core::ID @ CumzillaraptorsError::InvalidCoreProgram/);
  assert.match(lib, /sysvar::instructions::ID @ CumzillaraptorsError::InvalidInstructionsSysvar/);
  assert.match(lib, /pub fn set_claims_sale_state/);
  assert.match(lib, /\(SaleState::Live, SaleState::Paused\)/);
  assert.match(lib, /\(SaleState::Paused, SaleState::Live\)/);
  assert.doesNotMatch(lib, /pub fn (?:update|set)_(?:claim_root|metadata_root|allocation_hash|collection)/);
});

test('claim_nft Core CPI pins config authority as asset update authority', async () => {
  const { lib } = await sources();
  assert.match(lib, /\.authority\(Some\(&config\)\)/);
  assert.match(lib, /\.update_authority\(Some\(&config\)\)/);
  assert.match(lib, /\.owner\(Some\(&claimer\)\)/);
});

test('claim implementation does not add a client send or deploy path', async () => {
  const { lib } = await sources();
  assert.doesNotMatch(lib, /sendTransaction|program deploy|solana program|airdrop|requestAirdrop/);
});
