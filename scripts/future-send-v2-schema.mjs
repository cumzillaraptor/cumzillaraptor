const deny = Object.freeze({ ok: false, reason: 'invalid-input' });

function freezeDeep(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) freezeDeep(value[key], seen);
  return Object.freeze(value);
}

function allStringsAreNfc(value, seen = new Set()) {
  if (typeof value === 'string') return value === value.normalize('NFC');
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  for (const key of Object.keys(value)) {
    if (key !== key.normalize('NFC') || !allStringsAreNfc(value[key], seen)) return false;
  }
  return true;
}

export const V2_PATHS = freezeDeep({
  runtimeRoot: '/opt/cumzillaraptors-send-runtime-candidate-v2',
  runtimeManifest: '/opt/cumzillaraptors-send-runtime-candidate-v2/config/runtime-root-sha256.txt',
  dependencyManifest: '/opt/cumzillaraptors-send-runtime-candidate-v2/config/node-modules-sha256.txt',
  endpointDigestManifest: '/opt/cumzillaraptors-send-runtime-candidate-v2/config/rpc-endpoint-sha256.txt',
  endpoint: '/root/cumzillaraptors-send-runtime-candidate-v2/config/rpc-endpoint',
  artifact: '/opt/cumzillaraptors-approved-artifact/cumzillaraptors.so',
  artifactRevision: '/opt/cumzillaraptors-approved-artifact/cumzillaraptors.build-revision',
  cli: '/opt/cumzillaraptors-' + 'sol' + 'ana-cli/v1.18.26/bin/' + 'sol' + 'ana',
  keyRoot: '/root/cumzillaraptors-deploy-keypairs',
  authorizationRoot: '/root/cumzillaraptors-send-authorizations',
  reservationRoot: '/root/cumzillaraptors-send-authorizations/reservations',
  consumedRoot: '/root/cumzillaraptors-send-authorizations/consumed',
});

export const V2_FIXED_FACTS = freezeDeep({
  cluster: 'devnet',
  devnetGenesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  programId: 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY',
  configPda: '7JDvn8mkEousMqzasbDZazkq8EsRy42nB1Dxp74Kg3e6',
  artifactRevision: '01ae96e2542717438112c3244394e0d484210f34',
  artifactBytes: 397040,
  artifactSha256: '2c88fe80ff4488e4034fdf2a724822a8413d0242b09176ed1710648eb110aa22',
  cliVersion: 'v1.18.26',
  cliSha256: '1ef9999ed4bce11226170a312775c8b6439f54331ac4bf249957d587deda6852',
  commitment: 'confirmed',
});

export const AUTHORIZATION_FIELDS = Object.freeze([
  'formatVersion', 'nonce', 'createdAt', 'expiresAt', 'devnetGenesisHash', 'rpcSha256', 'commitment', 'programId', 'configPda', 'artifactRevision', 'artifactBytes', 'artifactSha256', 'cliVersion', 'cliSha256', 'runtimeManifestSha256', 'reviewReportSha256', 'observedProgramAbsent', 'observedConfigAbsent', 'authorization', 'exclusions',
]);

export const ATTESTATION_FIELDS = Object.freeze([
  'formatVersion', 'authorizationSha256', 'runtimeManifestSha256', 'reviewReportSha256', 'createdAt', 'expiresAt', 'devnetGenesisHash', 'rpcSha256', 'commitment', 'programId', 'configPda', 'artifactRevision', 'artifactBytes', 'artifactSha256', 'cliVersion', 'cliSha256', 'observedProgramAbsent', 'observedConfigAbsent',
]);

export const STARTED_FIELDS = Object.freeze([
  'formatVersion', 'nonce', 'authorizationSha256', 'runtimeManifestSha256', 'createdAt', 'state', 'stagedCli', 'stagedPayer', 'stagedProgram', 'stagedUpgradeAuthority', 'stagedArtifact',
]);

export const TERMINAL_FIELDS = Object.freeze([
  'formatVersion', 'nonce', 'authorizationSha256', 'startedSha256', 'completedAt', 'state', 'exitClass',
]);

export function parseCanonicalObject(text, exactFields) {
  if (typeof text !== 'string' || !Array.isArray(exactFields)) return deny;

  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return deny;
  }

  if (value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return deny;
  const keys = Object.keys(value);
  if (keys.length !== exactFields.length || keys.some((key, index) => key !== exactFields[index])) return deny;
  if (value.formatVersion !== 2 || !allStringsAreNfc(value) || JSON.stringify(value) !== text) return deny;

  return Object.freeze({ ok: true, value: freezeDeep(value) });
}
