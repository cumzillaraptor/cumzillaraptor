import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { CORE_PROGRAM_ID, fetchAndVerifyCoreCollection, normalizeFetchedCoreCollection, verifyCoreCollection } from '../scripts/verify-core-collection.mjs';

const root = path.resolve(import.meta.dirname, '..');
const treasury = 'FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6';
const collectionUri = 'ar://oGxXHkoQKnsq47U4KESzurJ0-qk0dJa2FWofHQc_-SQ';
const authority = '7LbuHZ2GJURn3wBfqFNgxQgDgjRv8x1nAhWntfdwiMQ';
const goodCollection = () => ({ owner: CORE_PROGRAM_ID, updateAuthority: authority, name: 'cumzillaraptors', uri: collectionUri, royalties: { basisPoints: 500, creators: [{ address: treasury, percentage: 100 }] } });
const goodFetched = () => ({ key: 5, header: { owner: CORE_PROGRAM_ID }, updateAuthority: authority, name: 'cumzillaraptors', uri: collectionUri, royalties: { basisPoints: 500, creators: [{ address: treasury, percentage: 100 }] } });

test('Task 7 canonical Core policy matches Rust and permanent metadata', async () => {
  const source = await readFile(path.join(root, 'programs', 'cumzillaraptors', 'src', 'core.rs'), 'utf8');
  assert.equal(CORE_PROGRAM_ID, 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
  assert.match(source, /COLLECTION_NAME.*cumzillaraptors/s); assert.match(source, new RegExp(collectionUri)); assert.match(source, new RegExp(treasury));
  assert.match(source, /derive_config_pda/); assert.match(source, /mpl_core::ID/); assert.match(source, /ROYALTY_BASIS_POINTS:\s*u16\s*=\s*500/); assert.match(source, /Plugin::Royalties/);
});

test('runtime verifier accepts only canonical normalized Core state', () => {
  assert.equal(verifyCoreCollection(goodCollection(), authority), true);
  assert.deepEqual(normalizeFetchedCoreCollection(goodFetched()), goodCollection());
});

test('runtime verifier rejects wrong owner, authority, royalty state, and malformed fetched header', () => {
  const cases = [
    [{ ...goodCollection(), owner: '11111111111111111111111111111111' }, /canonical mpl-core/],
    [{ ...goodCollection(), updateAuthority: treasury }, /update authority/],
    [{ ...goodCollection(), royalties: undefined }, /royalties/],
    [{ ...goodCollection(), royalties: { ...goodCollection().royalties, basisPoints: 499 } }, /500 basis points/],
    [{ ...goodCollection(), royalties: { basisPoints: 500, creators: [{ address: authority, percentage: 100 }] } }, /recipient mismatch/],
  ];
  for (const [state, message] of cases) assert.throws(() => verifyCoreCollection(state, authority), message);
  assert.throws(() => normalizeFetchedCoreCollection({ ...goodFetched(), header: { owner: '11111111111111111111111111111111' } }) && verifyCoreCollection(normalizeFetchedCoreCollection({ ...goodFetched(), header: { owner: '11111111111111111111111111111111' } }), authority), /canonical mpl-core/);
  assert.throws(() => normalizeFetchedCoreCollection({ ...goodFetched(), header: {} }), /missing its RPC account owner/);
  assert.throws(() => normalizeFetchedCoreCollection({ ...goodFetched(), key: 1 }), /not CollectionV1/);
});

test('RPC fetch path uses injected fetcher and validates the actual fetched account without network access', async () => {
  const fakeUmi = { use() { return this; } };
  const fetched = await fetchAndVerifyCoreCollection({
    rpc: 'http://mock.invalid', collection: authority, expectedAuthority: authority,
    umiFactory: () => fakeUmi, fetchCollectionFn: async (umi) => { assert.equal(umi, fakeUmi); return goodFetched(); },
  });
  assert.deepEqual(fetched, goodCollection());
});

test('Task 7 dry run is no-send and live mode fails before reading a keypair environment variable', () => {
  const dry = spawnSync('node', ['scripts/create-devnet-collection.mjs', '--dry-run'], { cwd: root, encoding: 'utf8' });
  assert.equal(dry.status, 0, dry.stderr); assert.match(dry.stdout, /No transaction will be signed or sent/); assert.match(dry.stdout, new RegExp(CORE_PROGRAM_ID));
  const live = spawnSync('node', ['scripts/create-devnet-collection.mjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, CUMZ_DEVNET_LAUNCH_AUTHORITY_KEYPAIR_JSON: 'not-a-keypair' } });
  assert.notEqual(live.status, 0); assert.match(live.stderr, /Refusing live creation/); assert.doesNotMatch(live.stderr, /not-a-keypair/);
});

test('Task 7 uses Umi fetchCollection and rejects placeholder/non-ar URI configuration', async () => {
  const [create, verify] = await Promise.all([readFile(path.join(root, 'scripts', 'create-devnet-collection.mjs'), 'utf8'), readFile(path.join(root, 'scripts', 'verify-core-collection.mjs'), 'utf8')]);
  assert.match(create, /PLACEHOLDER/); assert.match(create, /\[A-Za-z0-9_-\]\{43\}/); assert.match(create, /process\.exitCode = 1/);
  assert.match(verify, /fetchCollection/); assert.match(verify, /createUmi/); assert.match(verify, /fetched\.header\.owner/);
});
