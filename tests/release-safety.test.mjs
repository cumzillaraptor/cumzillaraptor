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

test('x86 claim evidence and conditional approval packet remain evidence-only and fail closed', async () => {
  const packetDir = path.join(root, 'docs', 'approval-packets');
  const [evidence, approval] = await Promise.all([
    readFile(path.join(packetDir, '2026-08-10-x86-claim-validation-evidence.md'), 'utf8'),
    readFile(path.join(packetDir, '2026-08-03-post-x86-devnet-transaction-approval.md'), 'utf8'),
  ]);
  const revision = '7300a13f742b62ccdf52c4ca5097617529d010f9';
  const releaseSha256 = 'e5cdbe1ec45093516e1dd7224985c34303c9c632d2db80d37ac1c83ed05998d0';
  const validationSha256 = 'cc8e1090490345486bb16c8706d2fb990326335552b4caaf8f39ee61bd24b5bc';

  for (const document of [evidence, approval]) {
    assert.match(document, new RegExp(revision));
    assert.match(document, /https:\/\/github\.com\/cumzillaraptor\/cumzillaraptor\/actions\/runs\/31346212120/);
    assert.match(document, new RegExp(releaseSha256));
    assert.match(document, /397040/);
    assert.match(document, new RegExp(validationSha256));
    assert.match(document, /396424/);
    assert.match(document, /no authorization now/i);
    assert.match(document, /fresh read-only pre-send review/i);
    assert.match(document, /no Devnet signing, deployment, funding, or upload/i);
  }
  assert.match(evidence, new RegExp(releaseSha256));
  assert.match(evidence, /397040/);
  assert.match(evidence, new RegExp(validationSha256));
  assert.match(evidence, /396424/);
  assert.match(approval, new RegExp(releaseSha256));
  assert.match(approval, /exact release artifact/i);
  assert.match(approval, /Current live Devnet/i);
  assert.match(approval, /estimated fee\/rent\/cost/i);
  assert.match(approval, /Ordered instruction program IDs/i);
  assert.match(approval, /Full unsigned transaction message details/i);
  assert.match(approval, /Only after that fresh read-only pre-send review passes/i);
  for (const document of [evidence, approval]) {
    assert.doesNotMatch(document, /f1e9755d0c081341231bfadf50f06e4170a59065/);
    assert.doesNotMatch(document, /f969f6bcb11d5bfea9a528963fce7c29e553666b5895747e3ab0c4bea051b29d/);
    assert.doesNotMatch(document, /5e521a4|cba842d/);
  }
  assert.doesNotMatch(`${evidence}\n${approval}`, /private key|secret key|seed phrase/i);
});
