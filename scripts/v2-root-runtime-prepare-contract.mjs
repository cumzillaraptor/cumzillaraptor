const GUARANTEE = 'No deployment command was invoked. No transaction was signed or sent.';

const CONTRACT = Object.freeze({
  mode: '--prepare',
  candidateRoot: '/opt/cumzillaraptors-send-runtime-candidate-v2',
  commitment: 'confirmed',
  outputFields: Object.freeze(['runtimeManifestSha256', 'endpointOrigin', 'review', 'prepareCompletion']),
  guarantee: GUARANTEE,
});

const DENY = Object.freeze({ ok: false, reason: 'invalid-input' });
const REVIEW_FIELDS = Object.freeze(['observedProgramAbsent', 'observedConfigAbsent', 'commitment']);
const COMPLETION_FIELDS = Object.freeze(['mode', 'guarantee']);
const REPORT_FIELDS = Object.freeze(['runtimeManifestSha256', 'endpointOrigin', 'review', 'prepareCompletion']);

function hasExactFrozenDataFields(value, fields) {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value)) return false;
  if (Object.getOwnPropertyNames(value).length !== fields.length || Object.getOwnPropertySymbols(value).length !== 0) return false;
  if (Object.keys(value).length !== fields.length) return false;
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (Object.keys(value)[index] !== field) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return false;
  }
  return true;
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

export function makePrepareContract() {
  return CONTRACT;
}

export function parsePrepareRequest(input) {
  try {
    if (Array.isArray(input) && input.length === 1 && input[0] === '--prepare') {
      return Object.freeze({ ok: true, contract: CONTRACT });
    }
  } catch {}
  return DENY;
}

export function validatePrepareReport(input) {
  try {
    if (hasExactFrozenDataFields(input, REPORT_FIELDS)
      && /^[0-9a-f]{64}$/.test(input.runtimeManifestSha256)
      && isHttpsOrigin(input.endpointOrigin)
      && hasExactFrozenDataFields(input.review, REVIEW_FIELDS)
      && input.review.observedProgramAbsent === true
      && input.review.observedConfigAbsent === true
      && input.review.commitment === 'confirmed'
      && hasExactFrozenDataFields(input.prepareCompletion, COMPLETION_FIELDS)
      && input.prepareCompletion.mode === 'FRESH PRE-SIGN REVIEW COMPLETE'
      && input.prepareCompletion.guarantee === GUARANTEE) return Object.freeze({ ok: true, value: input });
  } catch {}
  return DENY;
}
