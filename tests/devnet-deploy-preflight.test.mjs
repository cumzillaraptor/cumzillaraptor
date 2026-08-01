import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const script = path.join(root, 'scripts', 'preflight-devnet-deploy.mjs');

test('devnet deployment preflight is fail-closed and has no signing or sending path', async () => {
  const source = await readFile(script, 'utf8');
  const result = spawnSync('node', [script], { cwd: root, encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing: pass --preflight/);
  assert.match(source, /--preflight/);
  assert.match(source, /No transaction will be constructed, signed, or sent/);
  assert.doesNotMatch(source, /sendTransaction|sendRawTransaction|signTransaction|BpfLoader|programDeploy/);
});

test('preflight requires an artifact directory and separate payer and upgrade authority paths', async () => {
  const result = spawnSync('node', [script, '--preflight'], { cwd: root, encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--artifact-dir/);
  assert.match(result.stderr, /--payer-keypair/);
  assert.match(result.stderr, /--upgrade-authority-keypair/);
});

// This tool is intentionally pre-send only. A deployment implementation requires a separate,
// explicitly approved task and must not be added by extending this script.
