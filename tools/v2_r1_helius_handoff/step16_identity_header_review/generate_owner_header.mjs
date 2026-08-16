// Pure canonical-text transformer. It deliberately has no filesystem, process, CLI,
// environment, network, RPC, compiler, or execution capability.

export const LINUX_UID_GID_MAX = 4294967295;

const DECIMAL_UID_GID = /^(?:0|[1-9][0-9]*)$/;
const FIELD_NAMES = Object.freeze([
  'report_classification',
  'source',
  'owner_uid',
  'owner_gid',
  'home',
  'piadmin',
  'config',
  'cumzillaraptors',
  'secret_file',
  'symlink_indicator',
]);

function rejectCanonicalEvidence(message) {
  throw new TypeError(`canonical evidence rejected: ${message}`);
}

export function parseLinuxUidGid(value) {
  if (typeof value !== 'string' || !DECIMAL_UID_GID.test(value)) {
    throw new TypeError('canonical decimal Linux uid_t/gid_t required');
  }
  const numeric = BigInt(value);
  if (numeric > BigInt(LINUX_UID_GID_MAX)) {
    throw new RangeError('canonical decimal Linux uid_t/gid_t required');
  }
  return Number(numeric);
}

function parseMetadata(value, requiredType, requiredUid, requiredGid, requiredMode) {
  const match = /^(directory|regular),uid=(0|[1-9][0-9]*),gid=(0|[1-9][0-9]*),mode=(0[0-7]{3})$/.exec(value);
  if (!match) rejectCanonicalEvidence('metadata grammar');
  const [, type, uidText, gidText, mode] = match;
  let uid;
  let gid;
  try {
    uid = parseLinuxUidGid(uidText);
    gid = parseLinuxUidGid(gidText);
  } catch {
    rejectCanonicalEvidence('metadata uid/gid');
  }
  if (type !== requiredType || uid !== requiredUid || gid !== requiredGid || mode !== requiredMode) {
    rejectCanonicalEvidence('metadata requirement');
  }
}

export function parseCanonicalEvidence(evidence) {
  if (typeof evidence !== 'string' || !evidence.endsWith('\n') || evidence.endsWith('\n\n')) {
    rejectCanonicalEvidence('exactly one final LF');
  }
  const lines = evidence.slice(0, -1).split('\n');
  if (lines.length !== FIELD_NAMES.length) rejectCanonicalEvidence('field count');
  const values = new Map();
  for (let index = 0; index < FIELD_NAMES.length; index += 1) {
    const name = FIELD_NAMES[index];
    const prefix = `${name}=`;
    if (!lines[index].startsWith(prefix)) rejectCanonicalEvidence('fixed field order or unknown field');
    const value = lines[index].slice(prefix.length);
    if (value.length === 0 || values.has(name)) rejectCanonicalEvidence('empty or duplicate field');
    values.set(name, value);
  }
  if (values.get('report_classification') !== 'user-reported-not-current-host-authority') {
    rejectCanonicalEvidence('report classification');
  }
  if (values.get('source') !== 'reported') rejectCanonicalEvidence('source');
  if (values.get('symlink_indicator') !== 'absent') rejectCanonicalEvidence('symlink indicator');

  let uid;
  let gid;
  try {
    uid = parseLinuxUidGid(values.get('owner_uid'));
    gid = parseLinuxUidGid(values.get('owner_gid'));
  } catch {
    rejectCanonicalEvidence('owner uid/gid');
  }
  parseMetadata(values.get('home'), 'directory', 0, 0, '0755');
  for (const name of ['piadmin', 'config', 'cumzillaraptors']) {
    parseMetadata(values.get(name), 'directory', uid, gid, '0700');
  }
  parseMetadata(values.get('secret_file'), 'regular', uid, gid, '0600');
  return Object.freeze({ uid, gid });
}

export function assertNoUserMacroDefinitions(value) {
  if (value !== undefined) throw new TypeError('user macro definitions are forbidden');
}

export function generateOwnerHeader(...argumentsList) {
  if (argumentsList.length !== 1) {
    throw new TypeError('exactly one canonical evidence argument is required');
  }
  const [evidence] = argumentsList;
  const { uid, gid } = parseCanonicalEvidence(evidence);
  return [
    '#ifndef HELIUS_HANDOFF_GENERATED_OWNER_CONFIG_REVIEW_H',
    '#define HELIUS_HANDOFF_GENERATED_OWNER_CONFIG_REVIEW_H',
    '',
    `#define HELIUS_HANDOFF_GENERATED_OWNER_UID ${uid}`,
    `#define HELIUS_HANDOFF_GENERATED_OWNER_GID ${gid}`,
    '',
    '#endif /* HELIUS_HANDOFF_GENERATED_OWNER_CONFIG_REVIEW_H */',
    '',
  ].join('\n');
}
