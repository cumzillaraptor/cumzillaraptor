import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const CONTRACT=new URL('../docs/operations/v2-r1-step28-esapi-tcti-rm-contract.md',import.meta.url);
const EXPECTED_SHA256='f33a51884b5c8acf51592a287db03486a408d5b7e2a1afe8cee53357da22443a';
const EXPECTED_DOCUMENT=`# Step 28 fixed ESAPI/TCTI kernel-resource-manager integration contract

## Status, predecessor, and present boundary

This is a repository-only fixed-integration review contract and deterministic repository-text test. It is not a tpm2-tss installation, library inspection, package query, compile, link, ESAPI context creation, TCTI initialization, TPM device open, TPM command, compatibility preflight execution, SQLite action, record creation, host gate, or authorization for any live action. It binds the immediate published predecessor exactly to \`8dc0e351ee4cf40f507d96075d0d7c698a8e6433\`; no branch, tag, successor, working tree, caller, environment, configuration, or supplied value may substitute it. The predecessor is historical design input only, never current authority.

## Fixed future integration selection

A future separately approved host-integration review must select exactly tpm2-tss release 4.2.0, the ESAPI interface, and the tcti-device transport configured only as \`device:/dev/tpmrm0\`. It must pin the exact package/source provenance, installed shared-library complete-byte SHA-256, public-header complete-byte SHA-256, and complete host-integration source bytes before any execution. It must use an explicit fixed TCTI initialization call with that exact literal configuration; dynamic TCTI loader discovery, default TCTI selection, environment/configuration/CWD selection, and caller-supplied transport strings are forbidden.

The only permitted device path is exactly \`/dev/tpmrm0\`, conditionally after a later explicit read-only host gate proves it is the expected non-symlink kernel resource-manager character device with the reviewed ownership/mode and accessible fixed interface. The direct device \`/dev/tpm0\`, every socket/daemon/tabrmd transport, simulator/emulator, TCP transport, alternate device, and every fallback are forbidden. Malformed, missing, inaccessible, symlinked, wrong-type, wrong-metadata, unexpected, substituted, unavailable, or uncertain \`/dev/tpmrm0\` evidence must deny and stop the TPM-anchor route; it must not retry using any alternative transport.

## Future exact read-only operation boundary

The later integration review must map a fixed ordered read-only query sequence only into the five Step 27 injected facts: TPM presence, TPM 2.0 major version, NV-counter capability, policy primitive availability, and opaque device identity binding. It must pin every ESAPI call, argument shape, return-code handling, response-field selection, canonical redacted report grammar, cleanup order, and timeout policy. It must prove the sequence has no raw command passthrough and no state-changing TPM operation, including hierarchy/ownership changes, key/NV creation or deletion, policy/auth changes, dictionary-attack operations, startup/shutdown, context save/load, clear, define, write, increment, extend, lock, or provision.

No accepted compatibility result may be used for anchor provisioning, SQLite access, record acceptance, host discovery, candidate selection, compiler execution, endpoint/secret access, RPC, signing, sending, or deployment. A valid future preflight report is reported evidence only.

## Separate host execution and non-authority

After the future host-integration review is published, a separate explicit one-run host-execution authorization must bind the exact reviewed commit, paths, source/library/header hashes, literal \`device:/dev/tpmrm0\` configuration, canonical report grammar, approved admin context, and short-lived scope. It must authorize only the fixed read-only query sequence and no package installation, device modification, TPM provisioning, SQLite action, or other live operation.

Passing this test authorizes neither selecting/installing/inspecting tpm2-tss, inspecting/opening \`/dev/tpmrm0\`, compiling/linking, initializing ESAPI/TCTI, TPM access, compatibility preflight execution, host action, commit, or publication. Each requires separate explicit human approval.
`;
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const validate=s=>{assert.equal(s,EXPECTED_DOCUMENT);assert.equal(hash(s),EXPECTED_SHA256);};
test('Step 28 fixed ESAPI/TCTI resource-manager contract is canonical',async()=>validate(await readFile(CONTRACT,'utf8')));
test('canonical comparison rejects transport fallback, discovery, TPM mutation, and authority weakening',async()=>{const s=await readFile(CONTRACT,'utf8');const m=[
 s.replace('exactly to `8dc0e351ee4cf40f507d96075d0d7c698a8e6433`','exactly to `0000000000000000000000000000000000000000`'),
 s.replace('It is not a tpm2-tss installation, library inspection, package query, compile','It installs tpm2-tss and opens a TPM device'),
 s.replace('exactly tpm2-tss release 4.2.0','any available tpm2-tss release'),
 s.replace('only as `device:/dev/tpmrm0`','as a caller-selected transport'),
 s.replace('dynamic TCTI loader discovery, default TCTI selection','TCTI loader discovery and default selection'),
 s.replace('The direct device `/dev/tpm0`, every socket/daemon/tabrmd transport, simulator/emulator, TCP transport, alternate device, and every fallback are forbidden','`/dev/tpm0` fallback is permitted'),
 s.replace('Malformed, missing, inaccessible, symlinked, wrong-type, wrong-metadata, unexpected, substituted, unavailable, or uncertain `/dev/tpmrm0` evidence must deny and stop the TPM-anchor route; it must not retry using any alternative transport','any `/dev/tpmrm0` evidence is acceptable'),
 s.replace('must deny and stop the TPM-anchor route; it must not retry using any alternative transport','may retry with `/dev/tpm0`'),
 s.replace('no raw command passthrough and no state-changing TPM operation','raw TPM commands and NV writes are permitted'),
 s.replace('a separate explicit one-run host-execution authorization','this contract authorizes host execution'),
 s.replace('Passing this test authorizes neither selecting/installing/inspecting tpm2-tss','Passing authorizes TPM installation and preflight execution'),
];for(const x of m){assert.notEqual(x,s);assert.throws(()=>validate(x));}});
// Repository-text-only test; no tpm2-tss, device, TPM, host, SQLite, network, RPC, signing, send, or deployment action.
