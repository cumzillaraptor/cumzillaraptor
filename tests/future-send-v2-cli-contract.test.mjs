import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildV2CliArgv } from '../scripts/future-send-v2-cli-contract.mjs';

const nonce = 'A'.repeat(43);
const endpoint = 'https://rpc.example.test/review?tenant=alpha&token=public';
const alternate = 'https://rpc.example.test/alternate?tenant=alpha&token=public';
const digestFor = (candidate) => createHash('sha256').update(candidate, 'utf8').digest('hex');
const authorizationSha256 = 'd'.repeat(64);
const runtimeManifestSha256 = 'b'.repeat(64);
const reviewReportSha256 = 'c'.repeat(64);
const deny = Object.freeze({ ok: false, reason: 'invalid-input' });

function approvalFor(approvedEndpoint = endpoint) {
  return Object.freeze({
    ok: true,
    nonce,
    authorizationSha256,
    endpointBinding: Object.freeze({
      authorizationSha256,
      rpcSha256: digestFor(approvedEndpoint),
      runtimeManifestSha256,
      reviewReportSha256,
    }),
  });
}

function makeInput(overrides = {}) {
  return Object.freeze({
    approval: approvalFor(),
    canonicalEndpoint: endpoint,
    runtimeManifestEndpointSha256: digestFor(endpoint),
    ...overrides,
  });
}

const expected = [
  `/opt/cumzillaraptors-send-runtime-candidate-v2/staging/${nonce}/solana`, 'program', 'deploy', '--url', endpoint, '--commitment', 'confirmed', '--keypair', `/opt/cumzillaraptors-send-runtime-candidate-v2/staging/${nonce}/payer.json`, '--program-id', `/opt/cumzillaraptors-send-runtime-candidate-v2/staging/${nonce}/program.json`, '--upgrade-authority', `/opt/cumzillaraptors-send-runtime-candidate-v2/staging/${nonce}/upgrade-authority.json`, `/opt/cumzillaraptors-send-runtime-candidate-v2/staging/${nonce}/cumzillaraptors.so`,
];

test('pure CLI contract emits exactly one frozen fixed token vector for a valid endpoint-bound approval', () => {
  const actual = buildV2CliArgv(makeInput());
  assert.deepEqual(actual, expected);
  assert.equal(Object.isFrozen(actual), true);
  assert.throws(() => { actual.push('--buffer'); }, TypeError);
  assert.equal(actual.some((value) => typeof value !== 'string'), false);
});

test('CLI contract denies forged or invalid approval shapes, including arbitrary self-digests', () => {
  const unfrozenApproval = { ...approvalFor() };
  const malformedBinding = Object.freeze({
    authorizationSha256,
    rpcSha256: digestFor(endpoint),
    runtimeManifestSha256,
  });
  const arbitraryMatchingSelfDigest = Object.freeze({
    ok: true,
    nonce,
    endpointBinding: Object.freeze({ rpcSha256: digestFor(endpoint) }),
  });
  const accessorApproval = Object.freeze(Object.defineProperty({ ...approvalFor() }, 'nonce', {
    enumerable: true, configurable: false, get: () => nonce,
  }));
  const cases = [
    undefined,
    Object.freeze({ ok: true }),
    unfrozenApproval,
    Object.freeze({ ...approvalFor(), endpointBinding: malformedBinding }),
    arbitraryMatchingSelfDigest,
    accessorApproval,
    Object.freeze({ authorizationSha256, ok: true, nonce, endpointBinding: approvalFor().endpointBinding }),
    Object.freeze({ ...approvalFor(), extra: 'forged' }),
  ];
  for (const approval of cases) assert.deepEqual(buildV2CliArgv(makeInput({ approval })), deny);
});

test('CLI contract binds the signed authorization and runtime manifest digests to exactly one endpoint', () => {
  assert.deepEqual(buildV2CliArgv(makeInput({ canonicalEndpoint: alternate })), deny);
  assert.deepEqual(buildV2CliArgv(makeInput({
    approval: approvalFor(alternate),
    canonicalEndpoint: endpoint,
  })), deny);
  assert.deepEqual(buildV2CliArgv(makeInput({
    runtimeManifestEndpointSha256: digestFor(alternate),
  })), deny);
  assert.deepEqual(buildV2CliArgv(makeInput({
    approval: approvalFor('https://rpc.example.test/arbitrary?tenant=alpha&token=public'),
    runtimeManifestEndpointSha256: digestFor(endpoint),
  })), deny);
});

test('CLI contract requires exactly three frozen immutable input data fields', () => {
  const unfrozen = { approval: approvalFor(), canonicalEndpoint: endpoint, runtimeManifestEndpointSha256: digestFor(endpoint) };
  const accessor = Object.freeze(Object.defineProperty({ ...makeInput() }, 'approval', {
    enumerable: true, configurable: false, get: () => approvalFor(),
  }));
  const inherited = Object.freeze(Object.create(Object.assign(Object.create(Object.prototype), { approval: approvalFor() })));
  const withSymbol = Object.freeze({ ...makeInput(), [Symbol('extra')]: 'extra' });
  const nonEnumerable = Object.freeze(Object.defineProperty({ ...makeInput() }, 'approval', { enumerable: false }));
  const reordered = Object.freeze({ canonicalEndpoint: endpoint, approval: approvalFor(), runtimeManifestEndpointSha256: digestFor(endpoint) });
  const missing = Object.freeze({ approval: approvalFor(), canonicalEndpoint: endpoint });
  const exotic = Object.freeze(Object.assign(new Date(0), makeInput()));
  for (const input of [unfrozen, accessor, inherited, withSymbol, nonEnumerable, reordered, missing, exotic]) {
    assert.deepEqual(buildV2CliArgv(input), deny);
  }
});

test('CLI contract denies unsafe endpoint syntax even if supplied digests match it', () => {
  const unsafeEndpoints = ['http://rpc.example.test', 'https://user:pass@rpc.example.test', 'https://rpc.example.test/a b', 'https://rpc.example.test/#fragment', 'https://rpc.example.test:8443', 'https://rpc.example.test/a%2fb', 'https://rpc.example.test/path?', 'https://rpc.example.test/?x=1&x=2', 'https://rpc.example.test/?=x', 'https://rpc.example.test/?x=', 'https://rpc.example.test/?x=1=2', 'https://rpc.example.test/?x=1&&y=2', 'https:///path', 'https://rpc.example.test/review?token=public&tenant=alpha'];
  for (const candidate of unsafeEndpoints) {
    assert.deepEqual(buildV2CliArgv(makeInput({
      approval: approvalFor(candidate),
      canonicalEndpoint: candidate,
      runtimeManifestEndpointSha256: digestFor(candidate),
    })), deny);
  }
});

test('CLI module source is string-only and has no CLI-spawn, host, signing, transaction, RPC, or Solana capability', async () => {
  const source = await readFile(new URL('../scripts/future-send-v2-cli-contract.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:(?:fs|child_process|process|net|http|https|tls)|\b(?:spawn|exec|fork|process|readFile|writeFile|fetch|sign|generateKeyPair|createPrivateKey|Transaction|serialize)\b|solana program/);
});

// The exact argv is data only: this test cannot execute it or contact its endpoint.
