import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const rootHex = '5874f7c11db9717c89ab56de12fdb309be4043e31fc69486b735382935087caa';

test('all immutable launch and validator bindings use the reviewed receipt-derived metadata root', async () => {
  const [artifact, rust, init, collection, local] = await Promise.all([
    readFile(path.join(root, 'nft-data/metadata-merkle-v1.devnet.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'programs/cumzillaraptors/src/metadata.rs'), 'utf8'),
    readFile(path.join(root, 'tests/bankrun-initialize.test.mjs'), 'utf8'),
    readFile(path.join(root, 'tests/bankrun-collection.test.mjs'), 'utf8'),
    readFile(path.join(root, 'tests/local-ephemeral-claim-root.test.mjs'), 'utf8'),
  ]);
  assert.equal(artifact.merkleRoot, `0x${rootHex}`);
  assert.match(rust, /pub const APPROVED_METADATA_ROOT: \[u8; 32\] = \[\s*0x58, 0x74, 0xf7, 0xc1/s);
  assert.match(rust, /const ROOT: \[u8; 32\] = \[\s*0x58, 0x74, 0xf7, 0xc1/s);
  assert.match(rust, /const URI_360: &str = "ar:\/\/z-1hTTF1-FK80VkPw6yiO_d1y2_qdZ4Cjm37y-eW-cI"/);
  assert.match(rust, /0x21, 0x96, 0x81, 0xb8, 0xdf, 0xb7, 0x28, 0xc8/s);
  for (const source of [init, collection, local]) assert.match(source, new RegExp(rootHex));
});
