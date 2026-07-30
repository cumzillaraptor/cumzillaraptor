import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const allocation = path.join(root, 'programs/cumzillaraptors/src/allocation.rs');
const state = path.join(root, 'programs/cumzillaraptors/src/state.rs');
const errors = path.join(root, 'programs/cumzillaraptors/src/errors.rs');

test('Task 6 allocation registry uses a fixed 420-bit bitmap and immutable manifest binding', async () => {
  assert.equal(existsSync(allocation), true, 'Task 6 allocation module must exist');
  const [source, stateSource, errorSource] = await Promise.all([
    readFile(allocation, 'utf8'), readFile(state, 'utf8'), readFile(errors, 'utf8'),
  ]);
  assert.match(source, /pub const ALLOCATION_BITMAP_BYTES: usize = 53/);
  assert.match(source, /pub struct AllocationRegistry/);
  assert.match(source, /pub allocated: \[u8; ALLOCATION_BITMAP_BYTES\]/);
  assert.match(source, /pub public_ids: \[u16; PUBLIC_COUNT as usize\]/);
  assert.match(source, /fn id_to_index\(id: u16\)/);
  assert.match(source, /fn is_allocated\(/);
  assert.match(source, /fn mark_allocated\(/);
  assert.match(source, /validate_partition/);
  assert.match(source, /manifest_hash/);
  assert.match(stateSource, /pub allocation_hash: \[u8; 32\]/);
  for (const name of ['DuplicateAllocationId', 'InvalidAllocationId', 'InvalidAllocationPartition', 'AllocationManifestMismatch', 'AllocationIdAlreadyUsed', 'PublicClaimPartitionViolation']) {
    assert.match(errorSource, new RegExp(name));
  }
});

test('Task 6 documents allocation only after Core success', async () => {
  const source = await readFile(allocation, 'utf8');
  assert.match(source, /after the Core CPI has returned success[\s\S]{0,240}mark_allocated_after_core_success/i);
});
