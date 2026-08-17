#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { Connection, PublicKey } from '@solana/web3.js';

const EXPECTED = Object.freeze({
  cluster: 'devnet',
  rpc: 'https://api.devnet.solana.com',
  programId: 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY',
  revision: 'cc8e6242e884e0f90a8ce0b9ff58f406240fc4a6',
  artifactSha256: '0691c0eba729f07ab2be110112d0954d4051f198e5ef4d9e85f501fcd0126bf5',
});

function usageError(message) {
  throw new Error(`${message}\nUsage: node scripts/preflight-devnet-deploy.mjs --preflight --artifact-dir <CI-artifact deploy dir> --program-public-key <base58> --payer-public-key <base58> --upgrade-authority-public-key <base58> [--rpc <url>]`);
}

function parseArgs(argv) {
  const parsed = { rpc: EXPECTED.rpc };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--preflight') parsed.preflight = true;
    else if (['--artifact-dir', '--program-public-key', '--payer-public-key', '--upgrade-authority-public-key', '--rpc'].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) usageError(`Missing value for ${argument}.`);
      parsed[argument.slice(2).replaceAll('-', '_')] = value;
      index += 1;
    } else usageError(`Unknown argument: ${argument}`);
  }
  if (!parsed.preflight) usageError('Refusing: pass --preflight for read-only validation.');
  for (const field of ['artifact_dir', 'program_public_key', 'payer_public_key', 'upgrade_authority_public_key']) {
    if (!parsed[field]) usageError(`Missing required --${field.replaceAll('_', '-')}.`);
  }
  return parsed;
}

function publicKey(value, label) {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${label} public key must be a valid base58 Solana address.`);
  }
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function expectText(filePath, expected, label) {
  if (!existsSync(filePath)) throw new Error(`${label} is missing: ${filePath}`);
  const actual = readFileSync(filePath, 'utf8').trim();
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, received ${actual || '(empty)'}.`);
}

function safeRpcLabel(rpc) {
  return new URL(rpc).origin;
}

function safeErrorMessage(error, rpc) {
  const message = error instanceof Error ? error.message : String(error);
  if ((rpc && message.includes(rpc)) || /https?:\/\//i.test(message)) return 'RPC request failed; check the configured endpoint locally.';
  return message;
}

async function preflight(options) {
  const artifactDir = path.resolve(options.artifact_dir);
  const programBinary = path.join(artifactDir, 'cumzillaraptors.so');
  const revisionMarker = path.join(artifactDir, 'cumzillaraptors.build-revision');
  if (!existsSync(programBinary)) throw new Error(`SBPF artifact is missing: ${programBinary}`);
  expectText(revisionMarker, EXPECTED.revision, 'Artifact revision marker');
  const artifactHash = sha256(programBinary);
  if (artifactHash !== EXPECTED.artifactSha256) throw new Error(`SBPF artifact SHA-256 mismatch: expected ${EXPECTED.artifactSha256}, received ${artifactHash}.`);

  const program = publicKey(options.program_public_key, 'Program');
  const payer = publicKey(options.payer_public_key, 'Payer');
  const upgradeAuthority = publicKey(options.upgrade_authority_public_key, 'Upgrade authority');
  const expectedProgram = new PublicKey(EXPECTED.programId);
  if (!program.equals(expectedProgram)) throw new Error(`Program public key mismatch: expected ${expectedProgram.toBase58()}, received ${program.toBase58()}.`);
  if (payer.equals(upgradeAuthority)) throw new Error('Payer and upgrade authority must be separate public keys for pre-send review.');

  const connection = new Connection(options.rpc, 'confirmed');
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], expectedProgram);
  const [slot, programInfo, configInfo, payerBalance, upgradeAuthorityBalance, minimumProgramDataRent, minimumProgramRent, minimumBufferRent] = await Promise.all([
    connection.getSlot(),
    connection.getAccountInfo(expectedProgram, 'confirmed'),
    connection.getAccountInfo(configPda, 'confirmed'),
    connection.getBalance(payer, 'confirmed'),
    connection.getBalance(upgradeAuthority, 'confirmed'),
    connection.getMinimumBalanceForRentExemption(statSync(programBinary).size + 45),
    connection.getMinimumBalanceForRentExemption(36),
    connection.getMinimumBalanceForRentExemption(statSync(programBinary).size + 37),
  ]);
  if (programInfo) throw new Error(`Refusing: program ID already has an on-chain account owned by ${programInfo.owner.toBase58()}. This packet is for first deployment only.`);
  if (configInfo) throw new Error('Refusing: config PDA already exists. This packet is for a fresh deployment only.');

  const peakRentLamports = minimumProgramDataRent + minimumProgramRent + minimumBufferRent;
  const report = {
    mode: 'READ-ONLY PRE-SEND PREFLIGHT',
    guarantee: 'No transaction will be constructed, signed, or sent.',
    cluster: EXPECTED.cluster,
    rpc: safeRpcLabel(options.rpc),
    slot,
    artifact: { path: programBinary, bytes: statSync(programBinary).size, revision: EXPECTED.revision, sha256: artifactHash },
    identities: { programId: expectedProgram.toBase58(), payer: payer.toBase58(), upgradeAuthority: upgradeAuthority.toBase58(), configPda: configPda.toBase58() },
    onChain: { programExists: false, configExists: false, payerLamports: payerBalance, upgradeAuthorityLamports: upgradeAuthorityBalance },
    estimatedRent: {
      programDataLamports: minimumProgramDataRent,
      programLamports: minimumProgramRent,
      temporaryBufferLamports: minimumBufferRent,
      peakLamportsBeforeTemporaryBufferClose: peakRentLamports,
      note: 'Rent values are RPC minimum-balance estimates, not a transaction quote. Network and priority fees require an explicitly approved future unsigned transaction review.',
    },
    nextApproval: 'Review this output. A separate explicit instruction is required before any unsigned deployment transaction is constructed; another separate instruction is required before signing or sending.',
  };
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    await preflight(options);
  } catch (error) {
    console.error(`PREFLIGHT ERROR: ${safeErrorMessage(error, options?.rpc)}`);
    process.exitCode = 1;
  }
}

// This file intentionally contains no deployment, transaction-construction, signing, or sending implementation.
export { EXPECTED, parseArgs, preflight, safeRpcLabel, safeErrorMessage };
