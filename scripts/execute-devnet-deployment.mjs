#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED = Object.freeze({
  rpc: 'https://api.devnet.solana.com',
});
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REVIEW_SCRIPT = path.join(SCRIPT_DIR, 'review-devnet-deployment.mjs');
const APPROVED_REVIEW_SCRIPT_SHA256 = 'eed10be9a2b5cb11dce9c5a217fad0419a6f096f5597b80671ed0d0e30b0bdae';

function safeErrorMessage(error, rpc) {
  const message = error instanceof Error ? error.message : String(error);
  if ((rpc && message.includes(rpc)) || /https?:\/\//i.test(message)) return 'RPC request failed; check the configured endpoint locally.';
  return message;
}

function usageError(message) {
  throw new Error(`${message}\nUsage: node scripts/execute-devnet-deployment.mjs --prepare --artifact-dir <approved artifact dir> --program-keypair <path> --payer-keypair <path> --upgrade-authority-keypair <path>`);
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function parseArgs(argv) {
  const parsed = { rpc: EXPECTED.rpc };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--prepare') parsed.prepare = true;
    else if (argument === '--send') usageError('Refusing: send mode is unavailable in repository source. Use only the separately audited root-owned runtime after a new explicit authorization.');
    else if (['--artifact-dir', '--program-keypair', '--payer-keypair', '--upgrade-authority-keypair'].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) usageError(`Missing value for ${argument}.`);
      parsed[argument.slice(2).replaceAll('-', '_')] = value;
      index += 1;
    } else usageError(`Unknown argument: ${argument}`);
  }
  if (!parsed.prepare) usageError('Refusing: pass --prepare for a fresh pre-sign review.');
  for (const field of ['artifact_dir', 'program_keypair', 'payer_keypair', 'upgrade_authority_keypair']) {
    if (!parsed[field]) usageError(`Missing required --${field.replaceAll('_', '-')}.`);
  }
  return parsed;
}

function buildReviewArgs(options) {
  return [
    REVIEW_SCRIPT, '--review-only',
    '--artifact-dir', options.artifact_dir,
    '--program-keypair', options.program_keypair,
    '--payer-keypair', options.payer_keypair,
    '--upgrade-authority-keypair', options.upgrade_authority_keypair,
  ];
}

function removeStagingDirectory(directory) {
  try { chmodSync(directory, 0o700); } catch { /* cleanup will still be attempted */ }
  rmSync(directory, { recursive: true, force: true });
}

function stageTrustedReviewScript() {
  const review = realpathSync(REVIEW_SCRIPT);
  const stats = statSync(review);
  if (!stats.isFile() || stats.uid !== process.getuid() || (stats.mode & 0o022) !== 0) throw new Error('Trusted review script must be an owner-only regular file.');
  if (sha256(review) !== APPROVED_REVIEW_SCRIPT_SHA256) throw new Error('Trusted review script SHA-256 mismatch.');
  const stagingDir = mkdtempSync(path.join(SCRIPT_DIR, '.review-stage-'));
  const staged = path.join(stagingDir, 'review-devnet-deployment.mjs');
  copyFileSync(review, staged, 0);
  chmodSync(staged, 0o500);
  chmodSync(stagingDir, 0o500);
  const stagedStats = statSync(staged);
  if (!stagedStats.isFile() || stagedStats.uid !== process.getuid() || (stagedStats.mode & 0o022) !== 0 || sha256(staged) !== APPROVED_REVIEW_SCRIPT_SHA256) {
    removeStagingDirectory(stagingDir);
    throw new Error('Trusted review script staging failed.');
  }
  return { stagingDir, staged };
}

function requireTrustedKeypair(keypairPath, label) {
  const resolved = realpathSync(keypairPath);
  const stats = statSync(resolved);
  if (!stats.isFile() || stats.uid !== process.getuid() || (stats.mode & 0o077) !== 0) throw new Error(`${label} keypair must be an owner-only regular file.`);
  return resolved;
}

function stageTrustedKeypairs(options) {
  const keypairs = [
    ['program', options.program_keypair],
    ['payer', options.payer_keypair],
    ['upgrade-authority', options.upgrade_authority_keypair],
  ];
  const stagingDir = mkdtempSync('/tmp/cumzillaraptors-keypairs-');
  try {
    const staged = {};
    for (const [label, source] of keypairs) {
      const trusted = requireTrustedKeypair(source, label);
      const destination = path.join(stagingDir, `${label}.json`);
      copyFileSync(trusted, destination, 0);
      chmodSync(destination, 0o600);
      if (sha256(destination) !== sha256(trusted)) throw new Error(`${label} keypair staging hash mismatch.`);
      staged[`${label.replaceAll('-', '_')}_keypair`] = destination;
    }
    chmodSync(stagingDir, 0o500);
    return { stagingDir, options: { ...options, ...staged } };
  } catch (error) {
    removeStagingDirectory(stagingDir);
    throw error;
  }
}

function runReview(options) {
  const { stagingDir, staged } = stageTrustedReviewScript();
  try {
    const { status, stdout } = spawnSync(process.execPath, [staged, ...buildReviewArgs(options).slice(1)], { cwd: SCRIPT_DIR, encoding: 'utf8' });
    if (status !== 0) throw new Error('Fresh unsigned deployment review failed; refusing to continue.');
    process.stdout.write(stdout);
  } finally {
    removeStagingDirectory(stagingDir);
  }
}

function execute(options) {
  const keypairs = stageTrustedKeypairs(options);
  try {
    runReview(keypairs.options);
    console.log(JSON.stringify({
      mode: 'FRESH PRE-SIGN REVIEW COMPLETE',
      guarantee: 'No deployment command was invoked. No transaction was signed or sent.',
      nextApproval: 'This repository executor is prepare-only. Any future send-capable operation must use the separately audited root-owned runtime and requires a new explicit authorization.',
    }, null, 2));
  } finally {
    removeStagingDirectory(keypairs.stagingDir);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    execute(options);
  } catch (error) {
    console.error(`DEPLOYMENT EXECUTOR ERROR: ${safeErrorMessage(error, options?.rpc)}`);
    process.exitCode = 1;
  }
}

export { EXPECTED, parseArgs, buildReviewArgs, stageTrustedReviewScript, requireTrustedKeypair, stageTrustedKeypairs, runReview, execute };
