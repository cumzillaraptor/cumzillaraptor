import test from 'node:test';
import assert from 'node:assert/strict';

import { EXPECTED_FIXED_FACTS } from '../scripts/future-send-gate.mjs';
import { buildFakeStagedArgv, evaluateFakeFinalGate } from '../scripts/future-send-fake-cli-harness.mjs';

const FIXTURE = Object.freeze({ artifact: '/fixture/staged/cumzillaraptors.so', payer: '/fixture/staged/payer.json', program: '/fixture/staged/program.json', authority: '/fixture/staged/upgrade-authority.json', cli: '/fixture/staged/solana', rpc: 'https://rpc.example.test' });
function nominal(overrides = {}) { return { review: { genesisHash: EXPECTED_FIXED_FACTS.devnetGenesisHash, programAbsent: true, configAbsent: true, rpcOk: true, endpointSha256: 'a'.repeat(64) }, final: { genesisHash: EXPECTED_FIXED_FACTS.devnetGenesisHash, programAbsent: true, configAbsent: true, rpcOk: true, endpointSha256: 'a'.repeat(64) }, staged: { ...FIXTURE }, ...overrides }; }

test('negative final-gate conditions produce denial records, never fixture argv', () => {
  const cases = [
    ['genesis-mismatch', { final: { ...nominal().final, genesisHash: 'wrong' } }],
    ['program-exists', { final: { ...nominal().final, programAbsent: false } }],
    ['config-exists', { final: { ...nominal().final, configAbsent: false } }],
    ['rpc-failure', { final: { ...nominal().final, rpcOk: false } }],
    ['endpoint-digest-mismatch', { final: { ...nominal().final, endpointSha256: 'b'.repeat(64) } }],
    ['invalid-staged-paths', { staged: { ...FIXTURE, artifact: '/original/cumzillaraptors.so' } }],
  ];
  for (const [reason, overrides] of cases) assert.deepEqual(buildFakeStagedArgv(nominal(overrides)), { ok: false, reason });
});

test('nominal fake path builds fixed staged fixture argv but evaluation remains a denial', () => {
  const argv = buildFakeStagedArgv(nominal());
  assert.deepEqual(argv, [FIXTURE.cli, 'program', 'deploy', '--url', FIXTURE.rpc, '--program-id', FIXTURE.program, '--keypair', FIXTURE.payer, '--upgrade-authority', FIXTURE.authority, FIXTURE.artifact]);
  assert.equal(Object.isFrozen(argv), true);
  assert.equal(argv.some((value) => value.startsWith('/original/')), false);
  assert.deepEqual(evaluateFakeFinalGate(nominal()), { ok: false, reason: 'send-disabled-fake-cli-recorded' });
});

test('harness exports no callback, filesystem, process, transaction, signing, or send interface', async () => {
  assert.deepEqual(Object.keys(await import('../scripts/future-send-fake-cli-harness.mjs')), ['buildFakeStagedArgv', 'evaluateFakeFinalGate']);
  assert.equal(evaluateFakeFinalGate(nominal(), () => { throw new Error('must not execute'); }).reason, 'send-disabled-fake-cli-recorded');
});

// Pure fixture argument construction only: no callback invocation, host files, RPC, CLI process, transaction, signing, or send action.
