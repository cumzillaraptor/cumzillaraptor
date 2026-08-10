import test from 'node:test';
import assert from 'node:assert/strict';

import * as gate from '../scripts/future-send-gate.mjs';

const {
  EXPECTED_FIXED_FACTS,
  canonicalizeRpcEndpoint,
  markNonceStarted,
  markNonceTerminal,
  reserveNonceAtomically,
  validateAuthorizationRecord,
  validateCleanupPlan,
} = gate;

const SAFE_RPC = 'HTTPS://Rpc.Example.Test/review?tenant=alpha&token=public';

function canonicalAuthText(overrides = {}) {
  const rpc = canonicalizeRpcEndpoint(SAFE_RPC);
  const record = {
    formatVersion: 1,
    nonce: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
    createdAt: '2026-08-01T00:00:00.000Z',
    expiresAt: '2026-08-01T00:05:00.000Z',
    devnetGenesisHash: EXPECTED_FIXED_FACTS.devnetGenesisHash,
    rpcSha256: rpc.sha256,
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
  };
  return JSON.stringify(record);
}

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

test('future-send policy remains bound to the current reviewed Devnet artifact and PDAs', () => {
  assert.deepEqual(EXPECTED_FIXED_FACTS, {
    cluster: 'devnet',
    devnetGenesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
    programId: 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY',
    configPda: '7JDvn8mkEousMqzasbDZazkq8EsRy42nB1Dxp74Kg3e6',
    artifactRevision: '01ae96e2542717438112c3244394e0d484210f34',
    artifactBytes: 397040,
    artifactSha256: '2c88fe80ff4488e4034fdf2a724822a8413d0242b09176ed1710648eb110aa22',
    cliVersion: 'v1.18.26',
    cliSha256: '1ef9999ed4bce11226170a312775c8b6439f54331ac4bf249957d587deda6852',
  });
});

test('canonicalizes a strict HTTPS endpoint and returns only deterministic metadata', () => {
  const result = canonicalizeRpcEndpoint(SAFE_RPC);
  assert.equal(result.canonical, 'https://rpc.example.test/review?tenant=alpha&token=public');
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.origin, 'https://rpc.example.test');

  const sorted = canonicalizeRpcEndpoint('https://RPC.EXAMPLE.TEST:443/review?z=last&a=first');
  assert.equal(sorted.canonical, 'https://rpc.example.test/review?a=first&z=last');
});

test('endpoint canonicalization rejects ambiguous or unsafe forms without echoing input', () => {
  const invalidEndpoints = [
    'http://rpc.example.test',
    'https://rpc.example.test:8443',
    'https://rpc.example.test/path#fragment',
    'https://rpc.example.test/path?x=1&x=2',
    'https://rpc.example.test/path?',
    'https://rpc.example.test/path?x=',
    'https://rpc.example.test/path?=x',
    'https://rpc.example.test/path?x=1&&y=2',
    'https://rpc.example.test/path?x=%41',
    'https://rpc.example.test/path?x=1 ',
    'https://username@rpc.example.test/path',
    'https://username:password@rpc.example.test/path',
    'https://:password@rpc.example.test/path',
    'https://@rpc.example.test/path',
  ];
  for (const endpoint of invalidEndpoints) {
    assert.throws(() => canonicalizeRpcEndpoint(endpoint), (error) => {
      assert.match(error.message, /^Invalid RPC endpoint\.$/);
      assert.doesNotMatch(error.message, /rpc\.example|fragment|%41/);
      return true;
    });
  }
});

