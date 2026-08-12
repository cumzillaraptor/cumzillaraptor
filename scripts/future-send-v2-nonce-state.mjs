import { createHash } from 'node:crypto';
import {
  STARTED_FIELDS,
  TERMINAL_FIELDS,
  V2_PATHS,
  parseCanonicalObject,
} from './future-send-v2-schema.mjs';

const deny = Object.freeze({ ok: false, reason: 'invalid-input' });
const noncePattern = /^[A-Za-z0-9_-]{43}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const directoryFields = Object.freeze(['pathname', 'isDirectory', 'isSymlink', 'uid', 'mode']);
const fileFields = Object.freeze(['pathname', 'text', 'isRegularFile', 'isSymlink', 'uid', 'mode']);
const cleanupNames = new Set(['reservation', 'staging']);

function plainValues(value, required, optional = []) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string' || !allowed.has(key))
    || required.some((key) => !Object.hasOwn(value, key))) return null;
  const result = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) return null;
    result[key] = descriptor.value;
  }
  return result;
}

function deeplyFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value) || !Object.isFrozen(value)) return false;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !deeplyFrozenValue(descriptor.value, seen)) return false;
  }
  return true;
}

function deeplyFrozenValue(value, seen) {
  return value === null || typeof value !== 'object' || deeplyFrozen(value, seen);
}

function directory(value, pathname) {
  const entry = plainValues(value, directoryFields);
  if (entry === null || entry.pathname !== pathname || entry.isDirectory !== true
    || entry.isSymlink !== false || entry.uid !== 0 || entry.mode !== 0o700) return false;
  return true;
}

function stateFile(value, pathname) {
  const file = plainValues(value, fileFields);
  if (file === null || file.pathname !== pathname || typeof file.text !== 'string'
    || file.isRegularFile !== true || file.isSymlink !== false || file.uid !== 0 || file.mode !== 0o600) return null;
  return file.text;
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}

function digest(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function validCleanup(value) {
  if (!Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value).filter((key) => key !== 'length');
  if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) return false;
  const names = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string') return false;
    names.push(descriptor.value);
  }
  return names.every((name) => cleanupNames.has(name)) && new Set(names).size === names.length;
}

function validHistory(state, priorState, consumedHistory) {
  return (state === 'absent' && priorState === 'absent' && consumedHistory === 'absent')
    || (state === 'reserved' && priorState === 'absent' && consumedHistory === 'absent')
    || (state === 'started' && priorState === 'reserved' && consumedHistory === 'consumed')
    || (state === 'terminal' && priorState === 'started' && consumedHistory === 'consumed');
}

function stagedPaths(value) {
  const stage = `${V2_PATHS.runtimeRoot}/staging/${value.nonce}`;
  return value.stagedCli === `${stage}/sol` + 'ana'
    && value.stagedPayer === `${stage}/payer.json`
    && value.stagedProgram === `${stage}/program.json`
    && value.stagedUpgradeAuthority === `${stage}/upgrade-authority.json`
    && value.stagedArtifact === `${stage}/cumzillaraptors.so`;
}

function startedRecord(text, nonce) {
  const parsed = parseCanonicalObject(text, STARTED_FIELDS);
  if (!parsed.ok) return null;
  const value = parsed.value;
  if (value.nonce !== nonce || value.state !== 'started' || !digestPattern.test(value.authorizationSha256)
    || !digestPattern.test(value.runtimeManifestSha256) || !validTimestamp(value.createdAt)
    || !stagedPaths(value)) return null;
  return value;
}

function terminalRecord(text, nonce, startedText, started) {
  const parsed = parseCanonicalObject(text, TERMINAL_FIELDS);
  if (!parsed.ok) return null;
  const value = parsed.value;
  if (value.nonce !== nonce || value.authorizationSha256 !== started.authorizationSha256
    || value.startedSha256 !== digest(startedText) || !validTimestamp(value.completedAt)
    || Date.parse(value.completedAt) < Date.parse(started.createdAt) || value.state !== 'terminal'
    || !['succeeded', 'failed', 'interrupted'].includes(value.exitClass)) return null;
  return value;
}

function objectNames(value, expected) {
  if (!Array.isArray(value) || value.length !== expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.value !== expected[index]) return false;
  }
  return Reflect.ownKeys(value).every((key) => key === 'length' || /^\d+$/.test(key));
}

function layoutFor(input) {
  if (!deeplyFrozen(input.layout)) return null;
  const expectedNames = input.state === 'terminal' ? ['started.json', 'terminal.json']
    : input.state === 'started' ? ['started.json'] : [];
  const required = ['consumedRoot', 'nonceDirectory', 'objectNames'];
  if (input.state === 'started' || input.state === 'terminal') required.push('started');
  if (input.state === 'terminal') required.push('terminal');
  const layout = plainValues(input.layout, required);
  const nonceDirectory = `${V2_PATHS.consumedRoot}/${input.nonce}`;
  if (layout === null || !directory(layout.consumedRoot, V2_PATHS.consumedRoot)
    || !directory(layout.nonceDirectory, nonceDirectory) || !objectNames(layout.objectNames, expectedNames)) return null;
  if (input.state === 'absent' || input.state === 'reserved') return { state: input.state };

  const startedText = stateFile(layout.started, `${nonceDirectory}/started.json`);
  const started = startedText === null ? null : startedRecord(startedText, input.nonce);
  if (started === null) return null;
  if (input.state === 'started') return { state: 'started' };

  const terminalText = stateFile(layout.terminal, `${nonceDirectory}/terminal.json`);
  const terminal = terminalText === null ? null : terminalRecord(terminalText, input.nonce, startedText, started);
  return terminal === null ? null : { state: 'terminal', exitClass: terminal.exitClass };
}

function validate(snapshot) {
  const input = plainValues(snapshot, ['nonce', 'state', 'priorState', 'consumedHistory', 'layout'], ['cleanup']);
  if (input === null || typeof input.nonce !== 'string' || !noncePattern.test(input.nonce)
    || !['absent', 'reserved', 'started', 'terminal'].includes(input.state)
    || !validHistory(input.state, input.priorState, input.consumedHistory)
    || (input.cleanup !== undefined && !validCleanup(input.cleanup))) return null;
  return layoutFor(input);
}

export function validateV2NonceSnapshot(snapshot) {
  try {
    const result = validate(snapshot);
    return result === null ? deny : Object.freeze({ ok: true, ...result });
  } catch {
    return deny;
  }
}

export function classifyV2Recovery(snapshot) {
  try {
    const result = validate(snapshot);
    if (result === null) return deny;
    if (result.state === 'started') return Object.freeze({ ok: true, state: 'consumed', exitClass: 'interrupted' });
    if (result.state === 'terminal') return Object.freeze({ ok: true, state: 'consumed', exitClass: result.exitClass });
    return Object.freeze({ ok: true, state: result.state });
  } catch {
    return deny;
  }
}
