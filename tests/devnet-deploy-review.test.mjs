import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const script = path.join(root, 'scripts', 'review-devnet-deployment.mjs');
const liveArtifactDir = '/tmp/cumz-main-artifact-939c7f8/programs/cumzillaraptors/target/deploy';
const liveProgramKeypair = '/home/raspberrypi/.config/solana/cumzillaraptors-devnet-program.json';
const livePayerKeypair = '/home/raspberrypi/.config/solana/cumzillaraptors-devnet-payer.json';
const liveUpgradeAuthorityKeypair = '/home/raspberrypi/.config/solana/launch-authority/launch-authority-devnet.json';
const { EXPECTED, safeRpcLabel, safeErrorMessage } = await import(pathToFileURL(script).href);

function liveArgs(extra = []) {
  return [
    script,
    '--review-only',
    '--artifact-dir', liveArtifactDir,
    '--program-keypair', liveProgramKeypair,
    '--payer-keypair', livePayerKeypair,
    '--upgrade-authority-keypair', liveUpgradeAuthorityKeypair,
    ...extra,
  ];
}

test('deployment review refuses to run without the explicit review-only switch', () => {
  const result = spawnSync('node', [script], { cwd: root, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing: pass --review-only/);
});

test('deployment review pins the approved x86 CI SBPF artifact identity', () => {
  assert.equal(EXPECTED.revision, '939c7f89e10c0329e8d4a4be1340e9f95f1532f5');
  assert.equal(EXPECTED.artifactSha256, 'e5cdbe1ec45093516e1dd7224985c34303c9c632d2db80d37ac1c83ed05998d0');
  assert.equal(EXPECTED.artifactBytes, 397040);
});

test('deployment review has no signing or send path', async () => {
  const source = await readFile(script, 'utf8');
  assert.match(source, /No transaction will be signed or sent/);
  assert.match(source, /incomplete and cannot be submitted/);
  assert.doesNotMatch(source, /sendTransaction|sendRawTransaction|sendAndConfirm|\.sign\(|signTransaction|requestAirdrop/);
});

test('RPC display and connection errors redact userinfo, path, query, and fragments', () => {
  const rpc = 'https://user:TOP_SECRET_MUST_NOT_APPEAR@rpc.example.test/v2/TOP_SECRET_MUST_NOT_APPEAR?api-key=TOP_SECRET_MUST_NOT_APPEAR#TOP_SECRET_MUST_NOT_APPEAR';
  const label = safeRpcLabel(rpc);
  assert.equal(label, 'https://rpc.example.test');
  assert.doesNotMatch(label, /TOP_SECRET_MUST_NOT_APPEAR|user/);
  const error = new Error(`Request cannot be constructed from ${rpc}`);
  assert.equal(safeErrorMessage(error, rpc), 'RPC request failed; check the configured endpoint locally.');
});



test('live Devnet deployment review emits unsigned transaction details and does not persist serialized transactions', { skip: process.env.CUMZ_DEVNET_LIVE_REVIEW !== '1' }, () => {
  const result = spawnSync('node', liveArgs(['--rpc', 'https://api.devnet.solana.com/?api-key=TOP_SECRET_MUST_NOT_APPEAR']), { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);

  assert.equal(report.mode, 'UNSIGNED DEPLOYMENT REVIEW ONLY');
  assert.match(report.guarantee, /No transaction will be signed or sent/);
  assert.equal(report.rpc, 'https://api.devnet.solana.com');
  assert.doesNotMatch(result.stdout, /TOP_SECRET_MUST_NOT_APPEAR/);
  assert.equal(report.artifact.revision, '939c7f89e10c0329e8d4a4be1340e9f95f1532f5');
  assert.equal(report.artifact.sha256, 'e5cdbe1ec45093516e1dd7224985c34303c9c632d2db80d37ac1c83ed05998d0');
  assert.equal(report.artifact.bytes, 397040);
  assert.equal(report.identities.programId, 'AYE4iC2gp81H8jvMjk4EGxwP2sJFzuDptUwxqwTZYTMY');
  assert.equal(report.identities.payer, 'C7EpDNWshjtRf1tERwotFP2iAEbApBhQKJz4usYUPU9N');
  assert.equal(report.identities.upgradeAuthority, '3DnrWsBbaT6BMbUKXL4x5cid9KRk7GbG89wdJNihEhU2');
  assert.equal(report.onChain.programExists, false);
  assert.equal(report.genesisHash, 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
  assert.equal(report.transactions[0].label, 'create and initialize buffer');
  assert.equal(report.transactions.at(-1).label, 'deploy program');
  assert.ok(report.transactions.length > 2);
  assert.deepEqual(report.transactions[0].requiredSigners, [
    'C7EpDNWshjtRf1tERwotFP2iAEbApBhQKJz4usYUPU9N',
    report.identities.buffer,
  ]);
  assert.deepEqual(report.transactions[1].requiredSigners, [
    'C7EpDNWshjtRf1tERwotFP2iAEbApBhQKJz4usYUPU9N',
    '3DnrWsBbaT6BMbUKXL4x5cid9KRk7GbG89wdJNihEhU2',
  ]);
  assert.deepEqual(report.transactions.at(-1).requiredSigners, [
    'C7EpDNWshjtRf1tERwotFP2iAEbApBhQKJz4usYUPU9N',
    'AYE4iC2gp81H8jvMjk4EGxwP2sJFzuDptUwxqwTZYTMY',
    '3DnrWsBbaT6BMbUKXL4x5cid9KRk7GbG89wdJNihEhU2',
  ]);
  assert.ok(report.transactions.every((tx) => tx.signatures.length === tx.requiredSigners.length));
  assert.ok(report.transactions.every((tx) => tx.signatures.every((signature) => signature.signature === null)));
  assert.ok(report.transactions.every((tx) => !('serializedTransaction' in tx)));
  assert.equal(report.requiredFutureApproval, 'A separate explicit instruction is required before this reviewed transaction plan may be signed or sent.');
});

test('deployment review rejects an artifact hash mismatch before building a transaction', async () => {
  const temporaryDir = await mkdtemp(path.join(tmpdir(), 'cumz-deploy-review-'));
  try {
    await writeFile(path.join(temporaryDir, 'cumzillaraptors.so'), 'not the approved SBPF artifact');
    await writeFile(path.join(temporaryDir, 'cumzillaraptors.build-revision'), '939c7f89e10c0329e8d4a4be1340e9f95f1532f5\n');
    const result = spawnSync('node', [
      script, '--review-only', '--artifact-dir', temporaryDir,
      '--program-keypair', '/nonexistent/program.json',
      '--payer-keypair', '/nonexistent/payer.json',
      '--upgrade-authority-keypair', '/nonexistent/authority.json',
    ], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SBPF artifact SHA-256 mismatch/);
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
});

// This review tool deliberately produces only incomplete, unsigned transaction messages.
// Adding any signing or send behavior requires a separate approval and separate security review.