test('authorization validation defaults to deny and accepts only canonical root-only fixed facts', () => {
  const endpoint = canonicalizeRpcEndpoint(SAFE_RPC);
  const accepted = validateAuthorizationRecord({
    recordText: canonicalAuthText(),
    metadata: rootOnlyMetadata(),
    now: '2026-08-01T00:01:00.000Z',
    rpcSha256: endpoint.sha256,
  });
  assert.deepEqual(accepted, { ok: true, nonce: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ' });

  const invalidCases = [
    {},
    { recordText: '{', metadata: rootOnlyMetadata() },
    { recordText: canonicalAuthText(), metadata: rootOnlyMetadata({ uid: 1000 }) },
    { recordText: canonicalAuthText(), metadata: rootOnlyMetadata({ mode: 0o644 }) },
    { recordText: canonicalAuthText({ expiresAt: '2026-08-01T00:00:30.000Z' }), metadata: rootOnlyMetadata() },
    { recordText: canonicalAuthText({ devnetGenesisHash: 'wrong' }), metadata: rootOnlyMetadata() },
    { recordText: canonicalAuthText({ programId: 'wrong' }), metadata: rootOnlyMetadata() },
    { recordText: canonicalAuthText({ configPda: 'wrong' }), metadata: rootOnlyMetadata() },
    { recordText: canonicalAuthText({ artifactRevision: 'wrong' }), metadata: rootOnlyMetadata() },
    { recordText: canonicalAuthText({ artifactBytes: 1 }), metadata: rootOnlyMetadata() },
    { recordText: canonicalAuthText({ artifactSha256: 'c'.repeat(64) }), metadata: rootOnlyMetadata() },
    { recordText: canonicalAuthText({ cliVersion: 'wrong' }), metadata: rootOnlyMetadata() },
    { recordText: canonicalAuthText({ cliSha256: 'c'.repeat(64) }), metadata: rootOnlyMetadata() },
    { recordText: canonicalAuthText({ commitment: 'processed' }), metadata: rootOnlyMetadata() },
    { recordText: canonicalAuthText(), metadata: rootOnlyMetadata(), consumed: true },
    { recordText: canonicalAuthText(), metadata: rootOnlyMetadata(), rpcSha256: 'c'.repeat(64) },
    { recordText: canonicalAuthText({ createdAt: '2026-08-01T00:02:00.000Z' }), metadata: rootOnlyMetadata() },
  ];
  for (const candidate of invalidCases) {
    const result = validateAuthorizationRecord({
      now: '2026-08-01T00:01:00.000Z',
      rpcSha256: endpoint.sha256,
      ...candidate,
    });
    assert.deepEqual(result, { ok: false });
  }
});

test('authorization validation rejects prototype-poisoned and accessor metadata', () => {
  const endpoint = canonicalizeRpcEndpoint(SAFE_RPC);
  const expectedMetadata = {
    uid: 0,
    mode: 0o600,
    isRegularFile: true,
    parentUid: 0,
    parentMode: 0o700,
  };
  const input = {
    recordText: canonicalAuthText(),
    now: '2026-08-01T00:01:00.000Z',
    rpcSha256: endpoint.sha256,
  };

  Object.defineProperties(Object.prototype, Object.fromEntries(
    Object.entries(expectedMetadata).map(([key, value]) => [key, {
      configurable: true,
      value,
    }]),
  ));
  try {
    assert.deepEqual(validateAuthorizationRecord({ ...input, metadata: {} }), { ok: false });
  } finally {
    for (const key of Object.keys(expectedMetadata)) delete Object.prototype[key];
  }

  for (const key of Object.keys(expectedMetadata)) {
    const metadata = { ...expectedMetadata };
    Object.defineProperty(metadata, key, {
      configurable: true,
      get() { return expectedMetadata[key]; },
    });
    assert.deepEqual(validateAuthorizationRecord({ ...input, metadata }), { ok: false });
  }
});

test('authorization metadata requires an exact frozen enumerable data-descriptor topology', () => {
  const endpoint = canonicalizeRpcEndpoint(SAFE_RPC);
  const input = {
    recordText: canonicalAuthText(),
    now: '2026-08-01T00:01:00.000Z',
    rpcSha256: endpoint.sha256,
  };
  // Enumerable is part of the policy: ordinary object-literal provenance facts
  // are enumerable, and the exact descriptor topology prevents hidden variants.
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
      // Legal for a non-configurable but writable target property: this fabricates
      // the expected descriptor value without violating Proxy invariants.
      return { ...descriptor, value: expectedMetadata[key] };
    },
  });
  const frozenIncorrectTarget = Object.freeze({ ...expectedMetadata, uid: 1000 });
  const frozenFabricatingProxy = new Proxy(frozenIncorrectTarget, {
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (!descriptor || !Object.hasOwn(expectedMetadata, key)) return descriptor;
      return { ...descriptor, value: expectedMetadata[key] };
    },
  });
  const nonEnumerableFrozen = { ...expectedMetadata };
  Object.defineProperty(nonEnumerableFrozen, 'uid', { enumerable: false });
  Object.freeze(nonEnumerableFrozen);

  assert.deepEqual(Object.getOwnPropertyDescriptor(sealedFabricatingProxy, 'uid'), {
    value: 0, writable: true, enumerable: true, configurable: false,
  });
  assert.deepEqual(validateAuthorizationRecord({ ...input, metadata: sealedFabricatingProxy }), { ok: false });
  assert.deepEqual(validateAuthorizationRecord({ ...input, metadata: Object.seal({ ...expectedMetadata }) }), { ok: false });
  assert.deepEqual(validateAuthorizationRecord({ ...input, metadata: nonEnumerableFrozen }), { ok: false });
  assert.deepEqual(validateAuthorizationRecord({ ...input, metadata: rootOnlyMetadata() }), {
    ok: true,
    nonce: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
  });
  assert.doesNotThrow(() => {
    assert.deepEqual(validateAuthorizationRecord({ ...input, metadata: frozenFabricatingProxy }), { ok: false });
  });
});

