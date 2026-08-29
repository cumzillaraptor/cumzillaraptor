import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workerSource = await readFile(new URL('../worker.js', import.meta.url), 'utf8');

test('RPC proxy permits headers sent by the Solana browser client', () => {
  const allowHeaders = workerSource.match(
    /["']Access-Control-Allow-Headers["']\s*:\s*["']([^"']+)["']/i,
  );

  assert.ok(allowHeaders, 'worker must declare Access-Control-Allow-Headers');
  const headers = allowHeaders[1]
    .split(',')
    .map((header) => header.trim().toLowerCase());

  assert.ok(headers.includes('content-type'));
  assert.ok(headers.includes('solana-client'));
});

test('RPC proxy permits browser POST preflights', () => {
  assert.match(workerSource, /Access-Control-Allow-Methods["']\s*:\s*["']POST, OPTIONS/i);
  assert.match(workerSource, /request\.method === ["']OPTIONS["']/);
});
