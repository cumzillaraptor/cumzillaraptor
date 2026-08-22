import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const script = path.join(root, 'scripts', 'plan-devnet-rehearsal.mjs');
const collection = '8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d';
const buyer = '8gUvnRYEcUMHwkt4WwWckMFCC9KUN1m47TgzttXR7TVg';
const claimer = 'C7EpDNWshjtRf1tERwotFP2iAEbApBhQKJz4usYUPU9N';

function run(args = []) {
  return spawnSync('node', [script, ...args], { cwd: root, encoding: 'utf8' });
}

test('rehearsal planner emits a canonical no-send plan bound to reviewed artifact and fixtures', () => {
  const result = run([
    '--plan', '--collection-public-key', collection,
    '--buyer-public-key', buyer, '--claimer-public-key', claimer,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.mode, 'REVIEW-ONLY DEVNET REHEARSAL PLAN');
  assert.equal(plan.guarantee, 'No transaction will be constructed, signed, or sent.');
  assert.deepEqual(plan.artifact, {
    programId: 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY',
    revision: '8b5bcf1d9278b61780be33dc2e4a9707859155da',
    sha256: '7af3f53c050aa613fd0a68ca461d93b51620e941775188f258ba33eb5305b44b',
    bytes: 411944,
  });
  assert.equal(plan.identities.collection, collection);
  assert.equal(plan.identities.buyer, buyer);
  assert.equal(plan.identities.claimer, claimer);
  assert.equal(plan.allocation.publicCount, 246);
  assert.equal(plan.allocation.claimCount, 174);
  assert.equal(plan.allocation.allocationHash, '0x78f593cb7ff7ddae906c7c35a38c75be2e19c580e02c8ea6ed6357210265785c');
  assert.equal(plan.allocation.publicMint.nftId, 2);
  assert.equal(plan.allocation.claim.nftId, 4);
  assert.equal(plan.allocation.claim.ethAddress, '0xb0e683427202d14366977b7183d228a508b5a19c');
  assert.equal(plan.allocation.claim.authorization, 'PENDING_EXTERNAL_ETH_SIGNATURE');
  assert.equal(plan.collection.uriFromProgram, 'ar://oGxXHkoQKnsq47U4KESzurJ0-qk0dJa2FWofHQc_-SQ');
  assert.equal(plan.collection.uriFromUriMap, 'ar://oGxXHkoQKnsq47U4KESzurJ0-qk0dJa2FWofHQc_-SQ');
  assert.deepEqual(plan.blockingFindings, []);
  assert.equal(plan.collection.royaltyBasisPoints, 500);
  assert.deepEqual(plan.steps.map(({ id }) => id), [
    'deploy-program', 'initialize-launch', 'initialize-allocation-registry',
    'setup-collection', 'verify-collection', 'enable-sale', 'controlled-public-mint',
    'controlled-eth-claim', 'verify-rehearsal-state',
  ]);
});

test('planner is fail-closed on missing or invalid public inputs', () => {
  assert.notEqual(run().status, 0);
  assert.notEqual(run(['--plan', '--collection-public-key', collection, '--buyer-public-key', buyer, '--claimer-public-key', 'not-a-key']).status, 0);
});

test('planner has no private-key, RPC, transaction, signing, or send capability', async () => {
  const source = await readFile(script, 'utf8');
  assert.doesNotMatch(source, /Keypair\.fromSecretKey|fromSecretKey|(?:keypair|secret)[^\n]*\.json|new Connection|fetch\(|new \w*Transaction|TransactionInstruction|sendTransaction|sendRawTransaction|signTransaction|\.sign\(|BpfLoader|programDeploy|child_process/);
});