test('policy exports facts only and has no CLI fixture or command assembly helper', () => {
  assert.equal('TRUSTED_RUNTIME_FIXTURE' in gate, false);
  assert.equal('buildFixedCliArgs' in gate, false);
  assert.equal('createNonceState' in gate, false);
  assert.equal('reserveNonce' in gate, false);
  assert.equal(Object.isFrozen(EXPECTED_FIXED_FACTS), true);
  const originalProgramId = EXPECTED_FIXED_FACTS.programId;
  assert.throws(() => { EXPECTED_FIXED_FACTS.programId = 'tampered'; }, TypeError);
  assert.equal(EXPECTED_FIXED_FACTS.programId, originalProgramId);
});

test('nonce lifecycle exports have no forkable registry factory', () => {
  assert.equal('createNonceRegistry' in gate, false);
});

test('module-private singleton nonce state atomically reserves and permanently advances one canonical nonce', () => {
  const nonce = 'b'.repeat(43);

  assert.deepEqual(reserveNonceAtomically(nonce), { ok: true });
  assert.deepEqual(reserveNonceAtomically(nonce), { ok: false });
  assert.deepEqual(markNonceStarted(nonce), { ok: true });
  assert.deepEqual(reserveNonceAtomically(nonce), { ok: false });
  assert.deepEqual(markNonceTerminal(nonce, 'not-an-exit-class'), { ok: false });
  assert.deepEqual(markNonceTerminal(nonce, 'failed'), { ok: true });
  assert.deepEqual(markNonceStarted(nonce), { ok: false });
  assert.deepEqual(markNonceTerminal(nonce, 'failed'), { ok: false });
  assert.deepEqual(reserveNonceAtomically(nonce), { ok: false });
});

test('every singleton nonce lifecycle transition rejects malformed canonical nonces', () => {
  const malformed = ['', 'nonce-1', 'a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}!`, 1, null];
  for (const nonce of malformed) {
    assert.deepEqual(reserveNonceAtomically(nonce), { ok: false });
    assert.deepEqual(markNonceStarted(nonce), { ok: false });
    assert.deepEqual(markNonceTerminal(nonce, 'failed'), { ok: false });
  }
});

test('module-private singleton nonce state ignores public property and prototype tampering', () => {
  const nonce = 'c'.repeat(43);
  assert.equal(Object.getPrototypeOf(gate), null);
  assert.throws(() => { gate.nonceStates = new Map([[nonce, 'started']]); }, TypeError);
  assert.throws(() => Object.setPrototypeOf(gate, { nonceStates: new Map([[nonce, 'started']]) }), TypeError);
  Object.prototype.nonceStates = new Map([[nonce, 'started']]);
  try {
    assert.deepEqual(markNonceStarted(nonce), { ok: false });
    assert.deepEqual(reserveNonceAtomically(nonce), { ok: true });
    assert.deepEqual(markNonceStarted(nonce), { ok: true });
    assert.deepEqual(markNonceTerminal(nonce, 'succeeded'), { ok: true });
  } finally {
    delete Object.prototype.nonceStates;
  }
});

test('cleanup plan cannot remove or modify durable consumed state', () => {
  assert.deepEqual(validateCleanupPlan(['staging', 'reservation']), { ok: true });
  assert.deepEqual(validateCleanupPlan(['reservation', 'consumed']), { ok: false });
  assert.deepEqual(validateCleanupPlan(['consumed/nonce-1/started']), { ok: false });
});

// This test suite exercises pure policy functions only: no filesystem, network, keys, CLI, signing, or send path.
