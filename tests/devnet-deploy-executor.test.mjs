import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const script = path.join(root, 'scripts', 'execute-devnet-deployment.mjs');
const { EXPECTED, parseArgs, buildReviewArgs, stageTrustedReviewScript, stageTrustedKeypairs } = await import(pathToFileURL(script).href);

const required = [
  '--artifact-dir', '/tmp/artifact',
  '--program-keypair', '/secure/program.json',
  '--payer-keypair', '/secure/payer.json',
  '--upgrade-authority-keypair', '/secure/authority.json',
];

test('executor is fail-closed unless an explicit supported mode is selected', () => {
  assert.throws(() => parseArgs([]), /pass --prepare/);
  assert.throws(() => parseArgs([...required, '--prepare', '--send']), /send mode is unavailable/);
  assert.throws(() => parseArgs([...required, '--send']), /send mode is unavailable/);
  assert.throws(() => parseArgs([...required, '--prepare', '--rpc', 'https://example.invalid']), /Unknown argument/);
});

test('repository executor is prepare-only and rejects a direct send mode', () => {
  assert.throws(() => parseArgs([...required, '--send', '--confirm-devnet', '--approved-artifact-sha256', EXPECTED.artifactSha256, '--solana-cli', '/trusted/solana', '--approved-solana-cli-sha256', 'a'.repeat(64)]), /send mode is unavailable/);
});

test('executor resolves review tool from its own directory, not caller cwd', () => {
  const options = parseArgs([...required, '--prepare']);
  const reviewScript = buildReviewArgs(options)[0];
  assert.equal(reviewScript, path.join(path.dirname(script), 'review-devnet-deployment.mjs'));
  assert.ok(path.isAbsolute(reviewScript));
});

test('trusted review script is owner-only, hash-pinned, and staged before execution', () => {
  const { stagingDir, staged } = stageTrustedReviewScript();
  try {
    assert.match(staged, /\.review-stage-/);
    assert.equal(path.basename(staged), 'review-devnet-deployment.mjs');
  } finally {
    chmodSync(stagingDir, 0o700);
    rmSync(stagingDir, { recursive: true, force: true });
  }
});

test('executor pins the current approved review script source', async () => {
  const source = await readFile(script, 'utf8');
  assert.match(source, /APPROVED_REVIEW_SCRIPT_SHA256 = '33028e8d6f183e1579bdaea9719c5da1006a011f5f620e4238e5aa1738eb1a4c'/);
});

test('keypairs are copied to owner-only staging before review or CLI use', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cumz-executor-keypairs-'));
  try {
    const input = {};
    for (const label of ['program', 'payer', 'upgrade-authority']) {
      const filename = path.join(directory, `${label}.json`);
      await writeFile(filename, `[${label}]`);
      chmodSync(filename, 0o600);
      input[`${label.replaceAll('-', '_')}_keypair`] = filename;
    }
    const { stagingDir, options } = stageTrustedKeypairs(input);
    try {
      for (const label of ['program', 'payer', 'upgrade_authority']) {
        assert.notEqual(options[`${label}_keypair`], input[`${label}_keypair`]);
        assert.match(options[`${label}_keypair`], /cumzillaraptors-keypairs-/);
      }
    } finally {
      chmodSync(stagingDir, 0o700);
      rmSync(stagingDir, { recursive: true, force: true });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('repository executor has no deployment, signing, or CLI invocation path', async () => {
  const source = await readFile(script, 'utf8');
  assert.match(source, /--prepare/);
  assert.match(source, /send mode is unavailable/);
  assert.match(source, /runReview/);
  assert.doesNotMatch(source, /program', 'deploy'|--solana-cli|spawnSync\([^,]+, deployArgs|loaderData|writeData|DeployWithMaxDataLen|BPF_LOADER_UPGRADEABLE_PROGRAM_ID|sendTransaction|sendRawTransaction|serialize\(|partialSign\(|signTransaction/);
});

// Repository tooling is strictly prepare-only; any future send path is separate.
