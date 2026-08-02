import { EXPECTED_FIXED_FACTS, validateAuthorizationRecord } from './future-send-gate.mjs';

// This is an injected-facts-only preflight model. It deliberately performs no
// I/O and exposes no operational decision, command, or argument data.
const HEX_256 = /^[a-f0-9]{64}$/;

function deny(reason) {
  return Object.freeze({ ok: false, reason });
}

function hasDigest(value) {
  return typeof value === 'string' && HEX_256.test(value);
}

function isPlainDataRecord(value, requireNonExtensible = false) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (requireNonExtensible && Object.isExtensible(value)) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) => (
    Object.hasOwn(descriptor, 'value')
  ));
}

function ownDataValue(record, key) {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function evaluateValidatedNoSendPreflight(input) {
  if (!isPlainDataRecord(input)) return deny('invalid-input');

  const authorization = ownDataValue(input, 'authorization');
  if (authorization === undefined) return deny('missing-authorization');
  if (!isPlainDataRecord(authorization)) return deny('invalid-input');

  const metadata = ownDataValue(authorization, 'metadata');
  // This baseline rejects malformed metadata without dereferencing fields; the
  // policy validator below additionally requires its exact frozen descriptor
  // topology before any authorization can pass through this guard.
  if (!isPlainDataRecord(metadata, true)) return deny('invalid-input');

  const review = ownDataValue(input, 'review');
  const final = ownDataValue(input, 'final');
  const nonce = ownDataValue(input, 'nonce');
  const paths = ownDataValue(input, 'paths');
  const stage = ownDataValue(input, 'stage');
  if (![review, final, nonce, paths, stage].every((record) => isPlainDataRecord(record))) return deny('invalid-input');

  const authorizationResult = validateAuthorizationRecord({
    recordText: ownDataValue(authorization, 'recordText'),
    metadata,
    now: ownDataValue(input, 'now'),
    rpcSha256: ownDataValue(review, 'endpointSha256'),
    // Nonce state has a dedicated non-secret result below.
    consumed: false,
  });
  if (!authorizationResult.ok) return deny('invalid-authorization');

  if (ownDataValue(nonce, 'consumed') === true) return deny('nonce-consumed');
  if (ownDataValue(nonce, 'reserved') === true) return deny('nonce-reserved');

  if (ownDataValue(paths, 'ok') !== true || ownDataValue(paths, 'manifestOk') !== true) return deny('path-manifest-failure');

  if (ownDataValue(stage, 'ok') !== true) return deny('stage-failure');

  if (ownDataValue(review, 'rpcOk') !== true || ownDataValue(final, 'rpcOk') !== true) return deny('rpc-failure');

  const reviewEndpointSha256 = ownDataValue(review, 'endpointSha256');
  const finalEndpointSha256 = ownDataValue(final, 'endpointSha256');
  if (!hasDigest(reviewEndpointSha256)
    || !hasDigest(finalEndpointSha256)
    || reviewEndpointSha256 !== finalEndpointSha256) return deny('endpoint-digest-mismatch');

  const reviewCommitment = ownDataValue(review, 'commitment');
  const finalCommitment = ownDataValue(final, 'commitment');
  if (reviewCommitment !== 'confirmed'
    || finalCommitment !== 'confirmed'
    || reviewCommitment !== finalCommitment) return deny('commitment-mismatch');

  if (ownDataValue(review, 'genesisHash') !== EXPECTED_FIXED_FACTS.devnetGenesisHash
    || ownDataValue(final, 'genesisHash') !== EXPECTED_FIXED_FACTS.devnetGenesisHash) return deny('genesis-mismatch');

  if (ownDataValue(review, 'programAbsent') !== true || ownDataValue(final, 'programAbsent') !== true) return deny('program-exists');
  if (ownDataValue(review, 'configAbsent') !== true || ownDataValue(final, 'configAbsent') !== true) return deny('config-exists');

  // No live authorization creation or send enablement exists in this phase.
  return deny('send-disabled-no-live-authorization');
}

function evaluateNoSendPreflight(input = {}) {
  try {
    return evaluateValidatedNoSendPreflight(input);
  } catch {
    return deny('invalid-input');
  }
}

export { evaluateNoSendPreflight };
