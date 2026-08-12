import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const contract = new URL('../docs/plans/2026-08-11-send-gate-v2-contract-reconciliation.md', import.meta.url);

test('Send-Gate v2 contract reconciliation resolves every prior design blocker without enabling a send path', async () => {
  const text = await readFile(contract, 'utf8');
  const required = [
    '/opt/cumzillaraptors-send-runtime-candidate-v2',
    'no other candidate runtime root is valid',
    'detached Ed25519 signature',
    'root-pinned approver public key',
    'independent reviewer attestation',
    'rejects userinfo outright',
    'no URL credential mechanism exists',
    '/staging/N/solana\nprogram\ndeploy\n--url',
    '--upgrade-authority',
    'No other option is permitted',
    'PATH=/usr/sbin:/usr/bin:/sbin:/bin',
    'stdin: /dev/null',
    'started.json',
    'terminal.json',
    'create-once',
    'never retries',
    'No live authorization record is created',
    'No runtime, key, CLI, sudoers, or network action is authorized',
  ];
  for (const value of required) assert.match(text, new RegExp(value, 'i'), `missing v2 contract requirement: ${value}`);

  for (const forbidden of [
    '/opt/cumzillaraptors-send-runtime-candidate`',
    'solana program deploy --program-id',
    'CUMZ_DEVNET_LAUNCH_AUTHORITY_KEYPAIR_JSON',
  ]) assert.equal(text.includes(forbidden), false, `v2 contract must not embed enabled capability/secret: ${forbidden}`);
});

// Documentation-only contract test: no protected runtime, authorization record,
// filesystem change outside the repository, key, RPC, CLI, signing, or send is exercised.
