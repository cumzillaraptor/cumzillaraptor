import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'verify-devnet-authority-secret.yml');
const authority = '71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r';

const expectedWorkflow = `name: Verify Devnet Authority Secret Identity

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  verify-authority-secret:
    name: Verify public identity only
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install locked dependencies without lifecycle scripts
        shell: bash
        run: npm ci --ignore-scripts

      - name: Derive and verify the public Devnet authority identity
        shell: bash
        env:
          CUMZ_DEVNET_LAUNCH_AUTHORITY_KEYPAIR_JSON: \${{ secrets.CUMZ_DEVNET_LAUNCH_AUTHORITY_KEYPAIR_JSON }}
        run: |
          set -euo pipefail
          node <<'NODE'
          const { Keypair } = require('@solana/web3.js');

          const expected = '${authority}';
          const raw = process.env.CUMZ_DEVNET_LAUNCH_AUTHORITY_KEYPAIR_JSON;
          if (typeof raw !== 'string' || raw.length === 0) {
            process.stderr.write('AUTHORITY SECRET VERIFICATION ERROR: secret is unavailable or empty.\\n');
            process.exitCode = 1;
          } else {
            try {
              const parsed = JSON.parse(raw);
              if (!Array.isArray(parsed) || parsed.length !== 64 || !parsed.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
                throw new Error('secret is not a 64-byte keypair array');
              }
              const actual = Keypair.fromSecretKey(Uint8Array.from(parsed)).publicKey.toBase58();
              if (actual !== expected) {
                process.stderr.write('AUTHORITY SECRET VERIFICATION ERROR: derived public authority mismatch.\\n');
                process.exitCode = 1;
              } else {
                process.stdout.write(\`\${actual}\\n\`);
              }
            } catch {
              process.stderr.write('AUTHORITY SECRET VERIFICATION ERROR: secret is malformed.\\n');
              process.exitCode = 1;
            }
          }
          NODE
`;

test('manual GitHub Actions authority-secret verifier has exactly the reviewed closed scope', async () => {
  const source = await readFile(workflowPath, 'utf8');
  assert.equal(source, expectedWorkflow, 'the whole workflow is the closed approved inventory and output grammar');
});

test('canonical workflow has the expected public identity and no secret-output/persistence capability', () => {
  assert.match(expectedWorkflow, new RegExp(`const expected = '${authority}';`));
  assert.match(expectedWorkflow, /process\.stdout\.write\(`\$\{actual\}\\n`\)/);
  assert.equal((expectedWorkflow.match(/CUMZ_DEVNET_LAUNCH_AUTHORITY_KEYPAIR_JSON/g) ?? []).length, 3);
  for (const forbidden of [
    'actions/upload-artifact', 'actions/cache', 'cache: npm', 'solana program deploy', 'sendTransaction',
    'sendRawTransaction', 'requestAirdrop', 'curl ', 'wget ', 'gh ', 'tee ',
    'writeFile', 'fs.writeFile', 'console.log(', 'printenv', 'env |',
    'child_process', 'spawn(', 'exec(', 'fetch(', 'http:', 'https:', 'net:',
  ]) assert.equal(expectedWorkflow.includes(forbidden), false, `canonical workflow must not contain ${forbidden}`);
});
