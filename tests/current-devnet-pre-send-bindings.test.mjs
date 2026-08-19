import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const script = path.join(root, 'scripts', 'preflight-devnet-deploy.mjs');
const { EXPECTED } = await import(pathToFileURL(script).href);

const PROGRAM_ID = 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY';
const REVISION = '8b5bcf1d9278b61780be33dc2e4a9707859155da';
const SHA256 = '7af3f53c050aa613fd0a68ca461d93b51620e941775188f258ba33eb5305b44b';
const BYTES = 411944;
const UPGRADE_AUTHORITY = '71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r';

test('read-only Devnet preflight semantically binds the current validated public-mint artifact', () => {
  assert.equal(EXPECTED.programId, PROGRAM_ID);
  assert.equal(EXPECTED.revision, REVISION);
  assert.equal(EXPECTED.artifactSha256, SHA256);
  assert.equal(EXPECTED.artifactBytes, BYTES);
  assert.equal(EXPECTED.upgradeAuthority, UPGRADE_AUTHORITY);
});

test('read-only Devnet preflight accepts public keys only and has no private-key or send capability', async () => {
  const source = await readFile(script, 'utf8');
  assert.match(source, /--program-public-key/);
  assert.match(source, /--payer-public-key/);
  assert.match(source, /--upgrade-authority-public-key/);
  assert.doesNotMatch(source, /Keypair|fromSecretKey|keypairPath|--program-keypair|--payer-keypair|--upgrade-authority-keypair/);
  assert.doesNotMatch(source, /Transaction|sendTransaction|sendRawTransaction|sendAndConfirm|signTransaction|\.sign\(|BpfLoader|programDeploy/);
});
