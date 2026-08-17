import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const script = path.join(root, 'scripts', 'preflight-devnet-deploy.mjs');
const { EXPECTED } = await import(pathToFileURL(script).href);

const PROGRAM_ID = 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY';
const REVISION = 'cc8e6242e884e0f90a8ce0b9ff58f406240fc4a6';
const SHA256 = '0691c0eba729f07ab2be110112d0954d4051f198e5ef4d9e85f501fcd0126bf5';

test('read-only Devnet preflight semantically binds the current validated public-mint artifact', () => {
  assert.equal(EXPECTED.programId, PROGRAM_ID);
  assert.equal(EXPECTED.revision, REVISION);
  assert.equal(EXPECTED.artifactSha256, SHA256);
});

test('read-only Devnet preflight accepts public keys only and has no private-key or send capability', async () => {
  const source = await readFile(script, 'utf8');
  assert.match(source, /--program-public-key/);
  assert.match(source, /--payer-public-key/);
  assert.match(source, /--upgrade-authority-public-key/);
  assert.doesNotMatch(source, /Keypair|fromSecretKey|keypairPath|--program-keypair|--payer-keypair|--upgrade-authority-keypair/);
  assert.doesNotMatch(source, /Transaction|sendTransaction|sendRawTransaction|sendAndConfirm|signTransaction|\.sign\(|BpfLoader|programDeploy/);
});
