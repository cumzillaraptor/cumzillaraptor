import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// This is deliberately only the Task 1 availability gate. It proves that the
// private test validator loaded the two exact SBPF programs before later tasks
// are allowed to submit a claim scenario. It does not report a claim success.
const VALIDATOR_URL = process.env.CORE_CLAIM_VALIDATOR_URL;
const CUMZ_PROGRAM_SO = process.env.CORE_CLAIM_PROGRAM_SO;
const CORE_PROGRAM_SO = process.env.CORE_CLAIM_CORE_SO;
const GATE_REQUIRED = process.env.CORE_CLAIM_GATE_REQUIRED === '1';

const CUMZ_PROGRAM_ID = '2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2';
const CORE_PROGRAM_ID = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';
const CORE_SHA256 = 'afbbe94e116e11ae5d47bc58b1dc90784d2601fdda46c0325906faf357aff963';
const UPGRADEABLE_LOADER_ID = 'BPFLoaderUpgradeab1e11111111111111111111111';

function assertPrivateLoopbackUrl(url) {
  const parsed = new URL(url);
  assert.equal(parsed.protocol, 'http:', 'local validator must use HTTP on loopback');
  assert.ok(
    parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1',
    `refuse non-local validator endpoint: ${parsed.hostname}`,
  );
}

async function getAccountInfo(url, pubkey) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `core-availability-${pubkey}`,
      method: 'getAccountInfo',
      params: [pubkey, { encoding: 'base64' }],
    }),
  });
  assert.equal(response.ok, true, `RPC HTTP status for ${pubkey}`);
  const payload = await response.json();
  assert.equal(payload.error, undefined, `RPC error for ${pubkey}: ${JSON.stringify(payload.error)}`);
  assert.ok(payload.result?.value, `validator did not load ${pubkey}`);
  return payload.result.value;
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

test('private test validator has the hash-pinned Core and fresh cumzillaraptors programs available', {
  skip: !GATE_REQUIRED,
}, async () => {
  assert.ok(VALIDATOR_URL, 'CORE_CLAIM_VALIDATOR_URL is required when the x86 gate runs');
  assertPrivateLoopbackUrl(VALIDATOR_URL);
  assert.ok(CUMZ_PROGRAM_SO && existsSync(CUMZ_PROGRAM_SO), 'fresh cumzillaraptors SBPF input is required');
  assert.ok(CORE_PROGRAM_SO && existsSync(CORE_PROGRAM_SO), 'hash-pinned mpl-core SBPF input is required');
  assert.equal(sha256File(CORE_PROGRAM_SO), CORE_SHA256, 'mpl-core binary hash must match the pinned official release');

  const [cumz, core] = await Promise.all([
    getAccountInfo(VALIDATOR_URL, CUMZ_PROGRAM_ID),
    getAccountInfo(VALIDATOR_URL, CORE_PROGRAM_ID),
  ]);
  for (const [name, account] of [['cumzillaraptors', cumz], ['mpl-core', core]]) {
    assert.equal(account.executable, true, `${name} program account must be executable`);
    assert.equal(account.owner, UPGRADEABLE_LOADER_ID, `${name} must be loaded by the upgradeable BPF loader`);
  }
});

test('local Core availability gate is localhost-only and can load only the separately named test-validation artifact', () => {
  const script = readFileSync(new URL('../scripts/run-x86-core-claim-gate.sh', import.meta.url), 'utf8');
  const workflow = readFileSync(new URL('../.github/workflows/build-program.yml', import.meta.url), 'utf8');

  assert.match(script, /--bind-address\s+127\.0\.0\.1/);
  assert.match(script, /CUMZ_TEST_VALIDATION_SBF_OUT_DIR/);
  assert.match(script, /cumzillaraptors\.test-validation\.so/);
  assert.match(script, /cumzillaraptors\.test-validation\.build-revision/);
  assert.match(script, /--bpf-program\s+"\$CUMZ_PROGRAM_ID"\s+"\$PROGRAM_SO"/);
  assert.match(script, /--bpf-program\s+"\$CORE_PROGRAM_ID"\s+"\$WORKDIR\/mpl_core_program\.so"/);
  assert.match(script, new RegExp(CORE_SHA256));
  assert.match(script, /node --test tests\/local-validator-core-availability\.test\.mjs/);
  assert.doesNotMatch(script, /https?:\/\/(?:api\.)?devnet\.solana\.com/i);
  assert.doesNotMatch(script, /solana\s+program\s+deploy/i);
  assert.doesNotMatch(script, /solana\s+transfer/i);
  assert.doesNotMatch(script, /CUMZ_DEVNET_LAUNCH_AUTHORITY_KEYPAIR_JSON/);

  assert.match(workflow, /name: Run local x86 Core availability gate/);
  assert.match(workflow, /name: Build isolated test-validation SBPF artifact for private localhost only/);
  assert.match(workflow, /--features test-validation/);
  assert.match(workflow, /cumzillaraptors\.test-validation\.so/);
  assert.match(workflow, /CUMZ_TEST_VALIDATION_SBF_OUT_DIR/);
  assert.doesNotMatch(workflow, /CUMZ_DEVNET_LAUNCH_AUTHORITY_KEYPAIR_JSON/);
  assert.match(workflow, /CUMZ_EXPECTED_BUILD_REVISION: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /scripts\/run-x86-core-claim-gate\.sh/);
});
