const ROOT = '/opt/cumzillaraptors-send-runtime-candidate-v2';
const ARGV = Object.freeze([
  '/usr/bin/node',
  `${ROOT}/scripts/v2-root-runtime-prepare-coordinator.mjs`,
  '--prepare',
]);
const ENV = Object.freeze({
  PATH: '/usr/sbin:/usr/bin:/sbin:/bin',
  LC_ALL: 'C',
  HOME: '/nonexistent',
});
const CONTRACT = Object.freeze({
  uid: 0,
  argv: ARGV,
  cwd: ROOT,
  stdin: '/dev/null',
  env: ENV,
});
const DENIAL = Object.freeze({ ok: false, reason: 'invalid-input' });
const SENSITIVE_STDERR = /(?:https?:\/\/|\b(?:endpoint|artifact|authorization|token|secret|key|credential(?:s)?|password|passwd|username|user|pass|login|bearer|api[_-]?key)\b)/i;

export function makePrepareLauncherContract() {
  return CONTRACT;
}

function isNoArgumentRootRequest(request) {
  if (!request || typeof request !== 'object' || !Object.isFrozen(request)) return false;
  const keys = Object.keys(request);
  return keys.length === 2 && keys.includes('uid') && keys.includes('argv')
    && request.uid === 0
    && Array.isArray(request.argv)
    && Object.isFrozen(request.argv)
    && request.argv.length === 0;
}

function parseCanonicalReview(stdout) {
  if (typeof stdout !== 'string' || !stdout.endsWith('\n') || stdout.length < 3) return null;
  const serialized = stdout.slice(0, -1);
  let review;
  try {
    review = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (!review || typeof review !== 'object' || Array.isArray(review)) return null;
  if (JSON.stringify(review) !== serialized || SENSITIVE_STDERR.test(serialized)) return null;
  return review;
}

function acceptedStderr(stderr) {
  return typeof stderr === 'string' && stderr.length <= 512 && !SENSITIVE_STDERR.test(stderr);
}

export function modelPrepareLauncher(request, adapter) {
  if (!isNoArgumentRootRequest(request) || !adapter || typeof adapter.run !== 'function') return DENIAL;

  let result;
  try {
    result = adapter.run(CONTRACT);
  } catch {
    return DENIAL;
  }

  const review = result && parseCanonicalReview(result.stdout);
  if (!review || !acceptedStderr(result.stderr)) return DENIAL;
  return Object.freeze({ ok: true, stdout: `${JSON.stringify({ ok: true, review })}\n`, stderr: result.stderr });
}
