#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import web3 from '@solana/web3.js';

const {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
} = web3;
const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

const EXPECTED = Object.freeze({
  cluster: 'devnet',
  devnetGenesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  rpc: 'https://api.devnet.solana.com',
  programId: 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY',
  revision: '8b5bcf1d9278b61780be33dc2e4a9707859155da',
  artifactSha256: '7af3f53c050aa613fd0a68ca461d93b51620e941775188f258ba33eb5305b44b',
  artifactBytes: 411944,
  upgradeAuthority: '71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r',
  bufferChunkBytes: 900,
  programDataMetadataBytes: 45,
  programAccountBytes: 36,
  bufferMetadataBytes: 37,
});

function usageError(message) {
  throw new Error(`${message}\nUsage: node scripts/review-devnet-deployment.mjs --review-only --artifact-dir <CI-artifact deploy dir> --program-keypair <path> --payer-keypair <path> --upgrade-authority-keypair <path> [--rpc <url>]`);
}

function parseArgs(argv) {
  const parsed = { rpc: EXPECTED.rpc };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--review-only') parsed.reviewOnly = true;
    else if (['--artifact-dir', '--program-keypair', '--payer-keypair', '--upgrade-authority-keypair', '--rpc'].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) usageError(`Missing value for ${argument}.`);
      parsed[argument.slice(2).replaceAll('-', '_')] = value;
      index += 1;
    } else usageError(`Unknown argument: ${argument}`);
  }
  if (!parsed.reviewOnly) usageError('Refusing: pass --review-only to construct unsigned messages only.');
  for (const field of ['artifact_dir', 'program_keypair', 'payer_keypair', 'upgrade_authority_keypair']) {
    if (!parsed[field]) usageError(`Missing required --${field.replaceAll('_', '-')}.`);
  }
  return parsed;
}

