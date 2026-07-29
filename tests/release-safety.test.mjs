import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const mintPage = path.join(root, 'cumzillaraptors', 'index.html');
const legacyDeployer = path.join(root, 'scripts', 'deploy-devnet.js');

async function exists(file) {
  try {
    await access(file, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

test('mint page contains no live transaction construction before audited client release', async () => {
  const source = await readFile(mintPage, 'utf8');

  assert.doesNotMatch(source, /11111111111111111111111111111111/);
  assert.doesNotMatch(source, /placeholder/i);
  assert.doesNotMatch(source, /sendRawTransaction|signTransaction|signMessage/);
  assert.doesNotMatch(source, /window\.(?:solana|ethereum)|Phantom|MetaMask|wallet-adapter/i);
  assert.doesNotMatch(source, /<script\b[^>]+src=/i);
  assert.doesNotMatch(source, /innerHTML/);
  assert.match(source, /Devnet rebuild in progress/);
  assert.match(source, /Mint unavailable during audit/);
  assert.match(source, /Claims unavailable during audit/);
  assert.match(source, /aria-disabled="true"/);
});

test('legacy handwritten deploy script is absent', async () => {
  assert.equal(await exists(legacyDeployer), false);
});

test('security status documents the launch gate', async () => {
  const status = await readFile(path.join(root, 'docs', 'SECURITY_STATUS.md'), 'utf8');
  assert.match(status, /DO NOT DEPLOY/i);
  assert.match(status, /build-pipeline evidence only/i);
  assert.match(status, /verified keypair/i);
});
