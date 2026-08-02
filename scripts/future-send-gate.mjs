import { createHash } from 'node:crypto';

// Pure policy data only. This module intentionally has no filesystem, process,
// network, key, transaction-construction/serialization, signing, or CLI-spawn capability.
const EXPECTED_FIXED_FACTS = Object.freeze({
  cluster: 'devnet',
  devnetGenesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  programId: '2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2',
  configPda: '7LbuHZ2GJURn3wBfqFNgxQgDgjRv8x1nAhWntfdwiMQ',
  artifactRevision: 'f1e9755d0c081341231bfadf50f06e4170a59065',
  artifactBytes: 287632,
  artifactSha256: 'f969f6bcb11d5bfea9a528963fce7c29e553666b5895747e3ab0c4bea051b29d',
  cliVersion: 'v1.18.26',
  cliSha256: '1ef9999ed4bce11226170a312775c8b6439f54331ac4bf249957d587deda6852',
});

const AUTHORIZATION_FIELDS = Object.freeze([
  'formatVersion', 'nonce', 'createdAt', 'expiresAt', 'devnetGenesisHash',
  'rpcSha256', 'commitment', 'programId', 'configPda', 'artifactRevision',
  'artifactBytes', 'artifactSha256', 'cliVersion', 'cliSha256',
  'runtimeManifestSha256', 'reviewReportSha256', 'observedProgramAbsent',
  'observedConfigAbsent', 'authorization', 'exclusions',
]);

const AUTHORIZATION_TEXT = 'one Devnet program deployment attempt only';
const EXCLUSIONS_TEXT = 'No launch initialization, collection creation, minting, claims, payments, uploads, authority changes, upgrades, mainnet, or other transactions.';
const HEX_256 = /^[a-f0-9]{64}$/;
const NONCE = /^[A-Za-z0-9_-]{43}$/;


function endpointError() {
  // Deliberately generic: endpoint paths, query strings, and userinfo can be secrets.
  return new Error('Invalid RPC endpoint.');
}