function keypairFromPath(keypairPath, label) {
  if (!existsSync(keypairPath)) throw new Error(`${label} keypair path does not exist: ${keypairPath}`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf8'))));
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
  const url = new URL(rpc);
  // Paths (for example /v2/<API_KEY>) can contain provider credentials too.
  // Display only the origin; never expose userinfo, paths, queries, or fragments.
  return url.origin;
}

function loaderData(tag, fields = []) {
  const tagBytes = Buffer.alloc(4);
  tagBytes.writeUInt32LE(tag);
  return Buffer.concat([tagBytes, ...fields]);
}

function writeData(offset, bytes) {
  const offsetBytes = Buffer.alloc(4);
  offsetBytes.writeUInt32LE(offset);
  const lengthBytes = Buffer.alloc(8);
  lengthBytes.writeBigUInt64LE(BigInt(bytes.length));
  return loaderData(1, [offsetBytes, lengthBytes, bytes]);
}

function deployData(maxDataLength) {
  const lengthBytes = Buffer.alloc(8);
  lengthBytes.writeBigUInt64LE(BigInt(maxDataLength));
  return loaderData(2, [lengthBytes]);
}

function instructionSummary(instruction) {
  return {
    programId: instruction.programId.toBase58(),
    dataBytes: instruction.data.length,
    accounts: instruction.keys.map((key) => ({
      publicKey: key.pubkey.toBase58(),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
  };
}

async function summarizeUnsignedTransaction(connection, feeCache, { label, transaction, recentBlockhash }) {
  transaction.feePayer ??= transaction.instructions[0]?.keys.find((key) => key.isSigner)?.pubkey;
  transaction.recentBlockhash = recentBlockhash;
  const message = transaction.compileMessage();
  const signerCount = message.header.numRequiredSignatures;
  // Base transaction fees are determined by required signatures. Cache the live
  // quote per signer count so a large program does not cause hundreds of public
  // RPC requests merely to repeat the same fee estimate.
  if (!feeCache.has(signerCount)) feeCache.set(signerCount, connection.getFeeForMessage(message, 'confirmed'));
  const fee = await feeCache.get(signerCount);
  const requiredSigners = message.accountKeys.slice(0, signerCount).map((key) => key.toBase58());
  return {
    label,
    recentBlockhash,
    requiredSigners,
    signatures: requiredSigners.map((publicKey) => ({ publicKey, signature: null })),
    estimatedNetworkFeeLamports: fee.value,
    message: {
      accountKeys: message.accountKeys.map((key) => key.toBase58()),
      instructions: transaction.instructions.map(instructionSummary),
    },
  };
}

async function review(options) {
  const artifactDir = path.resolve(options.artifact_dir);
  const programBinary = path.join(artifactDir, 'cumzillaraptors.so');
  const revisionMarker = path.join(artifactDir, 'cumzillaraptors.build-revision');
  if (!existsSync(programBinary)) throw new Error(`SBPF artifact is missing: ${programBinary}`);
  expectText(revisionMarker, EXPECTED.revision, 'Artifact revision marker');
  const artifactHash = sha256(programBinary);
  if (artifactHash !== EXPECTED.artifactSha256) throw new Error(`SBPF artifact SHA-256 mismatch: expected ${EXPECTED.artifactSha256}, received ${artifactHash}.`);

  const programKeypair = keypairFromPath(options.program_keypair, 'Program');
  const payerKeypair = keypairFromPath(options.payer_keypair, 'Payer');
  const upgradeAuthorityKeypair = keypairFromPath(options.upgrade_authority_keypair, 'Upgrade authority');
  const expectedProgram = new PublicKey(EXPECTED.programId);
  const expectedUpgradeAuthority = new PublicKey(EXPECTED.upgradeAuthority);
  if (!programKeypair.publicKey.equals(expectedProgram)) throw new Error(`Program keypair mismatch: expected ${expectedProgram.toBase58()}, received ${programKeypair.publicKey.toBase58()}.`);
  if (!upgradeAuthorityKeypair.publicKey.equals(expectedUpgradeAuthority)) throw new Error(`Upgrade authority keypair mismatch: expected ${expectedUpgradeAuthority.toBase58()}, received ${upgradeAuthorityKeypair.publicKey.toBase58()}.`);
  if (payerKeypair.publicKey.equals(upgradeAuthorityKeypair.publicKey)) throw new Error('Payer and upgrade authority must be separate public keys.');

  const programBytes = readFileSync(programBinary);
  if (programBytes.length !== EXPECTED.artifactBytes) throw new Error(`SBPF artifact byte-length mismatch: expected ${EXPECTED.artifactBytes}, received ${programBytes.length}.`);
  const connection = new Connection(options.rpc, 'confirmed');
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], expectedProgram);
  const [genesisHash, programInfo, configInfo, payerLamports, upgradeAuthorityLamports, programDataRent, programRent, bufferRent, latestBlockhash] = await Promise.all([
    connection.getGenesisHash(),
    connection.getAccountInfo(expectedProgram, 'confirmed'),
    connection.getAccountInfo(configPda, 'confirmed'),
    connection.getBalance(payerKeypair.publicKey, 'confirmed'),
    connection.getBalance(upgradeAuthorityKeypair.publicKey, 'confirmed'),
    connection.getMinimumBalanceForRentExemption(programBytes.length + EXPECTED.programDataMetadataBytes),
    connection.getMinimumBalanceForRentExemption(EXPECTED.programAccountBytes),
    connection.getMinimumBalanceForRentExemption(programBytes.length + EXPECTED.bufferMetadataBytes),
    connection.getLatestBlockhash('confirmed'),
  ]);
  if (genesisHash !== EXPECTED.devnetGenesisHash) throw new Error(`Refusing: RPC genesis hash is not Solana devnet (${genesisHash}).`);
  if (programInfo) throw new Error(`Refusing: program ID already has an on-chain account owned by ${programInfo.owner.toBase58()}. This tool supports first deployment only.`);
  if (configInfo) throw new Error('Refusing: config PDA already exists. This tool supports first deployment only.');

  // This public key is ephemeral review data. The private half never leaves process memory,
  // is never used to sign, and is discarded as soon as the process exits.
  const bufferKeypair = Keypair.generate();
  const buffer = bufferKeypair.publicKey;
  const createBuffer = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payerKeypair.publicKey,
      newAccountPubkey: buffer,
      lamports: bufferRent,
      space: programBytes.length + EXPECTED.bufferMetadataBytes,
      programId: BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
    }),
    {
      programId: BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
      keys: [
        { pubkey: buffer, isSigner: false, isWritable: true },
        { pubkey: upgradeAuthorityKeypair.publicKey, isSigner: false, isWritable: false },
      ],
      data: loaderData(0),
    },
  );
  createBuffer.feePayer = payerKeypair.publicKey;

  const feeCache = new Map();
  const transactions = [await summarizeUnsignedTransaction(connection, feeCache, {
    label: 'create and initialize buffer', transaction: createBuffer, recentBlockhash: latestBlockhash.blockhash,
  })];
  for (let offset = 0; offset < programBytes.length; offset += EXPECTED.bufferChunkBytes) {
    const chunk = programBytes.subarray(offset, offset + EXPECTED.bufferChunkBytes);
    const write = new Transaction().add({
      programId: BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
      keys: [
        { pubkey: buffer, isSigner: false, isWritable: true },
        { pubkey: upgradeAuthorityKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data: writeData(offset, chunk),
    });
    write.feePayer = payerKeypair.publicKey;
    transactions.push(await summarizeUnsignedTransaction(connection, feeCache, {
      label: `write buffer bytes ${offset}-${offset + chunk.length - 1}`, transaction: write, recentBlockhash: latestBlockhash.blockhash,
    }));
  }
  const [programData] = PublicKey.findProgramAddressSync([expectedProgram.toBuffer()], BPF_LOADER_UPGRADEABLE_PROGRAM_ID);
  const deploy = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payerKeypair.publicKey,
      newAccountPubkey: expectedProgram,
      lamports: programRent,
      space: EXPECTED.programAccountBytes,
      programId: BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
    }),
    {
      programId: BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
      keys: [
        { pubkey: payerKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: programData, isSigner: false, isWritable: true },
        { pubkey: expectedProgram, isSigner: true, isWritable: true },
        { pubkey: buffer, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: upgradeAuthorityKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data: deployData(programBytes.length),
    },
  );
  deploy.feePayer = payerKeypair.publicKey;
  transactions.push(await summarizeUnsignedTransaction(connection, feeCache, {
    label: 'deploy program', transaction: deploy, recentBlockhash: latestBlockhash.blockhash,
  }));

  const totalNetworkFeesLamports = transactions.reduce((total, transaction) => total + (transaction.estimatedNetworkFeeLamports ?? 0), 0);
  const peakLamports = programDataRent + programRent + bufferRent + totalNetworkFeesLamports;
  if (payerLamports < peakLamports) throw new Error(`Insufficient payer balance for reviewed plan: need at least ${peakLamports} lamports, have ${payerLamports}.`);
  console.log(JSON.stringify({
    mode: 'UNSIGNED DEPLOYMENT REVIEW ONLY',
    guarantee: 'No transaction will be signed or sent. The displayed messages are incomplete and cannot be submitted.',
    cluster: EXPECTED.cluster,
    rpc: safeRpcLabel(options.rpc),
    genesisHash,
    artifact: { path: programBinary, bytes: programBytes.length, revision: EXPECTED.revision, sha256: artifactHash },
    identities: {
      programId: expectedProgram.toBase58(), payer: payerKeypair.publicKey.toBase58(), upgradeAuthority: upgradeAuthorityKeypair.publicKey.toBase58(),
      buffer: buffer.toBase58(), programData: programData.toBase58(), configPda: configPda.toBase58(),
    },
    onChain: { programExists: false, configExists: false, payerLamports, upgradeAuthorityLamports },
    estimatedCosts: { programDataRentLamports: programDataRent, programRentLamports: programRent, temporaryBufferRentLamports: bufferRent, estimatedNetworkFeesLamports: totalNetworkFeesLamports, peakLamportsBeforeBufferClose: peakLamports, note: 'The temporary buffer rent is expected to be returned to the payer when deployment closes the buffer. Fees are RPC estimates and may change before a separately approved signing step.' },
    transactions,
    requiredFutureApproval: 'A separate explicit instruction is required before this reviewed transaction plan may be signed or sent.',
  }, null, 2));
}

function safeErrorMessage(error, rpc) {
  const message = error instanceof Error ? error.message : String(error);
  // HTTP clients can echo their complete request URL in connection failures.
  // Never surface such messages because an RPC URL may embed credentials.
  if ((rpc && message.includes(rpc)) || /https?:\/\//i.test(message)) {
    return 'RPC request failed; check the configured endpoint locally.';
  }
  return message;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    await review(options);
  } catch (error) {
    console.error(`DEPLOYMENT REVIEW ERROR: ${safeErrorMessage(error, options?.rpc)}`);
    process.exitCode = 1;
  }
}

// Deliberately no signing, serialization, file output, or RPC send capability exists in this tool.
export { EXPECTED, parseArgs, review, safeRpcLabel, safeErrorMessage };
