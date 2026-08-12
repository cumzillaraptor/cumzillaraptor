import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateV2ApprovalBundle } from '../scripts/future-send-v2-approval.mjs';
import { buildV2CliArgv } from '../scripts/future-send-v2-cli-contract.mjs';
import { validateV2NonceSnapshot } from '../scripts/future-send-v2-nonce-state.mjs';

const nonce = 'A'.repeat(43);
const endpoint = 'https://rpc.example.test/review?tenant=alpha&token=public';
const authorizationSha256 = 'd3b7e087f0854ec2017f17c5dffd7679c0618e0836617b43bc93b45abed0957d';
const runtimeManifestSha256 = 'b'.repeat(64);
const reviewReportSha256 = 'c'.repeat(64);
const approverPublicSpki = '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAoaf3YGp70jvu0oTtXoOy8Yb66xVtqJhH2EnPmmtY+sE=\n-----END PUBLIC KEY-----\n';
const reviewerPublicSpki = '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAgs9EQsqOJ15FwRn8ftcsHh0zbtnhUkLUFTcVU0y4ZcU=\n-----END PUBLIC KEY-----\n';
const approverSignature = '3XkRFMmKv1mykKY_iSmtJduaYneKBDWvuSQGF7XO_uhDebZHye8TH5lbYVtBBJ-M2K4wPox8P7t2SjrlVs0rBg';
const reviewerSignature = 'SA78UQZXZ_zw_Pk4brcpnJlpmyvbA3M9Msk8-B4QWOlt6zWNPK8XWaa8BmZUzCkti58sUJXwnSkac7Qn3vCACg';
const approverFingerprint = 'ea5ddbe12db55497383514c65f197619d3e955b0a22c9cd79f9d65c71072422c';
const reviewerFingerprint = '653142d085748773346d236a0c45eb32ae6c5b30d84e8e99a1a110a380de7a26';
const facts = Object.freeze({
  devnetGenesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  rpcSha256: '1dc16a401db4aed37b28ceeb1bce1bfbc33c94bbaf3acae7c6ae7392b90653b9',
  commitment: 'confirmed',
  programId: 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY',
  configPda: '7JDvn8mkEousMqzasbDZazkq8EsRy42nB1Dxp74Kg3e6',
  artifactRevision: '01ae96e2542717438112c3244394e0d484210f34',
  artifactBytes: 397040,
  artifactSha256: '2c88fe80ff4488e4034fdf2a724822a8413d0242b09176ed1710648eb110aa22',
  cliVersion: 'v1.18.26',
  cliSha256: '1ef9999ed4bce11226170a312775c8b6439f54331ac4bf249957d587deda6852',
});
const consumedRoot = '/root/cumzillaraptors-send-authorizations/consumed';
const nonceDirectory = `${consumedRoot}/${nonce}`;
const staged = Object.freeze({
  stagedCli: `/opt/cumzillaraptors-send-runtime-candidate-v2/staging/${nonce}/solana`,
  stagedPayer: `/opt/cumzillaraptors-send-runtime-candidate-v2/staging/${nonce}/payer.json`,
  stagedProgram: `/opt/cumzillaraptors-send-runtime-candidate-v2/staging/${nonce}/program.json`,
  stagedUpgradeAuthority: `/opt/cumzillaraptors-send-runtime-candidate-v2/staging/${nonce}/upgrade-authority.json`,
  stagedArtifact: `/opt/cumzillaraptors-send-runtime-candidate-v2/staging/${nonce}/cumzillaraptors.so`,
});

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function authorizationText() {
  return JSON.stringify({
    formatVersion: 2, nonce, createdAt: '2026-08-11T00:00:00.000Z', expiresAt: '2026-08-11T00:05:00.000Z',
    ...facts, runtimeManifestSha256, reviewReportSha256, observedProgramAbsent: true, observedConfigAbsent: true,
    authorization: 'one Devnet program deployment attempt only',
    exclusions: 'No launch initialization, collection creation, minting, claims, payments, uploads, authority changes, upgrades, mainnet, or other transactions.',
  });
}

