import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateV2NonceSnapshot, classifyV2Recovery } from '../scripts/future-send-v2-nonce-state.mjs';

const nonce = 'A'.repeat(43);
const authorizationSha256 = 'a'.repeat(64);
const runtimeManifestSha256 = 'b'.repeat(64);
const consumedRoot = '/root/cumzillaraptors-send-authorizations/consumed';
const noncePath = `${consumedRoot}/${nonce}`;
const startedPath = `${noncePath}/started.json`;
const terminalPath = `${noncePath}/terminal.json`;
const staged = {
  stagedCli: `/opt/cumzillaraptors-send-runtime-candidate-v2/staging/${nonce}/solana`,
  stagedPayer: `/opt/cumzillaraptors-send-runtime-candidate-v2/staging/${nonce}/payer.json`,
  stagedProgram: `/opt/cumzillaraptors-send-runtime-candidate-v2/staging/${nonce}/program.json`,
  stagedUpgradeAuthority: `/opt/cumzillaraptors-send-runtime-candidate-v2/staging/${nonce}/upgrade-authority.json`,
  stagedArtifact: `/opt/cumzillaraptors-send-runtime-candidate-v2/staging/${nonce}/cumzillaraptors.so`,
};

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function started(overrides = {}) {
  return JSON.stringify({ formatVersion: 2, nonce, authorizationSha256, runtimeManifestSha256, createdAt: '2026-08-11T00:00:00.000Z', state: 'started', ...staged, ...overrides });
}

function terminal(overrides = {}) {
  return JSON.stringify({ formatVersion: 2, nonce, authorizationSha256, startedSha256: createHash('sha256').update(started()).digest('hex'), completedAt: '2026-08-11T00:01:00.000Z', state: 'terminal', exitClass: 'failed', ...overrides });
}

function directory(pathname, overrides = {}) {
  return { pathname, isDirectory: true, isSymlink: false, uid: 0, mode: 0o700, ...overrides };
}

function file(pathname, text, overrides = {}) {
  return { pathname, text, isRegularFile: true, isSymlink: false, uid: 0, mode: 0o600, ...overrides };
}

function snapshot(state, overrides = {}) {
  const objects = state === 'terminal' ? ['started.json', 'terminal.json'] : state === 'started' ? ['started.json'] : [];
  const history = state === 'absent' || state === 'reserved' ? 'absent' : 'consumed';
  const priorState = state === 'absent' ? 'absent' : state === 'reserved' ? 'absent' : state === 'started' ? 'reserved' : 'started';
  const value = {
    nonce,
    state,
    priorState,
    consumedHistory: history,
    layout: {
      consumedRoot: directory(consumedRoot),
      nonceDirectory: directory(noncePath),
      objectNames: objects,
      ...(state === 'started' || state === 'terminal' ? { started: file(startedPath, started()) } : {}),
      ...(state === 'terminal' ? { terminal: file(terminalPath, terminal()) } : {}),
    },
    ...overrides,
  };
  return deepFreeze(value);
}

function denied(value) {
  assert.deepEqual(value, { ok: false, reason: 'invalid-input' });
  assert.equal(Object.isFrozen(value), true);
}

function mutate(value, change) {
  const copy = structuredClone(value);
  change(copy);
  return deepFreeze(copy);
}

test('pure nonce snapshot accepts only immutable exact durable layouts and returns frozen values', () => {
  for (const state of ['absent', 'reserved', 'started']) {
    const result = validateV2NonceSnapshot(snapshot(state));
    assert.deepEqual(result, { ok: true, state });
    assert.equal(Object.isFrozen(result), true);
  }
  for (const exitClass of ['succeeded', 'failed', 'interrupted']) {
    const result = validateV2NonceSnapshot(snapshot('terminal', { layout: { ...snapshot('terminal').layout, terminal: file(terminalPath, terminal({ exitClass })) } }));
    assert.deepEqual(result, { ok: true, state: 'terminal', exitClass });
    assert.equal(Object.isFrozen(result), true);
  }
  const recovery = classifyV2Recovery(snapshot('started'));
  assert.deepEqual(recovery, { ok: true, state: 'consumed', exitClass: 'interrupted' });
  assert.equal(Object.isFrozen(recovery), true);
});

