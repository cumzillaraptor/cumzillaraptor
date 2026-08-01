import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cargoToml = path.join(root, 'programs', 'cumzillaraptors', 'Cargo.toml');
const coreRs = path.join(root, 'programs', 'cumzillaraptors', 'src', 'core.rs');
const programRs = path.join(root, 'programs', 'cumzillaraptors', 'src', 'lib.rs');

test('Anchor 1 Task 7 migration pins compatible Core dependencies without borsh-v1 defaults', async () => {
  const manifest = await readFile(cargoToml, 'utf8');
  assert.match(manifest, /anchor-lang\s*=\s*\{\s*version\s*=\s*"1\.1\.2"\s*\}/);
  assert.match(
    manifest,
    /^mpl-core\s*=\s*\{[^\n]*version\s*=\s*"0\.12\.1"[^\n]*default-features\s*=\s*false[^\n]*features\s*=\s*\[[^\]]*"anchor"/m,
  );
});

test('Task 7 source keeps config-PDA authority and fixed royalty policy through the migration', async () => {
  const [core, program] = await Promise.all([readFile(coreRs, 'utf8'), readFile(programRs, 'utf8')]);
  assert.match(core, /ROYALTY_BASIS_POINTS:\s*u16\s*=\s*500/);
  assert.match(core, /pub const PRIMARY_TREASURY: Pubkey = pubkey!\(/);
  assert.match(core, /address: PRIMARY_TREASURY/);
  assert.match(core, /derive_config_pda/);
  assert.match(program, /pub fn setup_collection/);
  assert.match(program, /\.update_authority\(Some\(&config\)\)/);
  assert.match(program, /\.plugins\(vec!\[plugins\]\)/);
});

test('compile-only Core wrapper validates canonical program and configured collection', async () => {
  assert.equal(existsSync(coreRs), true, 'core CPI wrapper must exist');
  const source = await readFile(coreRs, 'utf8');
  assert.match(source, /pub struct CoreCreateAccounts/);
  assert.match(source, /pub mpl_core_program:.*AccountInfo/);
  assert.match(source, /pub collection:.*AccountInfo/);
  assert.match(source, /pub asset:.*AccountInfo/);
  assert.match(source, /pub owner:.*AccountInfo/);
  assert.match(source, /pub authority:.*AccountInfo/);
  assert.match(source, /pub payer:.*AccountInfo/);
  assert.match(source, /pub fn build_create_asset_instruction/);
  assert.match(source, /require_keys_eq!\(\s*accounts\.mpl_core_program\.key\(\),\s*mpl_core::ID/s);
  assert.match(source, /require_keys_eq!\(\s*accounts\.collection\.key\(\),\s*expected_collection/s);
  assert.match(source, /mpl_core::instructions::CreateV1/);
  assert.match(source, /name: String/);
  assert.match(source, /uri: String/);
  assert.doesNotMatch(source, /invoke_signed|invoke\s*\(/, 'Task 4 must not mint or invoke Core yet');
});

test('program exposes the wrapper module and explicit Core validation errors', async () => {
  const src = path.join(root, 'programs', 'cumzillaraptors', 'src');
  const [program, errors] = await Promise.all([
    readFile(path.join(src, 'lib.rs'), 'utf8'),
    readFile(path.join(src, 'errors.rs'), 'utf8'),
  ]);
  assert.match(program, /^pub mod core;/m);
  assert.match(program, /^pub mod errors;/m);
  assert.match(errors, /InvalidCoreProgram/);
  assert.match(errors, /InvalidCollection/);
});
