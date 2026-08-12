import { createHash } from 'node:crypto';
import { V2_FIXED_FACTS, V2_PATHS } from './future-send-v2-schema.mjs';

const deny = Object.freeze({ ok: false, reason: 'invalid-input' });
const noncePattern = /^[A-Za-z0-9_-]{43}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const inputFields = Object.freeze(['approval', 'canonicalEndpoint', 'runtimeManifestEndpointSha256']);
const approvalFields = Object.freeze(['ok', 'nonce', 'authorizationSha256', 'endpointBinding']);
const endpointBindingFields = Object.freeze(['authorizationSha256', 'rpcSha256', 'runtimeManifestSha256', 'reviewReportSha256']);

function readExactFrozenDataObject(input, fields) {
  try {
    if (input === null || typeof input !== 'object'
      || Object.getPrototypeOf(input) !== Object.prototype || !Object.isFrozen(input)) return null;
    const keys = Reflect.ownKeys(input);
    if (keys.length !== fields.length || keys.some((key, index) => key !== fields[index])) return null;
    const values = {};
    for (const key of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')
        || descriptor.enumerable !== true || descriptor.writable !== false || descriptor.configurable !== false) return null;
      values[key] = descriptor.value;
    }
    return values;
  } catch {
    return null;
  }
}

function readExactApproval(approval) {
  const exactApproval = readExactFrozenDataObject(approval, approvalFields);
  if (exactApproval === null) return null;
  const endpointBinding = readExactFrozenDataObject(exactApproval.endpointBinding, endpointBindingFields);
  if (endpointBinding === null || exactApproval.ok !== true
    || typeof exactApproval.nonce !== 'string' || !noncePattern.test(exactApproval.nonce)
    || [exactApproval.authorizationSha256, ...Object.values(endpointBinding)].some((digest) => (
      typeof digest !== 'string' || !digestPattern.test(digest)
    )) || exactApproval.authorizationSha256 !== endpointBinding.authorizationSha256) return null;
  return { nonce: exactApproval.nonce, endpointBinding };
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isCanonicalEndpoint(value) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.normalize('NFC')
    || /\s/.test(value) || value.includes('%') || value.includes('#') || value.endsWith('?')) return false;

  const rawAuthority = value.match(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/)?.[1];
  if (rawAuthority?.includes('@')) return false;

  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || !url.hostname || url.port || url.username || url.password || url.hash) return false;

  const query = url.search.slice(1);
  const pairs = [];
  if (query) {
    const names = new Set();
    for (const pair of query.split('&')) {
      const separator = pair.indexOf('=');
      if (separator <= 0 || separator === pair.length - 1 || pair.indexOf('=', separator + 1) !== -1) return false;
      const name = pair.slice(0, separator);
      const parameter = pair.slice(separator + 1);
      if (!/^[A-Za-z0-9._~-]+$/.test(name) || !/^[A-Za-z0-9._~-]+$/.test(parameter) || names.has(name)) return false;
      names.add(name);
      pairs.push([name, parameter]);
    }
  }
  pairs.sort(([leftName, leftValue], [rightName, rightValue]) => (
    leftName === rightName ? (leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0) : (leftName < rightName ? -1 : 1)
  ));
  const canonical = `https://${url.host.toLowerCase()}${url.pathname}${pairs.length === 0 ? '' : `?${pairs.map(([name, parameter]) => `${name}=${parameter}`).join('&')}`}`;
  return value === canonical;
}

export function buildV2CliArgv(input) {
  const exactInput = readExactFrozenDataObject(input, inputFields);
  if (exactInput === null) return deny;
  const approval = readExactApproval(exactInput.approval);
  const { canonicalEndpoint, runtimeManifestEndpointSha256 } = exactInput;
  const endpointSha256 = typeof canonicalEndpoint === 'string' ? sha256(canonicalEndpoint) : null;
  if (approval === null || !isCanonicalEndpoint(canonicalEndpoint)
    || typeof runtimeManifestEndpointSha256 !== 'string' || !digestPattern.test(runtimeManifestEndpointSha256)
    || approval.endpointBinding.rpcSha256 !== endpointSha256
    || runtimeManifestEndpointSha256 !== endpointSha256) return deny;

  const stage = `${V2_PATHS.runtimeRoot}/staging/${approval.nonce}`;
  return Object.freeze([
    `${stage}/solana`,
    'program',
    'deploy',
    '--url',
    canonicalEndpoint,
    '--commitment',
    V2_FIXED_FACTS.commitment,
    '--keypair',
    `${stage}/payer.json`,
    '--program-id',
    `${stage}/program.json`,
    '--upgrade-authority',
    `${stage}/upgrade-authority.json`,
    `${stage}/cumzillaraptors.so`,
  ]);
}
