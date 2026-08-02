import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { EXPECTED_FIXED_FACTS, canonicalizeRpcEndpoint } from '../scripts/future-send-gate.mjs';
import * as runtimeGuard from '../scripts/future-send-runtime-guard.mjs';

const { evaluateNoSendPreflight } = runtimeGuard;
const SAFE_RPC = 'https://rpc.example.test/review?tenant=alpha&token=public';
const ENDPOINT_DIGEST = canonicalizeRpcEndpoint(SAFE_RPC).sha256;
const NOW = '2026-08-01T00:01:00.000Z';
const NONCE = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';

function rootOnlyMetadata(overrides = {}) {
  return Object.freeze({
    uid: 0,
    mode: 0o600,
    isRegularFile: true,
    parentUid: 0,
    parentMode: 0o700,
    ...overrides,
  });
}

function authorizationText(overrides = {}) {
  return JSON.stringify({
    formatVersion: 1,
    nonce: NONCE,
    createdAt: '2026-08-01T00:00:00.000Z',
    expiresAt: '2026-08-01T00:05:00.000Z',
    devnetGenesisHash: EXPECTED_FIXED_FACTS.devnetGenesisHash,
    rpcSha256: ENDPOINT_DIGEST,
    commitment: 'confirmed',
    programId: EXPECTED_FIXED_FACTS.programId,
    configPda: EXPECTED_FIXED_FACTS.configPda,
    artifactRevision: EXPECTED_FIXED_FACTS.artifactRevision,
    artifactBytes: EXPECTED_FIXED_FACTS.artifactBytes,
    artifactSha256: EXPECTED_FIXED_FACTS.artifactSha256,
    cliVersion: EXPECTED_FIXED_FACTS.cliVersion,
    cliSha256: EXPECTED_FIXED_FACTS.cliSha256,
    runtimeManifestSha256: 'a'.repeat(64),
    reviewReportSha256: 'b'.repeat(64),
    observedProgramAbsent: true,
    observedConfigAbsent: true,
    authorization: 'one Devnet program deployment attempt only',
    exclusions: 'No launch initialization, collection creation, minting, claims, payments, uploads, authority changes, upgrades, mainnet, or other transactions.',
    ...overrides,
  });
}

function nominalInput(overrides = {}) {
  return {
    authorization: {
      recordText: authorizationText(),
      metadata: rootOnlyMetadata(),
    },
    now: NOW,
    review: {
      endpointSha256: ENDPOINT_DIGEST,
      commitment: 'confirmed',
      genesisHash: EXPECTED_FIXED_FACTS.devnetGenesisHash,
      programAbsent: true,
      configAbsent: true,
      rpcOk: true,
    },
    final: {
      endpointSha256: ENDPOINT_DIGEST,
      commitment: 'confirmed',
      genesisHash: EXPECTED_FIXED_FACTS.devnetGenesisHash,
      programAbsent: true,
      configAbsent: true,
      rpcOk: true,
    },
    nonce: { consumed: false, reserved: false },
    stage: { ok: true },
    paths: { ok: true, manifestOk: true },
    ...overrides,
  };
}

function expectReason(input, reason) {
  const result = evaluateNoSendPreflight(input);
  assert.deepEqual(result, { ok: false, reason });
  assert.equal(Object.isFrozen(result), true);
  assert.throws(() => { result.reason = 'tampered'; }, TypeError);
  return result;
}

test('defaults to a frozen deny result with no authorization', () => {
  expectReason(undefined, 'missing-authorization');
  expectReason({}, 'missing-authorization');
});

test('rejects invalid or mismatched authorization before later facts', () => {
  expectReason(nominalInput({ authorization: { recordText: '{', metadata: rootOnlyMetadata() } }), 'invalid-authorization');
  expectReason(nominalInput({ authorization: { recordText: authorizationText({ programId: 'wrong' }), metadata: rootOnlyMetadata() } }), 'invalid-authorization');
  expectReason(nominalInput({ authorization: { recordText: authorizationText({ rpcSha256: 'c'.repeat(64) }), metadata: rootOnlyMetadata() } }), 'invalid-authorization');
});

