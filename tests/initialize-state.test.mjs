import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const stateRs = path.join(root, 'programs/cumzillaraptors/src/state.rs');
const errorsRs = path.join(root, 'programs/cumzillaraptors/src/errors.rs');
const launchConfig = path.join(root, 'config/devnet-launch.json');
const libRs = path.join(root, 'programs/cumzillaraptors/src/lib.rs');

test('immutable launch state and user-approved devnet authority configuration exist', async () => {
  assert.equal(existsSync(launchConfig), true);
  assert.equal(existsSync(stateRs), true);
  assert.equal(existsSync(errorsRs), true);
  const [state, errors, lib, launch] = await Promise.all([
    readFile(stateRs, 'utf8'), readFile(errorsRs, 'utf8'), readFile(libRs, 'utf8'), readFile(launchConfig, 'utf8'),
  ]);
  const config = JSON.parse(launch);
  assert.equal(config.cluster, 'devnet');
  assert.equal(config.launchAuthority, '71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r');
  for (const field of ['launch_authority', 'treasury', 'core_program', 'collection', 'allocation_hash', 'claim_root', 'metadata_hash', 'cluster_tag_hash', 'sale_state', 'public_minted', 'claims_minted', 'bump']) {
    assert.match(state, new RegExp(`pub ${field}:`));
  }
  assert.match(state, /pub const PUBLIC_COUNT: u16 = 246/);
  assert.match(state, /pub const CLAIM_COUNT: u16 = 174/);
  assert.match(errors, /UnauthorizedLaunchAuthority/);
  assert.match(errors, /AlreadyInitialized/);
  assert.match(errors, /InvalidLaunchCoreProgram/);
  assert.match(errors, /InvalidLaunchCollection/);
  assert.match(lib, /validate_launch_parameters\(\s*ctx\.accounts\.launch_authority\.key\(\)/s);
  assert.match(lib, /require_keys_eq!\(\s*authority,\s*launch_authority\(\)/s);
  assert.match(lib, /public_count == PUBLIC_COUNT/);
  assert.match(lib, /claim_count == CLAIM_COUNT/);
});

test('Task 5 has no generic mutable launch-config update instruction', async () => {
  const source = await readFile(libRs, 'utf8');
  assert.doesNotMatch(source, /pub fn (?:update|set)_(?:config|treasury|collection|core_program|claim_root|allocation_hash|metadata_hash|cluster_tag_hash)/);
});
