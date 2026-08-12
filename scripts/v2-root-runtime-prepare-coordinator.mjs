import { parsePrepareRequest } from './v2-root-runtime-prepare-contract.mjs';
import { evaluateV2RootRuntimeProvenance } from './v2-root-runtime-provenance.mjs';

const DENY = Object.freeze({ ok: false, reason: 'invalid-input' });
const ADAPTER_FIELDS = Object.freeze([
  'collectProvenance', 'readEndpointDigest', 'runUnsignedReview', 'sanitizeReport',
]);
const REVIEW_FIELDS = Object.freeze([
  'observedProgramAbsent', 'observedConfigAbsent', 'commitment',
]);
const SAFE_REPORT_FIELDS = Object.freeze(['runtimeManifestSha256', 'endpointOrigin']);
const GUARANTEE = 'No deployment command was invoked. No transaction was signed or sent.';

function isExactFrozenObject(value, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value)
    || Object.getOwnPropertySymbols(value).length !== 0) return false;
  const keys = Object.keys(value);
  if (keys.length !== fields.length || keys.some((key, index) => key !== fields[index])) return false;
  return fields.every((field) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    return descriptor && descriptor.enumerable && 'value' in descriptor;
  });
}

function validAdapters(adapters) {
  return isExactFrozenObject(adapters, ADAPTER_FIELDS)
    && ADAPTER_FIELDS.every((field) => typeof adapters[field] === 'function');
}

function parseCanonicalReview(text) {
  if (typeof text !== 'string') return null;
  let review;
  try {
    review = JSON.parse(text);
  } catch {
    return null;
  }
  if (review === null || Array.isArray(review) || Object.getPrototypeOf(review) !== Object.prototype) return null;
  const keys = Object.keys(review);
  if (keys.length !== REVIEW_FIELDS.length || keys.some((key, index) => key !== REVIEW_FIELDS[index])
    || JSON.stringify(review) !== text
    || review.observedProgramAbsent !== true
    || review.observedConfigAbsent !== true
    || review.commitment !== 'confirmed') return null;
  return Object.freeze(review);
}

function isHttpsOrigin(value) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && parsed.username === ''
      && parsed.password === ''
      && parsed.port === ''
      && parsed.pathname === '/'
      && parsed.search === ''
      && parsed.hash === ''
      && parsed.origin === value;
  } catch {
    return false;
  }
}

function validSafeReport(report, runtimeManifestSha256) {
  return isExactFrozenObject(report, SAFE_REPORT_FIELDS)
    && report.runtimeManifestSha256 === runtimeManifestSha256
    && isHttpsOrigin(report.endpointOrigin);
}

export function coordinatePrepare(argv, adapters) {
  try {
    if (parsePrepareRequest(argv).ok !== true || !validAdapters(adapters)) return DENY;

    const provenance = evaluateV2RootRuntimeProvenance(adapters.collectProvenance());
    if (provenance.ok !== true) return DENY;

    const endpointDigest = adapters.readEndpointDigest();
    if (endpointDigest !== provenance.value.endpointOrigin.endpointDigest) return DENY;

    const review = parseCanonicalReview(adapters.runUnsignedReview());
    if (review === null) return DENY;

    const report = adapters.sanitizeReport();
    if (!validSafeReport(report, provenance.value.runtimeManifestSha256)) return DENY;

    return Object.freeze({
      runtimeManifestSha256: report.runtimeManifestSha256,
      endpointOrigin: report.endpointOrigin,
      review,
      prepareCompletion: Object.freeze({
        mode: 'FRESH PRE-SIGN REVIEW COMPLETE',
        guarantee: GUARANTEE,
      }),
    });
  } catch {
    return DENY;
  }
}
