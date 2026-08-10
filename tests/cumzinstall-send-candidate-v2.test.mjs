import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scriptPath = path.join(root, 'scripts', 'cumzinstall-send-candidate-v2.sh');

const EXPECTED = Object.freeze({
  commit: '09b20e169a78bbb1f297f5717d1ae5eeda0c2efb',
  policy: 'fd7a6c8a1cea67ddad0ecd2ccce25842b99fe4d0f7b4050bc1d6d1ede3320b8f',
  policyTest: '87a3677167f95b2178918b137409ff38ab223ee02582da79a5486b41389b6130',
  guard: 'bcf5efb611379c9a9a4a29ceaf1e5d184d95c2b39bdc04f35cdd760a6b0b2fff',
  guardTest: 'ade62065fe99e42f0dbc54bdc27bcd912eb28e81bde15e5309e31bbcf633c228',
});

test('v2 candidate installer is fixed-purpose, no-argument, and permanently no-send', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /^#!\/bin\/sh\n/);
  assert.match(source, /if \[ "\$\(id -u\)" -ne 0 \]; then[\s\S]*Refusing: root is required for candidate installation\.[\s\S]*exit 77[\s\S]*fi/);
  assert.match(source, /if \[ "\$#" -ne 0 \]; then[\s\S]*exit 64[\s\S]*fi/);
  assert.match(source, /CANDIDATE=\/opt\/cumzillaraptors-send-runtime-candidate-v2/);
  assert.match(source, /\[ ! -e "\$CANDIDATE" \] \|\| \{ echo "Candidate directory already exists; refusing replacement\." >&2; exit 1; \}/);
  assert.match(source, /mode=no-send-policy-and-guard-only/);
  assert.match(source, /No-send candidate v2 installation verified; no key, RPC, CLI, signing, send, or deployment operation occurred\./);
  for (const value of Object.values(EXPECTED)) assert.match(source, new RegExp(value));
  assert.doesNotMatch(source, /@solana|solana program|--url|rpc-endpoint|keypair|sendTransaction|sendRawTransaction|sendAndConfirm|\.sign\(|signTransaction|serialize|spawn|exec|curl|wget/);
});

test('v2 candidate installer copies only policy/guard sources and runs offline tests', async () => {
  const source = await readFile(scriptPath, 'utf8');
  for (const pathSuffix of [
    'scripts/future-send-gate.mjs',
    'tests/future-send-gate.test.mjs',
    'scripts/future-send-runtime-guard.mjs',
    'tests/future-send-runtime-guard.test.mjs',
  ]) assert.match(source, new RegExp(pathSuffix.replaceAll('.', '\\.')));
  assert.match(source, /\/usr\/bin\/node --test tests\/future-send-gate\.test\.mjs tests\/future-send-runtime-guard\.test\.mjs/);
  const executableLines = source.split('\n').filter((line) => !line.trimStart().startsWith('#') && !line.includes('Usage:'));
  assert.doesNotMatch(executableLines.join('\n'), /rm -rf|\bmv\b|\bcp\b|\bgit\b|\bnpm\b|\bsudo\b/);
});

test('v2 candidate installer source has valid POSIX shell syntax', async () => {
  const { status, stderr } = await new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-n', scriptPath], { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ status: code, stderr: error }));
  });
  assert.equal(status, 0, stderr);
});

// Static source tests only. This suite does not execute the root-only installer.