function attestationText() {
  return JSON.stringify({
    formatVersion: 2, authorizationSha256, runtimeManifestSha256, reviewReportSha256,
    createdAt: '2026-08-11T00:00:00.000Z', expiresAt: '2026-08-11T00:05:00.000Z',
    ...facts, observedProgramAbsent: true, observedConfigAbsent: true,
  });
}

function publicProvenance(pathname, fingerprint) {
  return {
    pathname, isRegularFile: true, uid: 0, mode: 0o600, parentUid: 0, parentMode: 0o700,
    parentIsDirectory: true, fingerprint, runtimeManifestFingerprint: fingerprint,
  };
}

function approvalBundle() {
  return deepFreeze({
    authorizationText: authorizationText(),
    attestationText: attestationText(),
    approverPublicKey: approverPublicSpki,
    reviewerPublicKey: reviewerPublicSpki,
    approverSignature,
    reviewerSignature,
    approverProvenance: publicProvenance('/root/cumzillaraptors-send-authorizations/approver.pub', approverFingerprint),
    reviewerProvenance: publicProvenance('/root/cumzillaraptors-send-authorizations/reviewer.pub', reviewerFingerprint),
    now: '2026-08-11T00:01:00.000Z',
  });
}

function cliInput(approval, canonicalEndpoint = endpoint) {
  return Object.freeze({
    approval,
    canonicalEndpoint,
    runtimeManifestEndpointSha256: createHash('sha256').update(canonicalEndpoint, 'utf8').digest('hex'),
  });
}

function startedText() {
  return JSON.stringify({
    formatVersion: 2, nonce, authorizationSha256, runtimeManifestSha256,
    createdAt: '2026-08-11T00:00:00.000Z', state: 'started', ...staged,
  });
}

function terminalText(exitClass = 'succeeded') {
  return JSON.stringify({
    formatVersion: 2, nonce, authorizationSha256,
    startedSha256: createHash('sha256').update(startedText(), 'utf8').digest('hex'),
    completedAt: '2026-08-11T00:01:00.000Z', state: 'terminal', exitClass,
  });
}

function directory(pathname) {
  return { pathname, isDirectory: true, isSymlink: false, uid: 0, mode: 0o700 };
}

function stateFile(pathname, text) {
  return { pathname, text, isRegularFile: true, isSymlink: false, uid: 0, mode: 0o600 };
}

function durableSnapshot(state) {
  const history = state === 'absent' || state === 'reserved' ? 'absent' : 'consumed';
  const priorState = state === 'absent' ? 'absent' : state === 'reserved' ? 'absent' : state === 'started' ? 'reserved' : 'started';
  const objectNames = state === 'terminal' ? ['started.json', 'terminal.json'] : state === 'started' ? ['started.json'] : [];
  const layout = {
    consumedRoot: directory(consumedRoot),
    nonceDirectory: directory(nonceDirectory),
    objectNames,
    ...(state === 'started' || state === 'terminal' ? { started: stateFile(`${nonceDirectory}/started.json`, startedText()) } : {}),
    ...(state === 'terminal' ? { terminal: stateFile(`${nonceDirectory}/terminal.json`, terminalText()) } : {}),
  };
  return deepFreeze({ nonce, state, priorState, consumedHistory: history, layout });
}

function assertFrozenDataOnly(value) {
  const visit = (candidate) => {
    assert.notEqual(typeof candidate, 'function');
    if (candidate === null || typeof candidate !== 'object') return;
    assert.equal(Object.isFrozen(candidate), true);
    assert.ok(Array.isArray(candidate) || Object.getPrototypeOf(candidate) === Object.prototype);
    for (const key of Reflect.ownKeys(candidate)) {
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      assert.ok(descriptor && Object.hasOwn(descriptor, 'value'));
      visit(descriptor.value);
    }
  };
  visit(value);
}