function sha256Utf8(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalizeRpcEndpoint(value) {
  if (typeof value !== 'string' || value.length === 0 || /\s/.test(value) || value.includes('%') || value.endsWith('?')) throw endpointError();
  const rawAuthority = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/.exec(value)?.[1];
  if (rawAuthority?.includes('@')) throw endpointError();

  let url;
  try {
    url = new URL(value);
  } catch {
    throw endpointError();
  }

  if (url.protocol.toLowerCase() !== 'https:' || url.hash || url.port || url.username || url.password) throw endpointError();
  if (!url.hostname || url.protocol !== 'https:') throw endpointError();

  const rawQuery = url.search.slice(1);
  const pairs = [];
  if (rawQuery) {
    const seenNames = new Set();
    for (const part of rawQuery.split('&')) {
      const separator = part.indexOf('=');
      if (separator <= 0 || separator === part.length - 1 || part.indexOf('=', separator + 1) !== -1) throw endpointError();
      const name = part.slice(0, separator);
      const parameterValue = part.slice(separator + 1);
      if (!/^[A-Za-z0-9._~-]+$/.test(name) || !/^[A-Za-z0-9._~-]+$/.test(parameterValue) || seenNames.has(name)) throw endpointError();
      seenNames.add(name);
      pairs.push([name, parameterValue]);
    }
  }
  pairs.sort(([leftName, leftValue], [rightName, rightValue]) => (
    leftName === rightName ? (leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0) : (leftName < rightName ? -1 : 1)
  ));

  const canonical = `https://${url.host.toLowerCase()}${url.pathname}${pairs.length ? `?${pairs.map(([name, parameterValue]) => `${name}=${parameterValue}`).join('&')}` : ''}`;
  return Object.freeze({
    canonical,
    sha256: sha256Utf8(canonical),
    origin: `https://${url.host.toLowerCase()}`,
  });
}

function isCanonicalTimestamp(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function hasExpectedMetadata(metadata) {
  return Boolean(metadata)
    && metadata.uid === 0
    && metadata.mode === 0o600
    && metadata.isRegularFile === true
    && metadata.parentUid === 0
    && metadata.parentMode === 0o700;
}

function hasCanonicalStrings(record) {
  return Object.values(record).every((value) => typeof value !== 'string' || value.normalize('NFC') === value);
}

function validateAuthorizationRecord({ recordText, metadata, now, rpcSha256, consumed = false } = {}) {
  // This is intentionally a default-deny parser for text and caller-supplied
  // metadata. It neither reads a record nor inspects filesystem ownership.
  if (consumed || typeof recordText !== 'string' || !hasExpectedMetadata(metadata) || !HEX_256.test(rpcSha256 ?? '')) return { ok: false };

  let record;
  try {
    // Canonical JSON parsing/stringification validates authorization-record text;
    // it is not transaction serialization and this module has no transaction APIs.
    record = JSON.parse(recordText);
  } catch {
    return { ok: false };
  }
  if (!record || Array.isArray(record) || Object.getPrototypeOf(record) !== Object.prototype) return { ok: false };
  if (Object.keys(record).join('\0') !== AUTHORIZATION_FIELDS.join('\0') || JSON.stringify(record) !== recordText || !hasCanonicalStrings(record)) return { ok: false };

  const nowDate = new Date(now);
  if (!isCanonicalTimestamp(now) || !isCanonicalTimestamp(record.createdAt) || !isCanonicalTimestamp(record.expiresAt) || new Date(record.createdAt) > nowDate || nowDate >= new Date(record.expiresAt) || new Date(record.createdAt) > new Date(record.expiresAt)) return { ok: false };

  if (record.formatVersion !== 1 || !NONCE.test(record.nonce)
    || record.devnetGenesisHash !== EXPECTED_FIXED_FACTS.devnetGenesisHash
    || record.rpcSha256 !== rpcSha256
    || record.commitment !== 'confirmed'
    || record.programId !== EXPECTED_FIXED_FACTS.programId
    || record.configPda !== EXPECTED_FIXED_FACTS.configPda
    || record.artifactRevision !== EXPECTED_FIXED_FACTS.artifactRevision
    || record.artifactBytes !== EXPECTED_FIXED_FACTS.artifactBytes
    || record.artifactSha256 !== EXPECTED_FIXED_FACTS.artifactSha256
    || record.cliVersion !== EXPECTED_FIXED_FACTS.cliVersion
    || record.cliSha256 !== EXPECTED_FIXED_FACTS.cliSha256
    || !HEX_256.test(record.runtimeManifestSha256)
    || !HEX_256.test(record.reviewReportSha256)
    || record.observedProgramAbsent !== true
    || record.observedConfigAbsent !== true
    || record.authorization !== AUTHORIZATION_TEXT
    || record.exclusions !== EXCLUSIONS_TEXT) return { ok: false };

  return { ok: true, nonce: record.nonce };
}

// This closure-private singleton models the protected runtime's durable nonce
// state. It is deliberately neither exported nor attached to any public object.
const NONCE_STATES = new Map();
const NONCE_RESERVED = 'reserved';
const NONCE_STARTED = 'started';
const NONCE_TERMINAL = 'terminal';
const NONCE_EXIT_CLASSES = new Set(['succeeded', 'failed', 'interrupted']);
const REGISTRY_OK = Object.freeze({ ok: true });
const REGISTRY_DENIED = Object.freeze({ ok: false });

function isCanonicalNonce(nonce) {
  return typeof nonce === 'string' && NONCE.test(nonce);
}

function reserveNonceAtomically(nonce) {
  // Models the protected runtime's root-owned atomic mkdir reservation. This
  // in-memory transition has no await or I/O between check and insertion.
  if (!isCanonicalNonce(nonce) || NONCE_STATES.has(nonce)) return REGISTRY_DENIED;
  NONCE_STATES.set(nonce, NONCE_RESERVED);
  return REGISTRY_OK;
}

function markNonceStarted(nonce) {
  if (!isCanonicalNonce(nonce) || NONCE_STATES.get(nonce) !== NONCE_RESERVED) return REGISTRY_DENIED;
  NONCE_STATES.set(nonce, NONCE_STARTED);
  return REGISTRY_OK;
}

function markNonceTerminal(nonce, exitClass) {
  if (!isCanonicalNonce(nonce) || NONCE_STATES.get(nonce) !== NONCE_STARTED || !NONCE_EXIT_CLASSES.has(exitClass)) return REGISTRY_DENIED;
  NONCE_STATES.set(nonce, NONCE_TERMINAL);
  return REGISTRY_OK;
}

function validateCleanupPlan(targets) {
  if (!Array.isArray(targets) || targets.some((target) => typeof target !== 'string' || target === 'consumed' || target.startsWith('consumed/'))) return { ok: false };
  return targets.every((target) => target === 'staging' || target === 'reservation') ? { ok: true } : { ok: false };
}

export {
  EXPECTED_FIXED_FACTS,
  canonicalizeRpcEndpoint,
  markNonceStarted,
  markNonceTerminal,
  reserveNonceAtomically,
  validateAuthorizationRecord,
  validateCleanupPlan,
};
