import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cargoToml = path.join(root, 'programs', 'cumzillaraptors', 'Cargo.toml');
const coreRs = path.join(root, 'programs', 'cumzillaraptors', 'src', 'core.rs');

test('Task 4 pins an Anchor-compatible mpl-core dependency', async () => {
  const manifest = await readFile(cargoToml, 'utf8');
  assert.match(manifest, /^mpl-core\s*=\s*\{[^\n]*version\s*=\s*"=0\.7\.2"[^\n]*features\s*=\s*\[[^\]]*"anchor"/m);
  assert.match(manifest, /anchor-lang\s*=\s*\{\s*version\s*=\s*"=0\.30\.1"/);
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
  const source = await readFile(path.join(root, 'programs', 'cumzillaraptors', 'src', 'lib.rs'), 'utf8');
  assert.match(source, /^pub mod core;/m);
  assert.match(source, /InvalidCoreProgram/);
  assert.match(source, /InvalidCollection/);
});
