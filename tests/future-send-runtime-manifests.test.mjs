import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { EXPECTED_FIXED_FACTS } from '../scripts/future-send-gate.mjs';
import {
  ROOT_RUNTIME_PATHS,
  RUNTIME_MANIFEST_FIELDS,
  sanitizeRuntimeReport,
  validateDigestManifestText,
  validateRuntimeManifestText,
} from '../scripts/future-send-runtime-manifests.mjs';

function canonicalRuntimeManifest(overrides = {}) {
  return JSON.stringify({
    formatVersion: 1,
    runtimeRoot: ROOT_RUNTIME_PATHS.runtimeRoot,
    runtimeSourceSha256: 'a'.repeat(64),
    dependencyManifestSha256: 'b'.repeat(64),
    artifactRevision: EXPECTED_FIXED_FACTS.artifactRevision,
    artifactBytes: EXPECTED_FIXED_FACTS.artifactBytes,
    artifactSha256: EXPECTED_FIXED_FACTS.artifactSha256,
    cliPath: ROOT_RUNTIME_PATHS.cli,
    cliVersion: EXPECTED_FIXED_FACTS.cliVersion,
    cliSha256: EXPECTED_FIXED_FACTS.cliSha256,
    rpcEndpointSha256: 'c'.repeat(64),
    programId: EXPECTED_FIXED_FACTS.programId,
    configPda: EXPECTED_FIXED_FACTS.configPda,
    devnetGenesisHash: EXPECTED_FIXED_FACTS.devnetGenesisHash,
    commitment: 'confirmed',
    ...overrides,
  });
}

test('runtime manifest schema pins all fixed paths and reviewed Devnet facts', () => {
  assert.deepEqual(RUNTIME_MANIFEST_FIELDS, [
    'formatVersion', 'runtimeRoot', 'runtimeSourceSha256', 'dependencyManifestSha256',
    'artifactRevision', 'artifactBytes', 'artifactSha256', 'cliPath', 'cliVersion',
    'cliSha256', 'rpcEndpointSha256', 'programId', 'configPda', 'devnetGenesisHash', 'commitment',
  ]);
  assert.match(ROOT_RUNTIME_PATHS.runtimeRoot, /^\/opt\//);
  assert.match(ROOT_RUNTIME_PATHS.keyRoot, /^\/root\//);
  assert.deepEqual(validateRuntimeManifestText(canonicalRuntimeManifest()), { ok: true });
});

test('runtime manifest schema rejects malformed, non-canonical, and mismatched fixed facts', () => {
  const invalid = [
    undefined,
    '{',
    `${canonicalRuntimeManifest()}\n`,
    canonicalRuntimeManifest({ artifactRevision: 'wrong' }),
    canonicalRuntimeManifest({ artifactBytes: 1 }),
    canonicalRuntimeManifest({ artifactSha256: 'd'.repeat(64) }),
    canonicalRuntimeManifest({ cliPath: '/tmp/solana' }),
    canonicalRuntimeManifest({ programId: 'wrong' }),
    canonicalRuntimeManifest({ commitment: 'processed' }),
    JSON.stringify({ unexpected: true }),
  ];
  for (const input of invalid) assert.deepEqual(validateRuntimeManifestText(input), { ok: false });
});

test('digest manifest requires sorted unique relative paths and canonical digest lines', () => {
  const a = 'a'.repeat(64);
  const b = 'b'.repeat(64);
  const valid = `${a}  node_modules/a.js\n${b}  node_modules/z.js\n`;
  assert.deepEqual(validateDigestManifestText(valid), { ok: true, count: 2 });
  for (const input of [
    '', `${a}  node_modules/a.js`, `${a} node_modules/a.js\n`,
    `${b}  node_modules/z.js\n${a}  node_modules/a.js\n`,
    `${a}  node_modules/a.js\n${b}  node_modules/a.js\n`,
    `${a.toUpperCase()}  node_modules/a.js\n`,
  ]) assert.deepEqual(validateDigestManifestText(input), { ok: false });
});

test('sanitized runtime report exposes only origin and public reviewed facts', () => {
  const report = sanitizeRuntimeReport({ rpcOrigin: 'https://rpc.example.test' });
  assert.deepEqual(report, {
    ok: true,
    rpcOrigin: 'https://rpc.example.test',
    artifactRevision: EXPECTED_FIXED_FACTS.artifactRevision,
    artifactSha256: EXPECTED_FIXED_FACTS.artifactSha256,
    programId: EXPECTED_FIXED_FACTS.programId,
    configPda: EXPECTED_FIXED_FACTS.configPda,
  });
  assert.equal(Object.isFrozen(report), true);
  for (const input of [undefined, {}, { rpcOrigin: 'https://user:secret@rpc.example.test/path?token=secret' }, { rpcOrigin: 'http://rpc.example.test' }]) {
    assert.deepEqual(sanitizeRuntimeReport(input), { ok: false, reason: 'invalid-input' });
  }
});

test('manifest schema module is pure and has no filesystem, process, key, transaction, signing, CLI, or send capability', async () => {
  const source = await readFile(new URL('../scripts/future-send-runtime-manifests.mjs', import.meta.url), 'utf8');
  const prohibited = /node:(?:fs|child_process|process|net|http|https)|@solana|\b(?:fetch|spawn|exec|readFile|writeFile|mkdir|rm|sendTransaction|sendRawTransaction|sendAndConfirm|signTransaction|serialize)\s*\(|solana program/;
  const executableSource = source.split('\n').filter((line) => !line.trimStart().startsWith('//')).join('\n');
  assert.doesNotMatch(executableSource, prohibited);
});

// Pure schema tests only: no root runtime, manifest file, key, endpoint, CLI, transaction, signing, or send action is exercised.
