// Runtime harness for the claim page: executes the real page module in jsdom
// with mocked wallet providers and a mocked RPC, so behaviour (not just source
// shape) can be asserted. Used by tests/claim-page-runtime.test.mjs.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import * as sha3mod from 'js-sha3';
import * as web3 from '@solana/web3.js';

const sha3 = sha3mod.keccak256 ? sha3mod : sha3mod.default;
const PAGE = 'cumzillaraptors/claim/index.html';
const CLIENT = 'cumzillaraptors/client';

// The page imports "/cumzillaraptors/claim/<mod>.js"; on disk those modules live
// in client/ and are copied by build-site-dist.js. Rewrite to file URLs so the
// exact same module code runs here.
function extractModule() {
  const html = readFileSync(PAGE, 'utf8');
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('module script not found in claim page');
  return m[1].replace(
    /"\/cumzillaraptors\/claim\/([\w-]+\.js)"/g,
    (_all, file) => JSON.stringify(pathToFileURL(join(process.cwd(), CLIENT, file)).href),
  );
}

const PROGRAM_ID = 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY';
const COLLECTION = '3DQ3LQ6JKq8PjUL4dg2VB7FajPSh8wywqsbJi7sCAfKK';
const RECIPIENT = '8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d';

// CollectionConfig layout per chain.js fetchLaunchState.
export function configAccountData({ publicMinted = 7, claimsMinted = 3, saleState = 2 } = {}) {
  const d = Buffer.alloc(280);
  const put = (pk, off) => new web3.PublicKey(pk).toBuffer().copy(d, off);
  put(PROGRAM_ID, 8);                                     // launch authority (any)
  put('FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6', 40); // treasury
  put('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d', 72); // core program
  put(COLLECTION, 104);
  d[264] = saleState;
  d.writeUInt16LE(publicMinted, 265);
  d.writeUInt16LE(claimsMinted, 267);
  return d;
}

const NONCE_BLOCKHASH = 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi';

function nonceAccountData(authority) {
  const d = Buffer.alloc(80);
  d.writeUInt32LE(1, 0);   // version
  d.writeUInt32LE(1, 4);   // state = Initialized
  new web3.PublicKey(authority).toBuffer().copy(d, 8);
  new web3.PublicKey(NONCE_BLOCKHASH).toBuffer().copy(d, 40);
  return d;
}

/**
 * Boot the claim page.
 *
 * opts.claimIds        ids the connected ETH wallet is eligible for
 * opts.claimedAtLoad   ids whose receipt PDA exists during the first check
 * opts.claimedAtClaim  ids whose receipt PDA exists during the pre-claim re-check
 *                      (simulates a claim from another device — review H2)
 * opts.receiptsFail    'load' | 'claim' | false — make the receipt read throw
 * opts.statusFailAfter status refreshes succeed this many times, then throw (L3)
 * opts.sendBehaviour   fn(attemptIndex) -> 'ok' | Error to throw
 */
