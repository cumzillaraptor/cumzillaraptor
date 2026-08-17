import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SRC = new URL('../tools/v2_r1_tpm_preflight/esapi_preflight.c', import.meta.url);
const HDR = new URL('../tools/v2_r1_tpm_preflight/esapi_preflight.h', import.meta.url);
const FIXTURE = new URL('./fixtures/v2-r1-step27-esapi-preflight-fixture.c', import.meta.url);
const REVIEW = new URL('../docs/operations/v2-r1-step27-esapi-preflight-review.md', import.meta.url);
const C_FORBIDDEN = [
  'tss2_esys.h', 'Esys_Initialize', 'Esys_Finalize', 'Tss2_Tcti', '/dev/tpm',
  'dlopen', 'dlsym(', 'system(', 'popen(', 'fork(', 'vfork(',
  'exec(', 'execve(', 'execl(', 'execvp(', 'spawn(',
  'open(', 'creat(', 'read(', 'write(', 'fopen(', 'fread(', 'fwrite(',
  'unlink(', 'rename(', 'chmod(', 'stat(', 'lstat(', 'fstat(', 'readlink(', 'realpath(',
  'opendir(', 'ioctl(', 'syscall(',
  'socket(', 'connect(', 'bind(', 'listen(', 'accept(', 'send(', 'recv(', 'getaddrinfo(',
  'Esys_GetCapability', 'Tss2_Sys_',
  'NV_DefineSpace', 'NV_Write', 'NV_Increment', 'Clear', 'HierarchyChangeAuth',
  'tpm2-tools'
];
const REVIEW_FORBIDDEN = [
  'tss2_esys.h', 'Esys_Initialize', 'Esys_Finalize', 'Tss2_Tcti', '/dev/tpm',
  'NV_DefineSpace', 'NV_Write', 'NV_Increment', 'Clear', 'HierarchyChangeAuth',
  'tpm2-tools'
];

test('Step 27 ESAPI preflight source is fixture-only and has no TPM host capability', async () => {
  const [source, header] = await Promise.all([readFile(SRC, 'utf8'), readFile(HDR, 'utf8')]);
  assert.match(source, /#ifndef STEP27_ESAPI_PREFLIGHT_FIXTURE/);
  assert.match(source, /#error/);
  assert.match(source, /step27_evaluate_esapi_capabilities/);
  assert.match(header, /STEP27_ESAPI_FACT_TPM2/);
  for (const forbidden of C_FORBIDDEN) assert.equal(source.includes(forbidden), false, `source forbidden: ${forbidden}`);
});

test('Step 27 ESAPI preflight model defines a closed injected fact/result boundary', async () => {
  const header = await readFile(HDR, 'utf8');
  for (const token of [
    'STEP27_ESAPI_FACT_PRESENT', 'STEP27_ESAPI_FACT_TPM2',
    'STEP27_ESAPI_FACT_NV_COUNTER', 'STEP27_ESAPI_FACT_POLICY_PRIMITIVES',
    'STEP27_ESAPI_FACT_OPAQUE_IDENTITY', 'STEP27_PREFLIGHT_COMPATIBLE',
    'STEP27_PREFLIGHT_DENY_OPAQUE'
  ]) assert.match(header, new RegExp(token));
  const source = await readFile(SRC, 'utf8');
  assert.match(source, /fact == expected/);
  assert.match(source, /STEP27_PREFLIGHT_DENY_OPAQUE/);
});

test('Step 27 fixture and review remain source-only and fail closed', async () => {
  const [fixture, review] = await Promise.all([readFile(FIXTURE, 'utf8'), readFile(REVIEW, 'utf8')]);
  assert.match(fixture, /7 checks passed/);
  assert.match(review, /36079a5e6e8b863bc8bf6f8e01e055c68f748075/);
  const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
  assert.match(review, new RegExp(digest(await readFile(SRC, 'utf8'))));
  assert.match(review, new RegExp(digest(await readFile(HDR, 'utf8'))));
  assert.match(review, new RegExp(digest(fixture)));
  const header = await readFile(HDR, 'utf8');
  for (const forbidden of C_FORBIDDEN) {
    assert.equal(fixture.includes(forbidden), false, `fixture forbidden: ${forbidden}`);
    assert.equal(header.includes(forbidden), false, `header forbidden: ${forbidden}`);
  }
  for (const forbidden of REVIEW_FORBIDDEN) {
    assert.equal(review.includes(forbidden), false, `review forbidden: ${forbidden}`);
  }
  assert.match(review, /separately approved implementation review/);
  assert.match(review, /distinct explicit host-execution authorization/);
});
// Static repository test only; no compilation, TPM, ESAPI, filesystem host access, or network action.
