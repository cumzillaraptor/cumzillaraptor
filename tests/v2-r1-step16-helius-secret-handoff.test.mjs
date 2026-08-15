import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CONTRACT = new URL('../docs/operations/v2-r1-step16-helius-secret-handoff.md', import.meta.url);
const EXPECTED_SHA256 = '761505b446f626ffabfc7b5c28eb8c88c69da349da1274007669803c2a805c42';

function validateContract(source) {
  assert.equal(createHash('sha256').update(source, 'utf8').digest('hex'), EXPECTED_SHA256);
}

test('Step 16 Helius secret-handoff contract is the exact reviewed canonical document', async () => {
  validateContract(await readFile(CONTRACT, 'utf8'));
});

test('canonical comparison rejects secret exposure, endpoint substitution, consumer ambiguity, and capability escalation', async () => {
  const source = await readFile(CONTRACT, 'utf8');
  const mutations = [
    source.replace('8718a0230e2c068e90befc399138248a6f9abb69', '0'.repeat(40)),
    source.replace('/home/piadmin/.config/cumzillaraptors/helius-devnet-rpc.url', '/home/piadmin/.env'),
    source.replace('immediate containing directory `/home/piadmin/.config/cumzillaraptors` must be owned by piadmin and mode exactly `0700`', 'some ancestor may be owner-only'),
    source.replace('The secret file must be a non-symlink regular file owned by piadmin and mode exactly `0600`.', 'The secret file may be a symlink, nonregular, or weak-mode file.'),
    source.replace('Every path component `/home`, `/home/piadmin`, `/home/piadmin/.config`, and `/home/piadmin/.config/cumzillaraptors` must be a directly inspected non-symlink directory', 'path components need not be checked'),
    source.replace('`https://devnet.helius-rpc.com/?api-key=<token>`', '`https://mainnet.helius-rpc.com/?api-key=<token>`'),
    source.replace('scheme `https`', 'scheme `http`'),
    source.replace('hostname `devnet.helius-rpc.com`', 'hostname `mainnet.helius-rpc.com`'),
    source.replace('omitted port or port `443`', 'any port'),
    source.replace('pathname `/`', 'any pathname'),
    source.replace('empty fragment', 'a fragment is permitted'),
    source.replace('empty username/password', 'userinfo is permitted'),
    source.replace('exactly one query pair named `api-key`', 'one or more query pairs'),
    source.replace('nonempty ASCII token matching `[A-Za-z0-9_-]+`', 'any token bytes'),
    source.replace('no newline, carriage return, whitespace, control byte', 'whitespace and control bytes are permitted'),
    source.replace('duplicate `api-key` parameters, any additional parameter, percent-encoding, or any alternate spelling fails closed', 'duplicate api-key parameters are permitted'),
    source.replace('`scripts/review-devnet-deployment.mjs`', '`scripts/alternate-reviewer.mjs`'),
    source.replace('whose complete UTF-8 bytes must SHA-256 hash to `eed10be9a2b5cb11dce9c5a217fad0419a6f096f5597b80671ed0d0e30b0bdae` before any handoff', 'without a consumer hash check'),
    source.replace('must never be accepted from CLI arguments, environment variables', 'may be accepted from CLI arguments'),
    source.replace('It must not persist the secret into a temporary file, child argument vector, environment', 'It may persist the secret in a child argument vector'),
    source.replace('It must not sign, serialize for submission, send, deploy', 'It may sign, send, and deploy'),
  ];
  for (const mutation of mutations) assert.throws(() => validateContract(mutation));
});

// Repository-text test only: it must not read local secret paths, environment values, host state, or network.