test('v2 pure modules compose fixed public approvals, exact endpoint bindings, and durable transition history into frozen data only', () => {
  const approvalInput = approvalBundle();
  const approval = validateV2ApprovalBundle(approvalInput);
  const exactCliInput = cliInput(approval);
  const argv = buildV2CliArgv(exactCliInput);
  const transitions = [
    ['absent', { ok: true, state: 'absent' }],
    ['reserved', { ok: true, state: 'reserved' }],
    ['started', { ok: true, state: 'started' }],
    ['terminal', { ok: true, state: 'terminal', exitClass: 'succeeded' }],
  ];

  assert.deepEqual(approval, {
    ok: true,
    nonce,
    authorizationSha256,
    endpointBinding: { authorizationSha256, rpcSha256: facts.rpcSha256, runtimeManifestSha256, reviewReportSha256 },
  });
  assert.deepEqual(Object.keys(approvalInput), ['authorizationText', 'attestationText', 'approverPublicKey', 'reviewerPublicKey', 'approverSignature', 'reviewerSignature', 'approverProvenance', 'reviewerProvenance', 'now']);
  assert.equal(Object.isFrozen(approvalInput), true);
  assert.deepEqual(Object.keys(exactCliInput), ['approval', 'canonicalEndpoint', 'runtimeManifestEndpointSha256']);
  assert.equal(exactCliInput.approval, approval);
  assert.equal(Object.isFrozen(exactCliInput), true);
  const endpointSha256 = createHash('sha256').update(endpoint, 'utf8').digest('hex');
  assert.equal(endpointSha256, facts.rpcSha256);
  assert.equal(exactCliInput.runtimeManifestEndpointSha256, endpointSha256);
  assert.deepEqual(argv, [
    staged.stagedCli, 'program', 'deploy', '--url', endpoint, '--commitment', 'confirmed', '--keypair',
    staged.stagedPayer, '--program-id', staged.stagedProgram, '--upgrade-authority', staged.stagedUpgradeAuthority,
    staged.stagedArtifact,
  ]);
  assert.equal(Object.isFrozen(argv), true);
  assert.deepEqual(buildV2CliArgv(cliInput(approval, 'https://rpc.example.test/alternate?tenant=alpha&token=public')), { ok: false, reason: 'invalid-input' });
  for (const [state, expected] of transitions) {
    const snapshot = durableSnapshot(state);
    assert.equal(Object.isFrozen(snapshot), true);
    assert.deepEqual(validateV2NonceSnapshot(snapshot), expected);
  }
  for (const value of [approval, argv, ...transitions.map(([state]) => validateV2NonceSnapshot(durableSnapshot(state)))]) assertFrozenDataOnly(value);
});

test('repository prepare-only executor still rejects --send and contains no Solana CLI deploy child process', async () => {
  const source = await readFile(new URL('../scripts/execute-devnet-deployment.mjs', import.meta.url), 'utf8');
  assert.match(source, /--send[\s\S]{0,180}Refusing: send mode is unavailable/);
  assert.doesNotMatch(source, /(?:spawn|exec|spawnSync|execFile)\s*\([^\n]*(?:solana|program deploy)|solana\s+program\s+deploy/);
});

test('all new v2 sources remain capability-free pure offline modules', async () => {
  const sources = await Promise.all(['../scripts/future-send-v2-schema.mjs', '../scripts/future-send-v2-approval.mjs', '../scripts/future-send-v2-cli-contract.mjs', '../scripts/future-send-v2-nonce-state.mjs'].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  for (const source of sources) assert.doesNotMatch(source, /node:(?:fs|child_process|process|net|http|https|tls)|\b(?:spawn|exec|fork|readFile|writeFile|fetch|sign|generateKeyPair|createPrivateKey|Transaction|serialize)\b/);
});

// Fixtures are frozen public records and synthetic metadata only; this integration gate opens no paths and executes no argv.
