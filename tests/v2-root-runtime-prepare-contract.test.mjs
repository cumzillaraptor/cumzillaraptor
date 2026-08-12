import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  makePrepareContract,
  parsePrepareRequest,
  validatePrepareReport,
} from '../scripts/v2-root-runtime-prepare-contract.mjs';

const DENY = Object.freeze({ ok: false, reason: 'invalid-input' });
const GUARANTEE = 'No deployment command was invoked. No transaction was signed or sent.';
const EXPECTED_CONTRACT = Object.freeze({
  mode: '--prepare',
  candidateRoot: '/opt/cumzillaraptors-send-runtime-candidate-v2',
  commitment: 'confirmed',
  outputFields: Object.freeze(['runtimeManifestSha256', 'endpointOrigin', 'review', 'prepareCompletion']),
  guarantee: GUARANTEE,
});

function expectDeny(value) {
  assert.deepEqual(value, DENY);
  assert.equal(Object.isFrozen(value), true);
  assert.doesNotMatch(JSON.stringify(value), /send|artifact|key|endpoint|cli|cwd|secret/i);
}

test('prepare-contract-allows-only-literal-prepare', () => {
  const contract = makePrepareContract();
  assert.deepEqual(contract, EXPECTED_CONTRACT);
  assert.equal(Object.isFrozen(contract), true);
  assert.equal(Object.isFrozen(contract.outputFields), true);
  assert.deepEqual(parsePrepareRequest(['--prepare']), Object.freeze({ ok: true, contract }));
});

test('prepare-contract-denies-send-and-extra-arguments', () => {
  for (const input of [
    ['--send'], [], ['--prepare', '--send'], ['--prepare', '/tmp/artifact.so'],
    ['--prepare', '/root/keypair.json'], ['--prepare', 'https://user:secret@example.test'],
    ['--prepare', '/opt/solana'], ['--prepare', '/caller/cwd'], '', null, undefined,
  ]) expectDeny(parsePrepareRequest(input));
});

test('prepare-contract-report-is-redacted', () => {
  const nominal = Object.freeze({
    runtimeManifestSha256: 'a'.repeat(64),
    endpointOrigin: 'https://rpc.example.test',
    review: Object.freeze({ observedProgramAbsent: true, observedConfigAbsent: true, commitment: 'confirmed' }),
    prepareCompletion: Object.freeze({ mode: 'FRESH PRE-SIGN REVIEW COMPLETE', guarantee: GUARANTEE }),
  });
  const accepted = validatePrepareReport(nominal);
  assert.deepEqual(accepted, Object.freeze({ ok: true, value: nominal }));
  assert.equal(Object.isFrozen(accepted), true);
  for (const review of [
    Object.freeze({ observedProgramAbsent: true, observedConfigAbsent: true }),
    Object.freeze({ observedConfigAbsent: true, observedProgramAbsent: true, commitment: 'confirmed' }),
    Object.freeze({ observedProgramAbsent: true, observedConfigAbsent: true, commitment: 'processed' }),
  ]) expectDeny(validatePrepareReport(Object.freeze({ ...nominal, review })));
  for (const report of [
    { ...nominal, endpointOrigin: 'https://user:secret@rpc.example.test' },
    { ...nominal, endpointOrigin: '/root/cumzillaraptors-send-runtime-candidate-v2/config/rpc-endpoint' },
    { ...nominal, endpointOrigin: 'https://rpc.example.test?token=secret-value' },
    { ...nominal, endpointPath: '/root/cumzillaraptors-send-runtime-candidate-v2/config/rpc-endpoint' },
    { ...nominal, keyMaterial: '[1,2,3]' },
    { ...nominal, transactionBytes: 'deadbeef' },
    { ...nominal, signature: 'signature-value' },
    { ...nominal, credentialHint: 'sensitive-looking-value' },
    { ...nominal, arbitrary: 'inert-value' },
  ]) expectDeny(validatePrepareReport(report));
});

test('prepare contract source has no host, network, signing, transaction, or executable capability', async () => {
  const source = await readFile(new URL('../scripts/v2-root-runtime-prepare-contract.mjs', import.meta.url), 'utf8');
  const forbiddenCapability = /(?:\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?|\bimport\s*\()\s*['"](?:node:)?(?:fs(?:\/promises)?|process|child_process|net|http|https|tls|dgram)['"]|(?:\bfrom\s*|\bimport\s*\()\s*['"]@solana(?:\/[^'"]*)?['"]|\b(?:readFile|readFileSync|writeFile|writeFileSync|appendFile|appendFileSync|mkdir|mkdirSync|rm|rmSync|unlink|unlinkSync|spawn|spawnSync|exec|execSync|execFile|execFileSync|fork|fetch|WebSocket|XMLHttpRequest|createPrivateKey|createSign|generateKeyPair|generateKeyPairSync|sign|serialize|sendTransaction|sendRawTransaction|sendAndConfirmTransaction)\s*\(|\bprocess\s*\.|\b(?:Bun\.spawn|Deno\.Command|execa)\s*\(/;
  assert.doesNotMatch(source, forbiddenCapability);
});

// This specification uses literals and synthetic reports only; it never opens a root path, endpoint, key, artifact, or CLI.
