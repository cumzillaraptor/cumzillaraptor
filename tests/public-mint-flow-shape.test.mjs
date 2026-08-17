import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const lib = path.join(root, 'programs', 'cumzillaraptors', 'src', 'lib.rs');
const errors = path.join(root, 'programs', 'cumzillaraptors', 'src', 'errors.rs');
const x86Gate = path.join(root, 'tests', 'local-ephemeral-claim-root.test.mjs');

test('public mint is live-gated, fixed-price, public-partition-only, and atomic after Core success', async () => {
  const [source, errorSource] = await Promise.all([readFile(lib, 'utf8'), readFile(errors, 'utf8')]);
  assert.match(source, /pub const PUBLIC_MINT_PRICE_LAMPORTS: u64 = 1_000_000_000/);
  assert.match(source, /pub fn mint_nft\(/);
  assert.match(source, /config\.sale_state == SaleState::Live/);
  assert.match(source, /ctx\.accounts\.registry\.assert_public_id\(nft_id\)\?/);
  assert.match(source, /!ctx\.accounts\.registry\.is_allocated\(nft_id\)\?/);
  assert.match(source, /ctx\.accounts\.config\.public_minted < PUBLIC_COUNT/);
  assert.match(source, /validate_treasury\(treasury\)\?/);
  assert.match(source, /core::PRIMARY_TREASURY/);
  assert.match(source, /ctx\.accounts\.treasury\.key\(\),\s*ctx\.accounts\.config\.treasury/);
  assert.match(source, /buyer\.key\(\),\s*ctx\.accounts\.treasury\.key\(\),\s*CumzillaraptorsError::PublicMintBuyerTreasuryAlias/);
  assert.match(source, /asset\.key\(\),\s*ctx\.accounts\.treasury\.key\(\),\s*CumzillaraptorsError::PublicMintAssetTreasuryAlias/);
  assert.match(source, /system_instruction::transfer\([\s\S]*PUBLIC_MINT_PRICE_LAMPORTS/);
  assert.match(source, /builder\.invoke_signed\(signer_seeds\)\?;[\s\S]*mark_allocated_after_core_success\(nft_id\)\?;[\s\S]*public_minted/);
  assert.match(source, /pub struct MintNft[\s\S]*address = config\.collection @ CumzillaraptorsError::InvalidCollection/);
  assert.match(source, /pub struct MintNft[\s\S]*seeds = \[b"asset", &nft_id\.to_be_bytes\(\)\]/);
  assert.match(source, /pub struct MintNft[\s\S]*pub treasury: UncheckedAccount/);
  assert.match(errorSource, /PublicMintsNotLive/);
  assert.match(errorSource, /PublicMintCountExceeded/);
  assert.match(errorSource, /InvalidMintTreasury/);
});

test('x86 private validator gate exercises paid mint and treasury-substitution rollback', async () => {
  const source = await readFile(x86Gate, 'utf8');
  assert.match(source, /mintData\(nftId, metadata\)/);
  assert.match(source, /mintIx = \(\{ treasuryAccount = treasury/);
  assert.match(source, /mintIx\(\{ treasuryAccount: authority\.publicKey \}\)/);
  assert.match(source, /mintAfter\.treasury - mintBefore\.treasury, 1_000_000_000/);
  assert.match(source, /mintAfter\.publicMinted, 1/);
  assert.match(source, /mintAfter\.allocated, 1/);
  assert.match(source, /paid public mint creates a Core asset/);
});

test('public mint has no caller-controlled price, treasury, authority, or allocation source', async () => {
  const source = await readFile(lib, 'utf8');
  const start = source.indexOf('pub fn mint_nft(');
  assert.notEqual(start, -1);
  const handler = source.slice(start, source.indexOf('\n    }', start) + 6);
  const signature = handler.slice(0, handler.indexOf(') -> Result<()>'));
  assert.doesNotMatch(signature, /price|treasury|authority|public_ids/i);
  assert.match(handler, /metadata::verify_metadata_proof/);
  assert.match(handler, /mpl_core::instructions::CreateV1CpiBuilder/);
});
