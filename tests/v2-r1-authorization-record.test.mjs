import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const STEP5_REVISION = 'f69dab643ac401859a9d21d6aeabf4dab53cf640';
const SEAL = 'a'.repeat(64);
const SCOPE = 'b'.repeat(64);
const PREFLIGHT = 'c'.repeat(64);
const AUTH_NONCE = 'd'.repeat(64);
const PREFLIGHT_NONCE = 'e'.repeat(64);

function record(overrides = {}) {
  const fields = {
    format: 'cumzillaraptors-v2-authorization-record-v1',
    'step5-revision': STEP5_REVISION,
    'release-seal-format': 'cumzillaraptors-v2-release-seal-v1',
    'release-seal-commit': STEP5_REVISION,
    'release-seal-sha256': SEAL,
    'scope-sha256': SCOPE,
    'issued-at': '2026-08-13T21:00:00Z',
    'expires-at': '2026-08-13T21:05:00Z',
    'authorization-nonce': AUTH_NONCE,
    'preflight-nonce': PREFLIGHT_NONCE,
    ...overrides,
  };
  return [
    `format: ${fields.format}`,
    `step5-revision: ${fields['step5-revision']}`,
    `release-seal-format: ${fields['release-seal-format']}`,
    `release-seal-commit: ${fields['release-seal-commit']}`,
    `release-seal-sha256: ${fields['release-seal-sha256']}`,
    `scope-sha256: ${fields['scope-sha256']}`,
    `issued-at: ${fields['issued-at']}`,
    `expires-at: ${fields['expires-at']}`,
    `authorization-nonce: ${fields['authorization-nonce']}`,
    `preflight-nonce: ${fields['preflight-nonce']}`,
  ].join('\n') + '\n';
}

const expected = Object.freeze({
  releaseSealSha256: SEAL,
  scopeSha256: SCOPE,
  preflightNonce: PREFLIGHT_NONCE,
});

function denied(value) {
  assert.deepEqual(value, { ok: false, authorized: false, reason: 'invalid-input' });
  assert.equal(Object.isFrozen(value), true);
}

test('r1 authorization-record validator accepts only canonical schema text and returns a frozen non-authorization result', async () => {
  const { validateR1AuthorizationRecord } = await import('../scripts/v2-r1-authorization-record.mjs');
  const result = validateR1AuthorizationRecord({ recordText: record(), expected, now: '2026-08-13T21:01:00Z' });

  assert.deepEqual(result, {
    ok: true,
    authorized: false,
    status: 'validated-not-authorized',
    authorizationNonce: AUTH_NONCE,
    preflightNonce: PREFLIGHT_NONCE,
    issuedAt: '2026-08-13T21:00:00Z',
    expiresAt: '2026-08-13T21:05:00Z',
  });
  assert.equal(Object.isFrozen(result), true);
});

test('r1 authorization-record validator fails closed for binding, grammar, expiry, and nonce failures', async () => {
  const { validateR1AuthorizationRecord } = await import('../scripts/v2-r1-authorization-record.mjs');
  const cases = [
    { recordText: record({ 'step5-revision': '0'.repeat(40) }) },
    { recordText: record({ 'release-seal-commit': '0'.repeat(40) }) },
    { recordText: record({ 'release-seal-sha256': '0'.repeat(64) }) },
    { recordText: record({ 'scope-sha256': '0'.repeat(64) }) },
    { recordText: record({ 'preflight-nonce': '0'.repeat(64) }) },
    { recordText: record({ 'authorization-nonce': PREFLIGHT_NONCE }) },
    { recordText: record({ 'expires-at': '2026-08-13T21:00:00Z' }) },
    { recordText: record(), now: '2026-08-13T21:05:00Z' },
    { recordText: `${record()}signature: forbidden\n` },
    { recordText: record().replace('format:', 'step5-revision:') },
    { recordText: record().slice(0, -1) },
    { recordText: record(), expected: { ...expected, scopeSha256: '0'.repeat(64) } },
  ];
  for (const input of cases) denied(validateR1AuthorizationRecord({ expected, now: '2026-08-13T21:01:00Z', ...input }));
  const hidden = Object.freeze(Object.defineProperty({ ...expected }, 'hidden', { value: 'x', enumerable: false }));
  const symbolExtra = Object.freeze({ ...expected, [Symbol('extra')]: 'x' });
  denied(validateR1AuthorizationRecord({ recordText: record(), expected: hidden, now: '2026-08-13T21:01:00Z' }));
  denied(validateR1AuthorizationRecord({ recordText: record(), expected: symbolExtra, now: '2026-08-13T21:01:00Z' }));
});

test('in-memory authorization-record model prevents replay and expiry without accepting authorization', async () => {
  const { createR1AuthorizationRecordModel, validateR1AuthorizationRecord } = await import('../scripts/v2-r1-authorization-record.mjs');
  const validated = validateR1AuthorizationRecord({ recordText: record(), expected, now: '2026-08-13T21:01:00Z' });
  const model = createR1AuthorizationRecordModel({ now: '2026-08-13T21:01:00Z' });

  assert.deepEqual(model.reserveValidated(validated), { ok: true, authorized: false, status: 'reserved-not-authorized' });
  assert.deepEqual(model.reserveValidated(validated), { ok: false, authorized: false, reason: 'nonce-unavailable' });
  assert.deepEqual(model.inspect(AUTH_NONCE), { ok: true, authorized: false, state: 'reserved-not-authorized', expiresAt: '2026-08-13T21:05:00Z' });
  assert.deepEqual(model.advanceTime('2026-08-13T21:05:00Z'), { ok: true });
  assert.deepEqual(model.inspect(AUTH_NONCE), { ok: false, authorized: false, reason: 'expired' });
  assert.deepEqual(model.reserveValidated(validated), { ok: false, authorized: false, reason: 'nonce-unavailable' });
  assert.deepEqual(model.reserveValidated(Object.freeze({ ...validated })), { ok: false, authorized: false, reason: 'invalid-input' });
  const beforeIssue = createR1AuthorizationRecordModel({ now: '2026-08-13T20:59:00Z' });
  assert.deepEqual(beforeIssue.reserveValidated(validated), { ok: false, authorized: false, reason: 'invalid-input' });
  assert.deepEqual(Object.keys(model).sort(), ['advanceTime', 'inspect', 'reserveValidated']);
});

test('r1 authorization-record source remains pure and cannot sign, verify signatures, persist, or execute', async () => {
  const source = await readFile(new URL('../scripts/v2-r1-authorization-record.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:(?:fs|child_process|net|http|https|tls)|\b(?:createHash|sign|verify|createPublicKey|createPrivateKey|generateKeyPair|readFile|writeFile|mkdir|rename|spawn|exec|fetch|solana|deploy|send)\b/i);
});

// Pure text/object validation and in-memory replay model only: no signatures, host state, keys, RPC, or deployment.