test('maps prototype-poisoned extensible authorization metadata to a frozen invalid-input deny', () => {
  const expectedMetadata = {
    uid: 0,
    mode: 0o600,
    isRegularFile: true,
    parentUid: 0,
    parentMode: 0o700,
  };
  Object.defineProperties(Object.prototype, Object.fromEntries(
    Object.entries(expectedMetadata).map(([key, value]) => [key, {
      configurable: true,
      value,
    }]),
  ));
  try {
    expectReason(nominalInput({
      authorization: { recordText: authorizationText(), metadata: {} },
    }), 'invalid-input');
  } finally {
    for (const key of Object.keys(expectedMetadata)) delete Object.prototype[key];
  }
});

test('rejects consumed or reserved nonces', () => {
  expectReason(nominalInput({ nonce: { consumed: true, reserved: false } }), 'nonce-consumed');
  expectReason(nominalInput({ nonce: { consumed: false, reserved: true } }), 'nonce-reserved');
});

test('rejects final-state and gate failures with specific safe reasons', () => {
  const cases = [
    ['genesis-mismatch', { final: { ...nominalInput().final, genesisHash: 'wrong-genesis' } }],
    ['program-exists', { final: { ...nominalInput().final, programAbsent: false } }],
    ['config-exists', { final: { ...nominalInput().final, configAbsent: false } }],
    ['endpoint-digest-mismatch', { final: { ...nominalInput().final, endpointSha256: 'c'.repeat(64) } }],
    ['commitment-mismatch', { final: { ...nominalInput().final, commitment: 'processed' } }],
    ['rpc-failure', { final: { ...nominalInput().final, rpcOk: false } }],
    ['stage-failure', { stage: { ok: false } }],
    ['path-manifest-failure', { paths: { ok: false, manifestOk: true } }],
    ['path-manifest-failure', { paths: { ok: true, manifestOk: false } }],
  ];
  for (const [reason, overrides] of cases) expectReason(nominalInput(overrides), reason);
});

test('rejects a review-absent/final-present race', () => {
  expectReason(nominalInput({
    review: { ...nominalInput().review, programAbsent: true, configAbsent: true },
    final: { ...nominalInput().final, programAbsent: false, configAbsent: true },
  }), 'program-exists');
});

test('permanently stops a nominal all-gates-pass mock without a send decision', () => {
  const result = expectReason(nominalInput(), 'send-disabled-no-live-authorization');
  assert.deepEqual(Object.keys(result), ['ok', 'reason']);
  assert.equal('action' in result, false);
  assert.equal('args' in result, false);
  assert.equal('command' in result, false);
});

test('never leaks a full endpoint or authorization record in returned reasons', () => {
  const secretEndpoint = 'https://username:super-secret@rpc.example.test/private/path?token=top-secret';
  const recordText = `${authorizationText()} ${secretEndpoint}`;
  const result = evaluateNoSendPreflight(nominalInput({
    authorization: { recordText, metadata: rootOnlyMetadata() },
    final: { ...nominalInput().final, endpointSha256: secretEndpoint },
  }));
  assert.deepEqual(result, { ok: false, reason: 'invalid-authorization' });
  assert.doesNotMatch(JSON.stringify(result), /username|super-secret|private\/path|top-secret|rpc\.example/);
});

function expectInvalidInput(input) {
  let result;
  assert.doesNotThrow(() => { result = evaluateNoSendPreflight(input); });
  assert.deepEqual(result, { ok: false, reason: 'invalid-input' });
  assert.equal(Object.isFrozen(result), true);
  return result;
}

test('rejects hostile top-level and nested record shapes without throwing', () => {
  for (const input of [null, 1, 'not-a-record', []]) expectInvalidInput(input);

  for (const field of ['authorization', 'review', 'final', 'nonce', 'paths', 'stage']) {
    for (const value of [null, 1, []]) expectInvalidInput(nominalInput({ [field]: value }));
  }
  for (const value of [null, 1, []]) {
    expectInvalidInput(nominalInput({ authorization: { recordText: authorizationText(), metadata: value } }));
  }
});