test('exact durable root, nonce directory, object names, and file paths are mandatory', () => {
  const valid = snapshot('terminal');
  const cases = [
    mutate(valid, (v) => { v.layout.consumedRoot.pathname = '/root/other'; }),
    mutate(valid, (v) => { v.layout.consumedRoot.isDirectory = false; }),
    mutate(valid, (v) => { v.layout.consumedRoot.isSymlink = true; }),
    mutate(valid, (v) => { v.layout.consumedRoot.uid = 1000; }),
    mutate(valid, (v) => { v.layout.consumedRoot.mode = 0o755; }),
    mutate(valid, (v) => { v.layout.nonceDirectory.pathname = `${noncePath}/other`; }),
    mutate(valid, (v) => { v.layout.nonceDirectory.isDirectory = false; }),
    mutate(valid, (v) => { v.layout.nonceDirectory.isSymlink = true; }),
    mutate(valid, (v) => { v.layout.nonceDirectory.uid = 1000; }),
    mutate(valid, (v) => { v.layout.nonceDirectory.mode = 0o755; }),
    mutate(valid, (v) => { v.layout.objectNames = ['terminal.json', 'started.json']; }),
    mutate(valid, (v) => { v.layout.objectNames.push('unexpected.json'); }),
    mutate(valid, (v) => { v.layout.started.pathname = `${noncePath}/other.json`; }),
    mutate(valid, (v) => { v.layout.terminal.pathname = `${noncePath}/other.json`; }),
    mutate(valid, (v) => { v.layout.started.isRegularFile = false; }),
    mutate(valid, (v) => { v.layout.started.isSymlink = true; }),
    mutate(valid, (v) => { v.layout.started.uid = 1000; }),
    mutate(valid, (v) => { v.layout.started.mode = 0o644; }),
    mutate(valid, (v) => { v.layout.terminal.isRegularFile = false; }),
    mutate(valid, (v) => { v.layout.terminal.isSymlink = true; }),
    mutate(valid, (v) => { v.layout.terminal.uid = 1000; }),
    mutate(valid, (v) => { v.layout.terminal.mode = 0o644; }),
    mutate(snapshot('absent'), (v) => { v.layout.objectNames = ['started.json']; }),
    mutate(snapshot('reserved'), (v) => { v.layout.objectNames = ['terminal.json']; }),
  ];
  for (const input of cases) denied(validateV2NonceSnapshot(input));
  denied(validateV2NonceSnapshot(structuredClone(valid)));
});

test('every staged path is bound and records reject nonce, authorization, and timestamp mismatches', () => {
  const cases = [
    ...Object.keys(staged).map((key) => mutate(snapshot('started'), (v) => { v.layout.started.text = started({ [key]: `/tmp/${key}` }); })),
    mutate(snapshot('started'), (v) => { v.layout.started.text = started({ nonce: 'B'.repeat(43) }); }),
    mutate(snapshot('terminal'), (v) => { v.layout.terminal.text = terminal({ nonce: 'B'.repeat(43) }); }),
    mutate(snapshot('terminal'), (v) => { v.layout.terminal.text = terminal({ authorizationSha256: 'c'.repeat(64) }); }),
    mutate(snapshot('started'), (v) => { v.layout.started.text = started({ createdAt: 'not-a-time' }); }),
    mutate(snapshot('terminal'), (v) => { v.layout.terminal.text = terminal({ completedAt: '2026-08-10T00:00:00.000Z' }); }),
    mutate(snapshot('terminal'), (v) => { v.layout.terminal.text = terminal({ startedSha256: 'd'.repeat(64) }); }),
    mutate(snapshot('started'), (v) => { v.layout.started.text = `${started()}\n`; }),
    mutate(snapshot('terminal'), (v) => { v.layout.terminal.text = terminal({ exitClass: 'other' }); }),
  ];
  for (const input of cases) denied(validateV2NonceSnapshot(input));
});

test('explicit non-reusable transition history denies omissions, forgery, reuse, and downgrade', () => {
  const cases = [
    mutate(snapshot('reserved'), (v) => { delete v.priorState; }),
    mutate(snapshot('started'), (v) => { delete v.priorState; }),
    mutate(snapshot('terminal'), (v) => { delete v.priorState; }),
    mutate(snapshot('absent'), (v) => { delete v.consumedHistory; }),
    mutate(snapshot('reserved'), (v) => { v.priorState = 'reserved'; }),
    mutate(snapshot('started'), (v) => { v.priorState = 'absent'; }),
    mutate(snapshot('terminal'), (v) => { v.priorState = 'reserved'; }),
    mutate(snapshot('reserved'), (v) => { v.consumedHistory = 'consumed'; }),
    mutate(snapshot('started'), (v) => { v.consumedHistory = 'absent'; }),
    mutate(snapshot('terminal'), (v) => { v.consumedHistory = 'absent'; }),
    mutate(snapshot('absent'), (v) => { v.priorState = 'started'; }),
    mutate(snapshot('absent'), (v) => { v.priorState = 'terminal'; }),
    mutate(snapshot('absent'), (v) => { v.consumedHistory = 'consumed'; }),
    mutate(snapshot('reserved'), (v) => { v.priorState = 'terminal'; }),
    mutate(snapshot('terminal'), (v) => { delete v.layout.started; }),
    mutate(snapshot('terminal'), (v) => { v.layout.objectNames = ['terminal.json']; }),
  ];
  for (const input of cases) denied(validateV2NonceSnapshot(input));
  assert.deepEqual(validateV2NonceSnapshot(snapshot('started', { cleanup: ['reservation', 'staging'] })), { ok: true, state: 'started' });
  denied(validateV2NonceSnapshot(snapshot('started', { cleanup: ['consumed'] })));
});

test('nonce-state source remains a pure text/object validator', async () => {
  const source = await readFile(new URL('../scripts/future-send-v2-nonce-state.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:(?:fs|child_process|process|net|http|https|tls)|\b(?:mkdir|rename|fsync|unlink|spawn|exec|fetch|sign|generateKeyPair|createPrivateKey|Transaction|serialize|solana)\b/);
});

// Synthetic frozen metadata is supplied by the caller; this suite opens, creates, or changes no durable state.
