// Pure fake integration harness. It performs no I/O/network/process action and
// exports deterministic fixture argument construction only; it never invokes a callback.
import { EXPECTED_FIXED_FACTS } from './future-send-gate.mjs';

function deny(reason) { return Object.freeze({ ok: false, reason }); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function own(record, key) { const d = Object.getOwnPropertyDescriptor(record, key); return d && Object.hasOwn(d, 'value') ? d.value : undefined; }
function stagedPath(value, leaf) { return typeof value === 'string' && value === `/fixture/staged/${leaf}`; }

function validateFixtureInput(input = {}) {
  if (!plain(input)) return { ok: false, reason: 'invalid-input' };
  const review = own(input, 'review');
  const final = own(input, 'final');
  const staged = own(input, 'staged');
  if (![review, final, staged].every(plain)) return { ok: false, reason: 'invalid-input' };
  if (own(review, 'rpcOk') !== true || own(final, 'rpcOk') !== true) return { ok: false, reason: 'rpc-failure' };
  const reviewDigest = own(review, 'endpointSha256');
  const finalDigest = own(final, 'endpointSha256');
  if (typeof reviewDigest !== 'string' || !/^[a-f0-9]{64}$/.test(reviewDigest) || reviewDigest !== finalDigest) return { ok: false, reason: 'endpoint-digest-mismatch' };
  if (own(review, 'genesisHash') !== EXPECTED_FIXED_FACTS.devnetGenesisHash || own(final, 'genesisHash') !== EXPECTED_FIXED_FACTS.devnetGenesisHash) return { ok: false, reason: 'genesis-mismatch' };
  if (own(review, 'programAbsent') !== true || own(review, 'configAbsent') !== true || own(final, 'programAbsent') !== true || own(final, 'configAbsent') !== true) {
    if (own(final, 'programAbsent') !== true) return { ok: false, reason: 'program-exists' };
    if (own(final, 'configAbsent') !== true) return { ok: false, reason: 'config-exists' };
    return { ok: false, reason: 'review-final-race' };
  }
  if (!stagedPath(own(staged, 'artifact'), 'cumzillaraptors.so') || !stagedPath(own(staged, 'payer'), 'payer.json') || !stagedPath(own(staged, 'program'), 'program.json') || !stagedPath(own(staged, 'authority'), 'upgrade-authority.json') || !stagedPath(own(staged, 'cli'), 'solana') || own(staged, 'rpc') !== 'https://rpc.example.test') return { ok: false, reason: 'invalid-staged-paths' };
  return { ok: true, staged };
}

function buildFakeStagedArgv(input = {}) {
  try {
    const validated = validateFixtureInput(input);
    if (!validated.ok) return deny(validated.reason);
    const staged = validated.staged;
    return Object.freeze([
      own(staged, 'cli'), 'program', 'deploy', '--url', own(staged, 'rpc'),
      '--program-id', own(staged, 'program'), '--keypair', own(staged, 'payer'),
      '--upgrade-authority', own(staged, 'authority'), own(staged, 'artifact'),
    ]);
  } catch { return deny('invalid-input'); }
}

function evaluateFakeFinalGate(input = {}) {
  const argv = buildFakeStagedArgv(input);
  return Array.isArray(argv) ? deny('send-disabled-fake-cli-recorded') : argv;
}

export { buildFakeStagedArgv, evaluateFakeFinalGate };
