const STEP5_REVISION = 'f69dab643ac401859a9d21d6aeabf4dab53cf640';
const FORMAT = 'cumzillaraptors-v2-authorization-record-v1';
const SEAL_FORMAT = 'cumzillaraptors-v2-release-seal-v1';
const FIELDS = Object.freeze([
  'format',
  'step5-revision',
  'release-seal-format',
  'release-seal-commit',
  'release-seal-sha256',
  'scope-sha256',
  'issued-at',
  'expires-at',
  'authorization-nonce',
  'preflight-nonce',
]);
const SHA256 = /^[a-f0-9]{64}$/;
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const deny = Object.freeze({ ok: false, authorized: false, reason: 'invalid-input' });
const validatedResults = new WeakSet();

function freeze(value) {
  return Object.freeze(value);
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string' || !RFC3339_UTC.test(value)) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value.replace('Z', '.000Z') ? milliseconds : null;
}

function exactExpected(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.isFrozen(value)
    && Reflect.ownKeys(value).length === 3
    && Reflect.ownKeys(value).every((key, index) => key === ['releaseSealSha256', 'scopeSha256', 'preflightNonce'][index])
    && ['releaseSealSha256', 'scopeSha256', 'preflightNonce'].every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true && descriptor.configurable === false && descriptor.writable === false && SHA256.test(descriptor.value);
    });
}

function parseRecord(text) {
  if (typeof text !== 'string' || !text.endsWith('\n') || text.includes('\r')) return null;
  const lines = text.slice(0, -1).split('\n');
  if (lines.length !== FIELDS.length) return null;
  const value = {};
  for (const [index, field] of FIELDS.entries()) {
    const prefix = `${field}: `;
    if (!lines[index].startsWith(prefix) || lines[index].slice(prefix.length).includes('\t') || lines[index].slice(prefix.length).includes(' ')) return null;
    value[field] = lines[index].slice(prefix.length);
  }
  return value;
}

export function validateR1AuthorizationRecord({ recordText, expected, now }) {
  try {
    if (!exactExpected(expected)) return deny;
    const value = parseRecord(recordText);
    const nowMs = canonicalTimestamp(now);
    if (value === null || nowMs === null) return deny;
    if (value.format !== FORMAT
      || value['step5-revision'] !== STEP5_REVISION
      || value['release-seal-format'] !== SEAL_FORMAT
      || value['release-seal-commit'] !== STEP5_REVISION
      || value['release-seal-sha256'] !== expected.releaseSealSha256
      || value['scope-sha256'] !== expected.scopeSha256
      || !SHA256.test(value['authorization-nonce'])
      || value['preflight-nonce'] !== expected.preflightNonce
      || value['authorization-nonce'] === value['preflight-nonce']) return deny;
    const issuedMs = canonicalTimestamp(value['issued-at']);
    const expiresMs = canonicalTimestamp(value['expires-at']);
    if (issuedMs === null || expiresMs === null || issuedMs > nowMs || expiresMs <= issuedMs || expiresMs <= nowMs) return deny;
    const result = freeze({
      ok: true,
      authorized: false,
      status: 'validated-not-authorized',
      authorizationNonce: value['authorization-nonce'],
      preflightNonce: value['preflight-nonce'],
      issuedAt: value['issued-at'],
      expiresAt: value['expires-at'],
    });
    validatedResults.add(result);
    return result;
  } catch {
    return deny;
  }
}

export function createR1AuthorizationRecordModel({ now }) {
  let currentMs = canonicalTimestamp(now);
  if (currentMs === null) throw new TypeError('Invalid model time.');
  const reserved = new Map();
  const consumed = new Set();

  function reserveValidated(result) {
    if (!validatedResults.has(result)) return deny;
    const issuedMs = canonicalTimestamp(result.issuedAt);
    const expiresMs = canonicalTimestamp(result.expiresAt);
    if (issuedMs === null || expiresMs === null || issuedMs > currentMs) return deny;
    if (consumed.has(result.authorizationNonce) || consumed.has(result.preflightNonce)
      || reserved.has(result.authorizationNonce) || reserved.has(result.preflightNonce)) return freeze({ ok: false, authorized: false, reason: 'nonce-unavailable' });
    if (expiresMs <= currentMs) return freeze({ ok: false, authorized: false, reason: 'expired' });
    consumed.add(result.authorizationNonce);
    consumed.add(result.preflightNonce);
    reserved.set(result.authorizationNonce, freeze({ expiresMs, preflightNonce: result.preflightNonce }));
    return freeze({ ok: true, authorized: false, status: 'reserved-not-authorized' });
  }

  function inspect(authorizationNonce) {
    if (!SHA256.test(authorizationNonce) || !consumed.has(authorizationNonce)) return freeze({ ok: false, authorized: false, reason: 'missing-nonce' });
    const entry = reserved.get(authorizationNonce);
    if (!entry || entry.expiresMs <= currentMs) return freeze({ ok: false, authorized: false, reason: 'expired' });
    return freeze({ ok: true, authorized: false, state: 'reserved-not-authorized', expiresAt: new Date(entry.expiresMs).toISOString().replace('.000Z', 'Z') });
  }

  function advanceTime(next) {
    const nextMs = canonicalTimestamp(next);
    if (nextMs === null || nextMs < currentMs) return freeze({ ok: false, reason: 'invalid-input' });
    currentMs = nextMs;
    return freeze({ ok: true });
  }

  return freeze({ advanceTime, inspect, reserveValidated });
}
