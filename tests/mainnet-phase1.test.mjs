import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { keccak256 } = require('@ethersproject/keccak256');

const root = path.resolve(import.meta.dirname, '..');
const helper = path.join(root, 'scripts', 'claim-message-v1.js');

const PROGRAM_ID = 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY';
const CORE_PROGRAM = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';
const TREASURY = 'FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6';

const seed = {
  programId: PROGRAM_ID,
  recipient: '8gUvnRYEcUMHwkt4WwWckMFCC9KUN1m47TgzttXR7TVg',
  nftId: 1,
  ethAddress: '0xB9B1D4251416066AFF6C06E4AB7A8EE4D2312E29',
  nonceHex: `0x${'01'.repeat(32)}`,
  expiryUnix: '2000000000',
};

// Committed cross-cluster vectors (2026-09-12). The SAME claim inputs hash to
// DIFFERENT leaves on devnet vs mainnet because the cluster tag is inside every
// hash domain (allocation, claims, metadata, EIP-191 messages). A claim signed
// for one cluster is therefore cryptographically invalid on the other — this is
// the cross-cluster rejection property the mainnet plan depends on.
const MAINNET_VECTORS = {
  messageHash: '0x4c32feeb32ad15d95da508e3741ba80552b769e249193916ef776fed4704b165',
  leaf: '0xe0a144d7a9bda05409de31c7873e3e048d7dd490badd5b92c794d15a1c617ae6',
};

test('Phase 1: a claim hashes differently on mainnet than devnet (cross-cluster)', async () => {
  const { buildClaimMessage, claimMessageHash, makeClaimLeaf } = await import(helper);
  const devnetMsg = buildClaimMessage({ ...seed, cluster: 'devnet' });
  const mainnetMsg = buildClaimMessage({ ...seed, cluster: 'mainnet' });
  assert.notEqual(devnetMsg, mainnetMsg, 'the two cluster messages must differ');
  const devnetLeaf = makeClaimLeaf({
    programId: seed.programId, clusterTag: 'devnet', ethAddress: seed.ethAddress,
    nftId: seed.nftId, nonceHex: seed.nonceHex,
  });
  const mainnetLeaf = makeClaimLeaf({
    programId: seed.programId, clusterTag: 'mainnet', ethAddress: seed.ethAddress,
    nftId: seed.nftId, nonceHex: seed.nonceHex,
  });
  assert.notEqual(devnetLeaf, mainnetLeaf, 'the two cluster leaves must differ');
  // Pin the mainnet vectors so a future change that accidentally reuses the devnet
  // tag (or drops cluster from the preimage) fails loudly.
  assert.equal(claimMessageHash(mainnetMsg), MAINNET_VECTORS.messageHash);
  assert.equal(mainnetLeaf, MAINNET_VECTORS.leaf);
  // The devnet committed values are unchanged (regression guard for the helper).
  assert.equal(claimMessageHash(devnetMsg), '0x45b80b217bf4f5e6784f71ed2000ef63076040917740e247373353247caf0f43');
  assert.equal(devnetLeaf, '0x7e45388ba3cba6449e63020796f35a482adb7cbb3313317dc931e913c45d9922');
});

