import { createHash, createPublicKey, verify } from 'node:crypto';
import {
  ATTESTATION_FIELDS,
  AUTHORIZATION_FIELDS,
  V2_FIXED_FACTS,
  V2_PATHS,
  parseCanonicalObject,
} from './future-send-v2-schema.mjs';

const deny = Object.freeze({ ok: false, reason: 'invalid-input' });
const approverFingerprint = 'ea5ddbe12db55497383514c65f197619d3e955b0a22c9cd79f9d65c71072422c';
const reviewerFingerprint = '653142d085748773346d236a0c45eb32ae6c5b30d84e8e99a1a110a380de7a26';
const provenanceFields = Object.freeze([
  'pathname', 'isRegularFile', 'uid', 'mode', 'parentUid', 'parentMode',
  'parentIsDirectory', 'fingerprint', 'runtimeManifestFingerprint',
]);
const authorizationText = 'one Devnet program deployment attempt only';
const exclusionsText = 'No launch initialization, collection creation, minting, claims, payments, uploads, authority changes, upgrades, mainnet, or other transactions.';
const sha256 = /^[a-f0-9]{64}$/;
const nonce = /^[A-Za-z0-9_-]{43}$/;
const detached = /^[A-Za-z0-9_-]{86}$/;
const publicPem = /^-----BEGIN PUBLIC KEY-----\n(?:[A-Za-z0-9+/]{64}\n)*[A-Za-z0-9+/]{1,63}={0,2}\n-----END PUBLIC KEY-----\n$/;

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function exactProvenance(value, pathname, expectedFingerprint) {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Object.keys(value);
  if (keys.length !== provenanceFields.length || keys.some((key, index) => key !== provenanceFields[index])) return false;
  return value.pathname === pathname
    && value.isRegularFile === true
    && value.uid === 0
    && value.mode === 0o600
    && value.parentUid === 0
    && value.parentMode === 0o700
    && value.parentIsDirectory === true
    && value.fingerprint === expectedFingerprint
    && value.runtimeManifestFingerprint === expectedFingerprint;
}

function fingerprint(publicKey) {
  if (typeof publicKey !== 'string' || !publicPem.test(publicKey)) return null;
  try {
    return createHash('sha256').update(createPublicKey(publicKey).export({ type: 'spki', format: 'der' })).digest('hex');
  } catch {
    return null;
  }
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}

function validFacts(value) {
  if (!nonce.test(value.nonce ?? '')) return false;
  if (!sha256.test(value.rpcSha256 ?? '') || !sha256.test(value.runtimeManifestSha256 ?? '') || !sha256.test(value.reviewReportSha256 ?? '')) return false;
  for (const [key, expected] of Object.entries(V2_FIXED_FACTS)) {
    if (key !== 'cluster' && value[key] !== expected) return false;
  }
  return value.observedProgramAbsent === true && value.observedConfigAbsent === true;
}

function validDetached(value) {
  if (typeof value !== 'string' || !detached.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === 64 ? decoded : null;
}

function verified(publicKey, record, signature) {
  const decoded = validDetached(signature);
  if (decoded === null) return false;
  try {
    return verify(null, record, createPublicKey(publicKey), decoded);
  } catch {
    return false;
  }
}

export function validateV2ApprovalBundle(input) {
  try {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) return deny;
    const authorization = parseCanonicalObject(input.authorizationText, AUTHORIZATION_FIELDS);
    const attestation = parseCanonicalObject(input.attestationText, ATTESTATION_FIELDS);
    if (!authorization.ok || !attestation.ok) return deny;

    const authorizationValue = authorization.value;
    const attestationValue = attestation.value;
    const approverPath = `${V2_PATHS.authorizationRoot}/approver.pub`;
    const reviewerPath = `${V2_PATHS.authorizationRoot}/reviewer.pub`;
    const actualApproverFingerprint = fingerprint(input.approverPublicKey);
    const actualReviewerFingerprint = fingerprint(input.reviewerPublicKey);
    if (actualApproverFingerprint !== approverFingerprint || actualReviewerFingerprint !== reviewerFingerprint || actualApproverFingerprint === actualReviewerFingerprint) return deny;
    if (!exactProvenance(input.approverProvenance, approverPath, actualApproverFingerprint)
      || !exactProvenance(input.reviewerProvenance, reviewerPath, actualReviewerFingerprint)) return deny;
    if (!verified(input.approverPublicKey, input.authorizationText, input.approverSignature)
      || !verified(input.reviewerPublicKey, input.attestationText, input.reviewerSignature)) return deny;

    if (!validFacts(authorizationValue) || !validFacts({ ...attestationValue, nonce: authorizationValue.nonce })) return deny;
    if (authorizationValue.authorization !== authorizationText || authorizationValue.exclusions !== exclusionsText) return deny;
    if (!sha256.test(attestationValue.authorizationSha256 ?? '') || attestationValue.authorizationSha256 !== digest(input.authorizationText)) return deny;
    if (attestationValue.rpcSha256 !== authorizationValue.rpcSha256
      || attestationValue.runtimeManifestSha256 !== authorizationValue.runtimeManifestSha256
      || attestationValue.reviewReportSha256 !== authorizationValue.reviewReportSha256
      || attestationValue.createdAt !== authorizationValue.createdAt
      || attestationValue.expiresAt !== authorizationValue.expiresAt) return deny;
    if (!validTimestamp(authorizationValue.createdAt) || !validTimestamp(authorizationValue.expiresAt) || !validTimestamp(input.now)) return deny;
    const created = Date.parse(authorizationValue.createdAt);
    const expires = Date.parse(authorizationValue.expiresAt);
    const now = Date.parse(input.now);
    if (created > now || expires <= created || expires <= now) return deny;

    const endpointBinding = Object.freeze({
      authorizationSha256: attestationValue.authorizationSha256,
      rpcSha256: authorizationValue.rpcSha256,
      runtimeManifestSha256: authorizationValue.runtimeManifestSha256,
      reviewReportSha256: authorizationValue.reviewReportSha256,
    });
    return Object.freeze({
      ok: true,
      nonce: authorizationValue.nonce,
      authorizationSha256: attestationValue.authorizationSha256,
      endpointBinding,
    });
  } catch {
    return deny;
  }
}
