import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const script = path.join(root, 'scripts', 'preflight-devnet-deploy.mjs');
const { parseArgs, safeRpcLabel, safeErrorMessage } = await import(pathToFileURL(script).href);

const publicKeyArgs = [
  '--artifact-dir', '/tmp/artifact',
  '--program-public-key', 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY',
  '--payer-public-key', '11111111111111111111111111111111',
  '--upgrade-authority-public-key', 'SysvarC1ock11111111111111111111111111111111',
];

test('devnet deployment preflight is fail-closed, public-key-only, and has no signing or sending path', async () => {
  const source = await readFile(script, 'utf8');
  const result = spawnSync('node', [script], { cwd: root, encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing: pass --preflight/);
  assert.match(source, /--preflight/);
  assert.match(source, /No transaction will be constructed, signed, or sent/);
  assert.doesNotMatch(source, /Keypair|fromSecretKey|--program-keypair|--payer-keypair|--upgrade-authority-keypair|sendTransaction|sendRawTransaction|signTransaction|BpfLoader|programDeploy|Transaction/);
});

test('preflight accepts only public-key CLI identity inputs', () => {
  const parsed = parseArgs(['--preflight', ...publicKeyArgs]);
  assert.equal(parsed.program_public_key, publicKeyArgs[3]);
  assert.equal(parsed.payer_public_key, publicKeyArgs[5]);
  assert.equal(parsed.upgrade_authority_public_key, publicKeyArgs[7]);
  assert.throws(() => parseArgs(['--preflight', '--artifact-dir', '/tmp/artifact', '--program-keypair', '/secret/program.json']), /Unknown argument/);
});

test('preflight redacts authenticated RPC URLs from reports and errors', () => {
  const rpc = 'https://user:TOP_SECRET_DO_NOT_LEAK@rpc.example.test/v2/TOP_SECRET_DO_NOT_LEAK?api-key=TOP_SECRET_DO_NOT_LEAK';
  assert.equal(safeRpcLabel(rpc), 'https://rpc.example.test');
  assert.equal(safeErrorMessage(new Error(`failed: ${rpc}`), rpc), 'RPC request failed; check the configured endpoint locally.');
});

test('preflight requires an artifact directory and three public keys', () => {
  const result = spawnSync('node', [script, '--preflight'], { cwd: root, encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--artifact-dir/);
  assert.match(result.stderr, /--program-public-key/);
  assert.match(result.stderr, /--payer-public-key/);
  assert.match(result.stderr, /--upgrade-authority-public-key/);
});

// This tool is intentionally read-only. A deployment implementation requires a separate,
// explicitly approved task and must not be added by extending this script.