test('Phase 1: the mainnet launch-setup consumes a generated mainnet manifest, not devnet roots', async () => {
  const src = await readFile(path.join(root, 'scripts', 'execute-mainnet-launch-setup.mjs'), 'utf8');
  // Roots must come from the manifest (cluster/program verified), never hardcoded devnet values.
  assert.match(src, /CUMZ_MAINNET_MANIFEST/, 'must require a mainnet manifest');
  assert.match(src, /MANIFEST\.claimRoot/, 'claim root must be read from the manifest');
  assert.match(src, /MANIFEST\.metadataRoot/, 'metadata root must be read from the manifest');
  assert.match(src, /DEVNET_CLAIM_ROOT/, 'must guard against the devnet claim root');
  assert.match(src, /DEVNET_METADATA_ROOT/, 'must guard against the devnet metadata root');
  assert.doesNotMatch(src, /CLAIM_ROOT = Buffer\.from\('8443ba0a/, 'must not embed the devnet claim root');
  assert.doesNotMatch(src, /METADATA_ROOT = Buffer\.from\('689ab71d/, 'must not embed the devnet metadata root');
  assert.match(src, /MANIFEST\.cluster !== 'mainnet'/, 'must reject a non-mainnet manifest');
  assert.match(src, /MANIFEST\.allocationHash !== '0x' \+ allocationHash\.toString\('hex'\)/,
    'must bind the manifest to the exact collection/roots/public IDs used on chain');
  assert.match(src, /JSON\.stringify\(publicIds\) !== JSON\.stringify\(MANIFEST\.publicIds\)/,
    'must require byte-for-byte public ID order equality with the reviewed manifest');
  assert.match(src, /JSON\.stringify\(claimIds\) !== JSON\.stringify\(MANIFEST\.claimIds\)/,
    'must require byte-for-byte claim ID order equality with the reviewed manifest');
  assert.match(src, /claimRootMatches/, 'post-setup verification must decode the claim root');
  assert.match(src, /metadataRootMatches/, 'post-setup verification must decode the metadata root');
  assert.match(src, /clusterTagHashMatches/, 'post-setup verification must decode the cluster hash');
  assert.match(src, /MANIFEST\.collectionUri !== COLLECTION_METADATA_URI/,
    'setup must bind the manifest to the collection URI compiled into the program');
});

test('Phase 1: program APPROVED_METADATA_ROOT is cluster-gated, not a hardcoded devnet root', async () => {
  const src = await readFile(path.join(root, 'programs', 'cumzillaraptors', 'src', 'metadata.rs'), 'utf8');
  const lib = await readFile(path.join(root, 'programs', 'cumzillaraptors', 'src', 'lib.rs'), 'utf8');
  // Leaves hash the cluster tag, so the on-chain approved root must differ per cluster.
  assert.match(src, /#\[cfg\(feature = "mainnet"\)\]\s+pub const APPROVED_METADATA_ROOT/, 'must gate a mainnet-approved root');
  assert.match(src, /#\[cfg\(not\(feature = "mainnet"\)\)\]\s+pub const APPROVED_METADATA_ROOT/, 'must keep the devnet-approved root');
  assert.match(src, /TODO\(mainnet\)/, 'must carry a loud placeholder so a mainnet build cannot silently ship a devnet root');
  assert.match(src, /0x00, 0x00/, 'mainnet placeholder must fail closed until Phase 2 fills it');
  assert.match(lib, /metadata_root != \[0; 32\] && metadata_root == APPROVED_METADATA_ROOT/,
    'initialize_launch must reject the zero placeholder even though it equals the compiled placeholder');
});

test('Phase 1: mainnet launch authority is cluster-gated and fails closed before Phase 2', async () => {
  const state = await readFile(path.join(root, 'programs', 'cumzillaraptors', 'src', 'state.rs'), 'utf8');
  const lib = await readFile(path.join(root, 'programs', 'cumzillaraptors', 'src', 'lib.rs'), 'utf8');
  assert.match(state, /#\[cfg\(feature = "mainnet"\)\]\s+pub const LAUNCH_AUTHORITY_BYTES: \[u8; 32\] = \[0; 32\]/);
  assert.match(state, /#\[cfg\(not\(feature = "mainnet"\)\)\]\s+pub const LAUNCH_AUTHORITY_BYTES/);
  assert.match(lib, /mainnet_authority_placeholder_fails_closed_until_phase_2_fill/);
  assert.match(lib, /any_nonzero\(&state::LAUNCH_AUTHORITY_BYTES\)/,
    'release builds must refuse the placeholder authority with a stable const check');
  assert.match(lib, /any_nonzero\(&APPROVED_METADATA_ROOT\)/,
    'release builds must refuse the placeholder metadata root with a stable const check');
  assert.match(lib, /differs\(&ID\.to_bytes\(\), &DEVNET_PROGRAM_ID_BYTES\)/,
    'release builds must refuse the devnet program ID with a stable const check');
});

test('Phase 1: compiled cluster hash is exact, not merely nonzero', async () => {
  const src = await readFile(path.join(root, 'programs', 'cumzillaraptors', 'src', 'lib.rs'), 'utf8');
  assert.match(src, /cluster_tag_hash == EXPECTED_CLUSTER_TAG_HASH/);
  assert.doesNotMatch(src, /cluster_tag_hash != \[0; 32\]/);
});

test('Phase 1: setup uses the manifest collection keypair and never generates a replacement', async () => {
  const src = await readFile(path.join(root, 'scripts', 'execute-mainnet-launch-setup.mjs'), 'utf8');
  assert.match(src, /collectionPath/);
  assert.match(src, /collection\.publicKey\.toBase58\(\) !== MANIFEST\.collection/);
  assert.doesNotMatch(src, /const collection = Keypair\.generate\(\)/);
});

test('Phase 1: mainnet script inputs fail closed before any RPC/send', async () => {
  const { spawnSync } = await import('node:child_process');
  const setup = path.join(root, 'scripts', 'execute-mainnet-launch-setup.mjs');
  const enable = path.join(root, 'scripts', 'execute-mainnet-enable-sale.mjs');
  const setupResult = spawnSync(process.execPath, [setup], { cwd: root, encoding: 'utf8', env: {} });
  const enableResult = spawnSync(process.execPath, [enable], { cwd: root, encoding: 'utf8', env: {} });
  assert.notEqual(setupResult.status, 0);
  assert.match(setupResult.stderr, /CUMZ_MAINNET_MANIFEST/);
  assert.notEqual(enableResult.status, 0);
  assert.match(enableResult.stderr, /CUMZ_MAINNET_PROGRAM_ID/);
  assert.doesNotMatch(enableResult.stderr, /Invalid public key input/,
    'missing env must produce a clear usage error before PublicKey construction');
});

test('Phase 1: mainnet setup/enable files stay dormant until later authorized phases', async () => {
  const setup = await readFile(path.join(root, 'scripts', 'execute-mainnet-launch-setup.mjs'), 'utf8');
  const enable = await readFile(path.join(root, 'scripts', 'execute-mainnet-enable-sale.mjs'), 'utf8');
  assert.match(setup, /sendAndConfirmTransaction/, 'Phase 3 executor remains explicit and reviewable');
  assert.match(enable, /sendAndConfirmTransaction/, 'Phase 5 executor remains explicit and reviewable');
  const plan = await readFile(path.join(root, 'docs', 'plans', '2026-08-25-mainnet-go-live.md'), 'utf8');
  assert.match(plan, /PAUSED BEFORE PHASE 2/);
  assert.match(plan, /authorizes no funding, key generation, signing, deployment, setup transaction, sale enable, or live cutover/);
});

test('Phase 1: mainnet launch-setup script retargets the cluster tag to mainnet', async () => {
  const src = await readFile(path.join(root, 'scripts', 'execute-mainnet-launch-setup.mjs'), 'utf8');
  assert.match(src, /const CLUSTER = 'mainnet'/, 'script must build with the mainnet tag');
  // The allocation-hash preimage must include the mainnet tag, NOT devnet.
  assert.ok(!/Buffer\.from\(['"]devnet['"]\)/.test(src), 'must not embed devnet in the preimage');
  // It must use the canonical mpl-core program and treasury consts (not a stale copy).
  assert.ok(src.includes(CORE_PROGRAM), 'canonical mpl-core program id must be used');
  assert.ok(src.includes(TREASURY), 'canonical treasury must be used');
  assert.doesNotMatch(src, /71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r/, 'must not reuse the devnet launch authority');
  // Balance preflight must gate the authority before any send.
  assert.match(src, /balance < 2e9/, 'must refuse to run underfunded');
});

test('Phase 1: mainnet enable-sale script is cluster-independent and authority-checked', async () => {
  const src = await readFile(path.join(root, 'scripts', 'execute-mainnet-enable-sale.mjs'), 'utf8');
  assert.match(src, /set_claims_sale_state/, 'must flip sale state');
  assert.match(src, /Buffer\.from\(\[2\]\)/, 'Live must be Borsh enum value 2');
  assert.match(src, /EXPECTED_AUTHORITY/, 'must verify the authority pubkey');
  assert.match(src, /balance/, 'must preflight a funded authority');
  assert.doesNotMatch(src, /71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r/, 'must not reuse the devnet launch authority');
  assert.match(src, /8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d/, 'must pin the D6 payer identity');
  assert.match(src, /authority\.publicKey\.equals\(EXPECTED_PAYER\)/, 'must keep launch authority distinct from payer');
});

test('Phase 0: recorded roles and payer are explicit and separated', async () => {
  const decisions = await readFile(path.join(root, 'docs', 'operations', 'mainnet-decisions-v1.md'), 'utf8');
  assert.match(decisions, /D6 \| Payer wallet \| `8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d`/);
  assert.match(decisions, /Cold key, distinct from payer and launch authority/);
  assert.match(decisions, /Never export its key material/);
  assert.match(decisions, /wallet-compatible deploy flow/);
});

test('Phase 1: config/site.mainnet.js targets mainnet-beta and holds placeholders until setup', async () => {
  const src = await readFile(path.join(root, 'config', 'site.mainnet.js'), 'utf8');
  assert.match(src, /network: "mainnet-beta"/);
  assert.match(src, /cluster: "mainnet"/, 'must declare the program feature tag');
  // Placeholders must remain null until Phase 2/3 fill them; the build script
  // refuses to ship a mainnet variant while any null remains.
  assert.match(src, /programId: null/, 'programId must start as a null placeholder');
  assert.match(src, /launchAuthority: null/, 'launchAuthority must start as a null placeholder');
  assert.match(src, /collection: (null|undefined)/, 'collection must start as a placeholder');
});

test('Phase 1: build-site-dist refuses the mainnet variant while placeholders are null', async () => {
  const src = await readFile(path.join(root, 'scripts', 'build-site-dist.js'), 'utf8');
  assert.match(src, /CUMZ_SITE_VARIANT === 'mainnet'/, 'must select mainnet config by env');
  assert.match(src, /null/, 'must reject null placeholders');
  assert.match(src, /refusing to build mainnet variant/, 'must fail loudly with a clear message');
});

test('Phase 1: manifest generator derives artifacts from cluster and commits collection URI', async () => {
  const src = await readFile(path.join(root, 'scripts', 'generate-launch-manifest.js'), 'utf8');
  assert.match(src, /`claims-v1\.\$\{args\.cluster\}\.json`/);
  assert.match(src, /`metadata-merkle-v1\.\$\{args\.cluster\}\.json`/);
  assert.doesNotMatch(src, /const CLAIMS_V1 = .*claims-v1\.devnet/);
  assert.doesNotMatch(src, /const METADATA_MERKLE = .*metadata-merkle-v1\.devnet/);
  assert.match(src, /collectionUri: uriMap\.collectionUri/,
    'the reviewed manifest must emit the exact collection metadata URI');
});

test('Phase 1: the worker mapping knows both clusters for HTTP and WebSocket', async () => {
  const src = await readFile(path.join(root, 'worker.js'), 'utf8');
  assert.match(src, /devnet: "https:\/\/devnet\.helius-rpc\.com"/);
  assert.match(src, /mainnet: "https:\/\/mainnet\.helius-rpc\.com"/);
  assert.match(src, /HELIUS_WS_HOSTS/, 'WebSocket host mapping must exist for both clusters');
  assert.match(src, /mainnet: "https:\/\/mainnet\.helius-rpc\.com"/g, 'WS mapping must include mainnet');
});

test('Phase 1: mainnet SBPF build feature is explicit and cannot silently build devnet', async () => {
  const workflow = await readFile(path.join(root, '.github', 'workflows', 'build-program.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:[\s\S]*inputs:[\s\S]*cluster:/,
    'manual build must require an explicit cluster input');
  assert.match(workflow, /--features mainnet/,
    'mainnet artifact path must compile with the mainnet feature');
  assert.match(workflow, /cumzillaraptors-\$\{\{ inputs\.cluster \}\}-sbpf/,
    'artifact name must identify its cluster');
  assert.match(workflow, /Build isolated test-validation SBPF artifact[\s\S]*?if: \$\{\{ inputs\.cluster == 'devnet' \}\}/,
    'devnet-only validation artifacts must not be mixed into the mainnet build');
  assert.match(workflow, /Run Task 5 Bankrun initialization gate[\s\S]*?if: \$\{\{ inputs\.cluster == 'devnet' \}\}/,
    'mainnet must not claim devnet Bankrun coverage');
  assert.match(workflow, /Run mandatory x86 atomic Core-CPI claim gate[\s\S]*?if: \$\{\{ inputs\.cluster == 'devnet' \}\}/,
    'mainnet must not claim a devnet Core-CPI gate');
});