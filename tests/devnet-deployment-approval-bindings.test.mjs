import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const identity = Object.freeze({
  programId: 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY',
  revision: '8b5bcf1d9278b61780be33dc2e4a9707859155da',
  artifactSha256: '7af3f53c050aa613fd0a68ca461d93b51620e941775188f258ba33eb5305b44b',
  artifactBytes: 411944,
  upgradeAuthority: '71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r',
});

const preflight = await import(pathToFileURL(path.join(root, 'scripts', 'preflight-devnet-deploy.mjs')).href);
const review = await import(pathToFileURL(path.join(root, 'scripts', 'review-devnet-deployment.mjs')).href);

test('all unsigned Devnet deployment evidence tooling binds the current x86-validated release identity', () => {
  for (const expected of [preflight.EXPECTED, review.EXPECTED]) {
    assert.equal(expected.programId, identity.programId);
    assert.equal(expected.revision, identity.revision);
    assert.equal(expected.artifactSha256, identity.artifactSha256);
  }
  assert.equal(review.EXPECTED.artifactBytes, identity.artifactBytes);
  assert.equal(review.EXPECTED.upgradeAuthority, identity.upgradeAuthority);
});

test('preflight stays public-key-only and review remains unsigned-only', async () => {
  const { readFile } = await import('node:fs/promises');
  const [preflightSource, reviewSource] = await Promise.all([
    readFile(path.join(root, 'scripts', 'preflight-devnet-deploy.mjs'), 'utf8'),
    readFile(path.join(root, 'scripts', 'review-devnet-deployment.mjs'), 'utf8'),
  ]);
  assert.doesNotMatch(preflightSource, /Keypair|fromSecretKey|sendTransaction|signTransaction/);
  assert.match(reviewSource, /No transaction will be signed or sent/);
  assert.doesNotMatch(reviewSource, /sendTransaction|sendRawTransaction|sendAndConfirm|\.sign\(|signTransaction|requestAirdrop/);
});

export { identity };