export async function bootClaimPage(opts = {}) {
  const realTimeout = setTimeout;
  const {
    claimIds = [4, 9],
    claimedAtLoad = [],
    claimedAtClaim = [],
    receiptsFail = false,
    statusFailAfter = Infinity,
    sendBehaviour = () => 'ok',
    nonceExists = true,
    signDelayMs = 0,
  } = opts;

  const html = readFileSync(PAGE, 'utf8')
    .replace(/<script[\s\S]*?<\/script>/g, '');   // no inline scripts; we run the module ourselves
  const dom = new JSDOM(html, { url: 'https://claim.cumzillaraptor.com/', pretendToBeVisual: true });
  const { window } = dom;

  const ETH = '0xb0e683427202d14366977b7183d228a508b5a19c';
  const events = [];
  const state = {
    events,
    signRequests: [],
    submissions: [],
    receiptChecks: 0,
    statusReads: 0,
    phase: 'load',       // 'load' | 'claim'
    claimedNow: new Set(claimedAtLoad),
    dom,
    window,
    ETH,
  };

  // ---- RPC: patch the real web3 Connection so no network is touched ----
  const claimsData = JSON.parse(readFileSync(`${CLIENT}/data/claims-by-eth.json`, 'utf8'));
  const metaData = JSON.parse(readFileSync(`${CLIENT}/data/metadata-slim.json`, 'utf8'));

  const C = web3.Connection.prototype;
  C.getAccountInfo = async function (pubkey) {
    const key = pubkey.toBase58();
    if (state.nonceAddress && key === state.nonceAddress) {
      return nonceExists
        ? { owner: web3.SystemProgram.programId, data: nonceAccountData(RECIPIENT), lamports: 1447680 }
        : null;
    }
    // config PDA (the only other single-account read the page performs)
    state.statusReads++;
    if (state.statusReads > statusFailAfter) throw new Error('429 Too Many Requests');
    return { owner: new web3.PublicKey(PROGRAM_ID), data: configAccountData(), lamports: 1 };
  };
  C.getMultipleAccountsInfo = async function (keys) {
    state.receiptChecks++;
    // First read is the eligibility check at connect time; every later read is
    // the pre-claim re-check (review H2), which may see a different world.
    if (state.receiptChecks > 1) state.phase = 'claim';
    events.push('receipts:' + state.phase);
    if (receiptsFail === state.phase) throw new Error('429 Too Many Requests');
    const claimed = state.phase === 'claim' ? new Set(claimedAtClaim) : new Set(claimedAtLoad);
    return keys.map((k) => (state.receiptOwners.has(k.toBase58()) &&
      claimed.has(state.receiptOwners.get(k.toBase58())) ? { data: Buffer.alloc(1) } : null));
  };
  C.getLatestBlockhash = async () => ({ blockhash: NONCE_BLOCKHASH, lastValidBlockHeight: 999999 });
  C.getAddressLookupTable = async () => ({
    value: {
      key: new web3.PublicKey('CiWDQyeDcBif3Vw7KcY4FgiHfU4UAWZd1gh7HwCS3RVv'),
      state: {
        addresses: [
          new web3.PublicKey(PROGRAM_ID),
          new web3.PublicKey(COLLECTION),
          new web3.PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d'),
          new web3.PublicKey('FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6'),
        ],
      },
    },
  });
  let sendCount = 0;
  C.sendRawTransaction = async function (raw) {
    const i = sendCount++;
    state.submissions.push({ attempt: i, bytes: raw.length });
    events.push('send:' + i);
    const r = sendBehaviour(i);
    if (r instanceof Error) throw r;
    return 'SIG' + i + 'x'.repeat(80);
  };
  C.confirmTransaction = async function () { return { value: { err: null } }; };
  C.getSignatureStatuses = async function (sigs) {
    return { value: sigs.map(() => (state.landed ? { err: null, confirmationStatus: 'confirmed' } : null)) };
  };

  // ---- globals the page/shims expect ----
  window.keccak256 = sha3.keccak256;
  window.solanaWeb3 = web3;
  window.Buffer = Buffer;
  window.CUMZ_CONFIG = {
    network: 'devnet',
    rpcUrl: 'https://rpc.example.invalid',
    programId: PROGRAM_ID,
    mplCoreProgramId: 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d',
    treasury: 'FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6',
    launchAuthority: PROGRAM_ID,
    collection: null,
    claimLookupTable: 'CiWDQyeDcBif3Vw7KcY4FgiHfU4UAWZd1gh7HwCS3RVv',
    priceLamports: 1000000000,
    publicCount: 246,
    claimCount: 174,
    expiryUnix: 2000000000,
    pages: {},
  };

  // eligible entries for our fake ETH wallet
  const entries = claimIds.map((id) => {
    const src = Object.values(claimsData).flat().find((e) => e.id === id) ||
      { id, p: Object.values(claimsData).flat()[0].p };
    return { id, p: src.p };
  });
  claimsData[ETH] = entries;

  window.fetch = async (url) => {
    const u = String(url);
    events.push('fetch:' + u.split('/').pop());
    const body = u.includes('claims-by-eth') ? claimsData
      : u.includes('metadata-slim') ? metaData
      : null;
    if (!body) throw new Error('unexpected fetch ' + u);
    return { ok: true, json: async () => body };
  };

  window.ethereum = {
    isMetaMask: true,
    request: async ({ method, params }) => {
      events.push('eth:' + method);
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [ETH];
      if (method === 'personal_sign') {
        state.signRequests.push({ data: params[0], signer: params[1] });
        return '0x' + '11'.repeat(65);
      }
      throw new Error('unsupported ' + method);
    },
    on: () => {},
  };

  const solProvider = {
    isPhantom: true,
    isConnected: false,
    publicKey: null,
    connect: async () => {
      solProvider.publicKey = new web3.PublicKey(RECIPIENT);
      solProvider.isConnected = true;
      events.push('sol:connect');
      return { publicKey: solProvider.publicKey };
    },
    disconnect: async () => { solProvider.publicKey = null; },
    signTransaction: async (tx) => {
      events.push('sol:sign');
      if (signDelayMs) await new Promise((r) => realTimeout(r, signDelayMs));
      return tx;
    },
    on: () => {},
    off: () => {},
  };
  window.phantom = { solana: solProvider };
  window.solana = solProvider;

  // jsdom lacks these in older versions / module scope
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;

  // Make the page's globals resolve to this window inside the module.
  // NOTE: do NOT alias timers to jsdom's window.setTimeout — jsdom resolves them
  // back through the global, which recurses until the stack blows. Node's timers
  // are used instead, and setInterval is stubbed so the 60s status poll cannot
  // keep the test process alive.
  for (const k of ['document', 'window', 'fetch', 'location', 'Event', 'CustomEvent']) {
    try {
      Object.defineProperty(globalThis, k, {
        value: k === 'window' ? window : window[k],
        configurable: true,
        writable: true,
      });
    } catch { /* non-configurable global — the page does not rely on it */ }
  }
  state.intervals = [];
  Object.defineProperty(globalThis, 'setInterval', {
    value: (fn, ms) => { state.intervals.push({ fn, ms }); return state.intervals.length; },
    configurable: true,
    writable: true,
  });
  // Clamp the page's own sleeps (the rate-limit countdown) so a test does not
  // wait real seconds; the countdown still ticks the same number of times.
  const realSetTimeout = setTimeout;
  state.sleeps = [];
  Object.defineProperty(globalThis, 'setTimeout', {
    value: (fn, ms, ...rest) => {
      if (ms >= 1000) state.sleeps.push(ms);
      return realSetTimeout(fn, ms >= 1000 ? 1 : ms, ...rest);
    },
    configurable: true,
    writable: true,
  });
  state.restoreTimers = () => {
    Object.defineProperty(globalThis, 'setTimeout', {
      value: realSetTimeout, configurable: true, writable: true,
    });
  };
  globalThis.keccak256 = sha3.keccak256;

  // receipt PDA -> id map, so the mocked account read knows which ids are claimed
  const chain = await import(pathToFileURL(join(process.cwd(), CLIENT, 'chain.js')).href);
  state.receiptOwners = new Map();
  for (const id of claimIds) {
    const nonce = chain.deterministicNonceHex(new web3.PublicKey(PROGRAM_ID), ETH, id);
    const leaf = chain.claimLeafHex(new web3.PublicKey(PROGRAM_ID), ETH, id, nonce);
    state.receiptOwners.set(chain.getReceiptPda(new web3.PublicKey(PROGRAM_ID), leaf).toBase58(), id);
  }
  const nonceMod = await import(pathToFileURL(join(process.cwd(), CLIENT, 'claim-nonce.js')).href);
  state.nonceAddress = (await nonceMod.claimNonceAddress(RECIPIENT)).toBase58();

  // ---- run the page module ----
  const dir = mkdtempSync(join(tmpdir(), 'claim-page-'));
  const file = join(dir, 'page.mjs');
  writeFileSync(file, extractModule());
  await import(pathToFileURL(file).href + '?t=' + Date.now());

  state.$ = (id) => window.document.getElementById(id);
  state.text = (id) => state.$(id)?.textContent ?? null;
  state.tick = () => new Promise((r) => realTimeout(r, 0));
  state.settle = async (n = 25) => { for (let i = 0; i < n; i++) await state.tick(); };

  // Record every distinct claim-msg the user would have seen, so countdown
  // visibility (M4) can be asserted without racing the UI.
  state.countdownMessages = [];
  state.messages = [];
  const claimMsg = state.$('claim-msg');
  const obs = new window.MutationObserver(() => {
    const t = claimMsg.textContent;
    if (!t || state.messages[state.messages.length - 1] === t) return;
    state.messages.push(t);
    if (/rate-limited/i.test(t)) state.countdownMessages.push(t);
  });
  obs.observe(claimMsg, { childList: true, characterData: true, subtree: true });
  state.stopObserving = () => obs.disconnect();

  await state.settle();
  return state;
}