test('rejects inherited, accessor, and proxy-backed input without dereferencing it', () => {
  const inheritedInput = Object.create({ authorization: nominalInput().authorization });
  expectInvalidInput(inheritedInput);

  const inheritedMetadata = Object.create(rootOnlyMetadata());
  expectInvalidInput(nominalInput({ authorization: { recordText: authorizationText(), metadata: inheritedMetadata } }));

  const throwingInputGetter = {};
  Object.defineProperty(throwingInputGetter, 'authorization', { enumerable: true, get() { throw new Error('unreadable'); } });
  expectInvalidInput(throwingInputGetter);

  const throwingMetadataGetter = {};
  Object.defineProperty(throwingMetadataGetter, 'uid', { enumerable: true, get() { throw new Error('unreadable'); } });
  expectInvalidInput(nominalInput({ authorization: { recordText: authorizationText(), metadata: throwingMetadataGetter } }));

  let proxyResult;
  assert.doesNotThrow(() => { proxyResult = evaluateNoSendPreflight(new Proxy({}, { get() { throw new Error('unreadable'); } })); });
  assert.deepEqual(proxyResult, { ok: false, reason: 'missing-authorization' });
  assert.equal(Object.isFrozen(proxyResult), true);

  expectInvalidInput(new Proxy({}, { getPrototypeOf() { throw new Error('unreadable'); } }));
});

test('rejects sealed writable metadata and sealed-target descriptor fabrication as frozen denies', () => {
  const expectedMetadata = {
    uid: 0,
    mode: 0o600,
    isRegularFile: true,
    parentUid: 0,
    parentMode: 0o700,
  };
  const sealedIncorrectTarget = Object.seal({ ...expectedMetadata, uid: 1000 });
  const sealedFabricatingProxy = new Proxy(sealedIncorrectTarget, {
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (!descriptor || !Object.hasOwn(expectedMetadata, key)) return descriptor;
      return { ...descriptor, value: expectedMetadata[key] };
    },
  });

  expectReason(nominalInput({
    authorization: { recordText: authorizationText(), metadata: { ...expectedMetadata } },
  }), 'invalid-input');
  expectReason(nominalInput({
    authorization: { recordText: authorizationText(), metadata: Object.seal({ ...expectedMetadata }) },
  }), 'invalid-authorization');
  expectReason(nominalInput({
    authorization: { recordText: authorizationText(), metadata: sealedFabricatingProxy },
  }), 'invalid-authorization');
});

test('accepts frozen ordinary input only as a permanent no-send deny', () => {
  const input = nominalInput();
  Object.freeze(input.authorization.metadata);
  Object.freeze(input.authorization);
  Object.freeze(input.review);
  Object.freeze(input.final);
  Object.freeze(input.nonce);
  Object.freeze(input.paths);
  Object.freeze(input.stage);
  Object.freeze(input);
  expectReason(input, 'send-disabled-no-live-authorization');
});

test('runtime guard and imported gate have static pure/offline capability boundaries', async () => {
  const sources = await Promise.all([
    '../scripts/future-send-runtime-guard.mjs',
    '../scripts/future-send-gate.mjs',
  ].map(async (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8')));
  const prohibited = /\bimport\s*\(|\brequire\s*\(|node\/(?:fs|child_process|process|net|http|https|dgram|tls|timers|events)|node:(?:fs(?:\/promises)?|child_process|process|net|http|https|dgram|tls|timers|events)|(?<![.$\w])(?:fetch|spawn|exec|execFile|fork|readFile|writeFile|appendFile|rm|unlink|mkdir|readdir|setTimeout|setInterval|setImmediate|queueMicrotask|addEventListener|removeEventListener)\s*\(|\b(?:process|global\.process)\s*\.|\bEventEmitter\b/;
  for (const source of sources) {
    assert.doesNotMatch(source, prohibited);
    assert.doesNotMatch(source, /\b(?:build|construct)\w*\s*(?:Cli|CLI|Args|Arguments)\b/);
    assert.doesNotMatch(source, /\*{3}/);
  }
  assert.deepEqual(Object.keys(runtimeGuard), ['evaluateNoSendPreflight']);
});

// This suite supplies deterministic mock facts only: no filesystem/network/process use by the guard, no keys, CLI, signing, serialization, or send path.
