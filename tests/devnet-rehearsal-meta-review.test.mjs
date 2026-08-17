import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const script = path.join(root, 'scripts', 'review-devnet-rehearsal-metas.mjs');
const { args, review } = await import(pathToFileURL(script).href);
const inputs = [
  '--review',
  '--collection-public-key', '8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d',
  '--deployment-buffer-public-key', 'Hkz8bXQ6Xj1unYvi1YbkVcsQZopLi2n4j2uQxKdUuM21',
  '--payer-public-key', 'C7EpDNWshjtRf1tERwotFP2iAEbApBhQKJz4usYUPU9N',
  '--upgrade-authority-public-key', '71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r',
  '--buyer-public-key', '8gUvnRYEcUMHwkt4WwWckMFCC9KUN1m47TgzttXR7TVg',
  '--claimer-public-key', 'C6aSKqf8kFvCJ4SFAXyT3MdJ25A4wE5hJdeEykgXP5dn',
  '--claim-expiry-unix', '2000000000',
  '--max-network-fee-lamports', '10000000',
  '--max-priority-fee-lamports', '0',
];

test('static review emits exact deterministic rehearsal account metas and an unquoted fee policy', () => {
  const output = review(args(inputs));
  assert.equal(output.mode, 'STATIC PRE-SEND DEVNET REHEARSAL REVIEW');
  assert.equal(output.guarantee, 'No transaction will be constructed, serialized, signed, or sent.');
  assert.equal(output.artifact.revision, 'cc8e6242e884e0f90a8ce0b9ff58f406240fc4a6');
  assert.equal(output.artifact.sha256, '0691c0eba729f07ab2be110112d0954d4051f198e5ef4d9e85f501fcd0126bf5');
  assert.equal(output.feePolicy.maxNetworkFeeLamports, 10000000);
  assert.equal(output.feePolicy.maxPriorityFeeLamports, 0);
  assert.equal(output.feePolicy.estimatedNetworkFeeLamports, 'NOT_QUOTED_NO_RPC');
  assert.equal(output.deployment.transactionCount, 460);
  assert.equal(output.deployment.writeTransactionCount, 458);
  assert.equal(output.instructions.find(({ id }) => id === 'initialize-launch').accounts.length, 3);
  assert.deepEqual(output.instructions.find(({ id }) => id === 'controlled-public-mint').accounts.map(({ role }) => role), [
    'config', 'registry', 'buyer', 'treasury', 'collection', 'asset', 'mpl-core', 'system-program',
  ]);
  const claim = output.instructions.find(({ id }) => id === 'controlled-eth-claim');
  assert.equal(claim.precedingInstruction.program, 'KeccakSecp256k11111111111111111111111111111');
  assert.equal(claim.precedingInstruction.accounts.length, 0);
  assert.equal(claim.authorization.status, 'PENDING_EXTERNAL_ETH_SIGNATURE');
  assert.match(output.blockers.join('\n'), /fresh collection and buffer public keys are user attestations/i);
});

test('static review is fail-closed on missing public inputs, bad cap, or a nonzero priority fee', () => {
  assert.throws(() => args([]), /pass --review/);
  assert.throws(() => args(inputs.map((item) => item === '10000000' ? 'not-a-number' : item)), /safe nonnegative integer/);
  assert.throws(() => args(inputs.map((item) => item === '0' ? '1' : item)), /Priority fee cap must be 0/);
});

test('static review source has no key parsing, RPC, transaction, signing, serialization, or send capability', async () => {
  const source = await readFile(script, 'utf8');
  assert.doesNotMatch(source, /Keypair\.fromSecretKey|fromSecretKey|readFileSync\([^)]*(?:keypair|secret)|new Connection|fetch\(|new \w*Transaction|TransactionInstruction|\.serialize\(|sendTransaction|sendRawTransaction|signTransaction|\.sign\(|BpfLoader|programDeploy|child_process/);
});
