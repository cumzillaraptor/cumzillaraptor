// Runtime harness for the MINT page: executes the real page module in jsdom with
// a mocked desktop/mobile wallet and a mocked RPC, and records an ordered trace
// of every RPC call plus when the wallet popup opened and when the reveal landed.
//
// Purpose: measure/prove the DESKTOP Phantom-extension path. Source greps cannot
// show how many round trips precede the popup, nor whether a timeout surfaces.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import * as web3 from '@solana/web3.js';

const PAGE = 'cumzillaraptors/mint/index.html';
const CLIENT = 'cumzillaraptors/client';

const PROGRAM_ID = 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY';
const COLLECTION = '3DQ3LQ6JKq8PjUL4dg2VB7FajPSh8wywqsbJi7sCAfKK';
const TREASURY = 'FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6';
const MPL_CORE = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';
const BUYER = '8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d';
const BLOCKHASH = 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi';
// A real keypair so signTransaction produces a VALID signature: web3.js verifies
// signatures inside Transaction.serialize(), so a dummy 64 bytes is rejected.
const BUYER_KEYPAIR = web3.Keypair.generate();
const SIG = '5'.repeat(87);
const PUBLIC_COUNT = 246;

function extractModule() {
  const html = readFileSync(PAGE, 'utf8');
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('module script not found in mint page');
  return m[1].replace(
    /"\/cumzillaraptors\/mint\/([\w-]+\.js)"/g,
    (_all, file) => JSON.stringify(pathToFileURL(join(process.cwd(), CLIENT, file)).href),
  );
}

export function configAccountData({ publicMinted = 7, claimsMinted = 3, saleState = 2 } = {}) {
  const d = Buffer.alloc(280);
  const put = (pk, off) => new web3.PublicKey(pk).toBuffer().copy(d, off);
  put(PROGRAM_ID, 8);
  put(TREASURY, 40);
  put(MPL_CORE, 72);
  put(COLLECTION, 104);
  d[264] = saleState;
  d.writeUInt16LE(publicMinted, 265);
  d.writeUInt16LE(claimsMinted, 267);
  return d;
}

// AllocationRegistry: validateRegistryLayout requires exactly 586 bytes.
// 8 disc + 32 authority + 492 reserved = 532, then the 53-byte bitmap, +1.
export function registryAccountData(allocatedIds = []) {
  const d = Buffer.alloc(586);
  new web3.PublicKey(PROGRAM_ID).toBuffer().copy(d, 8);
  for (const id of allocatedIds) {
    const bit = id - 1;
    d[532 + (bit >> 3)] |= 1 << (bit & 7);
  }
  return d;
}

/**
 * Boot the mint page and (optionally) click Roll.
 *
 * opts.mobile        true => mobile user agent (sign-only path)
 * opts.rpcLatencyMs  simulated latency per RPC call (default 120)
 * opts.fetchLatencyMs simulated latency per static file fetch (default 120)
 * opts.statusOf      confirmationStatus returned by getSignatureStatuses
 * opts.sendThrows    Error to throw from the wallet's send/sign
 * opts.confirmHangs  true => confirmTransaction never resolves (dead WS)
 */
export async function bootMintPage(opts = {}) {
  const {
    mobile = false,
    rpcLatencyMs = 120,
    fetchLatencyMs = 120,
    statusOf = 'confirmed',
    sendThrows = null,
    submitThrows = null,
    confirmHangs = false,
    confirmThrows = null,
    landsAfterSends = null,
    dropRebroadcast = false,
    expirePreflightAttempts = 0,
    signDelayMs = 0,
    allocatedIds = [1, 2, 3, 4, 5, 6, 7],
    signatureOfNull = false,   // model Phantom sign that returns no extractable sig
    roll = true,
  } = opts;

  const realTimeout = setTimeout;
  const trace = [];
  const signedSigs = [];
  let landed = false;
  let deadTx = false;
  const t0 = Date.now();
  const mark = (label) => trace.push({ label, at: Date.now() - t0 });
  const sleep = (ms) => new Promise((r) => realTimeout(r, ms));

  const html = readFileSync(PAGE, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(html, { url: 'https://mint.cumzillaraptor.com/', pretendToBeVisual: true });
  const { window } = dom;

  const ua = mobile
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Phantom'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36';

  // ---- wallet: desktop Phantom extension exposes signAndSendTransaction ----
  const wallet = {
    isPhantom: true,
    publicKey: BUYER_KEYPAIR.publicKey,
    connect: async () => ({ publicKey: BUYER_KEYPAIR.publicKey }),
    on() {}, removeListener() {}, removeAllListeners() {},
    signAndSendTransaction: async (tx, sendOptions) => {
      mark('POPUP_OPEN(signAndSendTransaction)');
      mark('PHANTOM_OPTIONS ' + JSON.stringify(sendOptions || {}));
      await sleep(10);
      if (sendThrows) throw sendThrows;
      mark('POPUP_APPROVED');
      return { signature: SIG };
    },
    signTransaction: async (tx) => {
      mark('POPUP_OPEN(signTransaction)');
      await sleep(signDelayMs || 10);
      if (sendThrows) throw sendThrows;
      mark('POPUP_APPROVED');
      // Attach a deterministic 64-byte signature the way a real wallet does, so
      // the connector's signatureOf() has something genuine to base58-encode.
      try {
        tx.partialSign(BUYER_KEYPAIR);
      } catch {
        // versioned or plain-object transaction in a narrow unit test
        tx.signatures = [Buffer.alloc(64, 9)];
      }
      return tx;
    },
  };

  window.CUMZ_CONFIG = {
    network: 'devnet',
    rpcUrl: 'https://rpc.test.invalid',
    programId: PROGRAM_ID,
    mplCoreProgramId: MPL_CORE,
    treasury: TREASURY,
    priceLamports: 1000000000,
    publicCount: PUBLIC_COUNT,
    claimCount: 174,
    pages: { home: '/', mint: '/', claim: '/' },
  };
  window.phantom = { solana: wallet };
  // jsdom has no matchMedia; the page uses it for prefers-reduced-motion.
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (q) => ({
      matches: false, media: q, onchange: null,
      addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {}, dispatchEvent() { return false; },
    });
  }

  // jsdom has no canvas backend; the confetti layer calls getContext('2d').
  // Provide a no-op 2D context so canvas is not the thing under test here.
  window.HTMLCanvasElement.prototype.getContext = function () {
    return {
      scale() {}, clearRect() {}, fillRect() {}, save() {}, restore() {},
      translate() {}, rotate() {}, beginPath() {}, arc() {}, fill() {},
      set fillStyle(_v) {}, get fillStyle() { return '#000'; },
    };
  };

  // ---- static file fetches ----
  const poolOrder = Array.from({ length: PUBLIC_COUNT }, (_, i) => i + 1);
  const metaSlim = {};
  for (const id of poolOrder) metaSlim[String(id)] = { u: 'ar://meta' + id, p: ['aa', 'bb'] };

  window.fetch = async (url) => {
    const u = String(url);
    if (u.includes('pool-order.json')) {
      mark('FETCH pool-order.json');
      await sleep(fetchLatencyMs);
      return { ok: true, json: async () => poolOrder };
    }
    if (u.includes('metadata-slim.json')) {
      mark('FETCH metadata-slim.json (330KB)');
      await sleep(fetchLatencyMs);
      return { ok: true, json: async () => metaSlim };
    }
    if (u.includes('arweave.net')) {
      return { ok: true, json: async () => ({ image: 'ar://img' }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  // ---- RPC: patch Connection.prototype so real decoding runs, no network ----
  const C = web3.Connection.prototype;
  const saved = {};
  const patch = (name, fn) => { saved[name] = C[name]; C[name] = fn; };

  patch('getAccountInfo', async function (pk) {
    const key = pk.toBase58();
    const cfgPda = web3.PublicKey.findProgramAddressSync(
      [Buffer.from('config')], new web3.PublicKey(PROGRAM_ID))[0].toBase58();
    const regPda = web3.PublicKey.findProgramAddressSync(
      [Buffer.from('allocation')], new web3.PublicKey(PROGRAM_ID))[0].toBase58();
    if (key === cfgPda) {
      mark('RPC getAccountInfo(config)');
      await sleep(rpcLatencyMs);
      return { data: configAccountData(), owner: new web3.PublicKey(PROGRAM_ID), lamports: 1 };
    }
    if (key === regPda) {
      mark('RPC getAccountInfo(registry)');
      await sleep(rpcLatencyMs);
      return { data: registryAccountData(allocatedIds), owner: new web3.PublicKey(PROGRAM_ID), lamports: 1 };
    }
    mark('RPC getAccountInfo(other)');
    await sleep(rpcLatencyMs);
    return null;
  });

  patch('getLatestBlockhash', async function () {
    mark('RPC getLatestBlockhash');
    await sleep(rpcLatencyMs);
    return { blockhash: BLOCKHASH, lastValidBlockHeight: 500000 };
  });

  patch('simulateTransaction', async function () {
    mark('RPC simulateTransaction');
    await sleep(rpcLatencyMs);
    return { value: { err: null, logs: [], unitsConsumed: 50000 } };
  });

  let sendCount = 0;
  let preflightRejections = 0;
  patch('sendRawTransaction', async function (raw, opts) {
    sendCount++;
    // With skipPreflight:false the RPC REJECTS an expired blockhash. With
    // skipPreflight:true it silently accepts it (verified on live devnet), which
    // is what hid this bug.
    if (preflightRejections < expirePreflightAttempts) {
      if (opts && opts.skipPreflight === true) {
        mark('RPC send #' + sendCount + ' ACCEPTED-DEAD-TX (skipPreflight hid expiry)');
        deadTx = true;   // can never confirm — exactly the live failure
        return SIG;
      }
      preflightRejections++;
      mark('RPC send #' + sendCount + ' PREFLIGHT_REJECT(Blockhash not found)');
      throw new Error('Simulation failed. \nMessage: Transaction simulation failed: Blockhash not found. ');
    }
    mark('RPC sendRawTransaction #' + sendCount + ' (page submits)');
    await sleep(rpcLatencyMs);
    if (submitThrows) { mark('SUBMIT_FAILED'); throw submitThrows; }
    if (dropRebroadcast) return SIG;   // never lands, exercises the timeout copy
    if (landsAfterSends && sendCount >= landsAfterSends) { landed = true; mark('TX_LANDED'); }
    return SIG;
  });

  patch('getSignatureStatuses', async function (sigs) {
    mark('RPC getSignatureStatuses');
    await sleep(rpcLatencyMs);
    // A transaction rejected at PREFLIGHT was never forwarded to the cluster, so
    // it can never have a status. Without this the page's money-safety
    // reconciliation reads the default mock status and "rescues" a dead tx.
    if (deadTx || preflightRejections > 0) return { value: sigs.map(() => null) };
    // when landsAfterSends is used, the tx only becomes visible once rebroadcast
    // has actually delivered it
    const st = landsAfterSends ? (landed ? 'confirmed' : null) : statusOf;
    return { value: sigs.map(() => (st ? { err: null, confirmationStatus: st, slot: 1 } : null)) };
  });

  patch('confirmTransaction', async function () {
    mark('RPC confirmTransaction');
    if (confirmHangs) return new Promise(() => {});
    await sleep(rpcLatencyMs);
    // A DROPPED transaction: the RPC accepted it, but it never lands, so
    // confirmTransaction eventually rejects at blockhash expiry. This is what
    // web3.js really does, and mocking it as success hid the live bug.
    if (confirmThrows === 'blockheight') {
      throw new Error(
        'Transaction was not confirmed in 30.00 seconds. It is unknown if it succeeded or failed. ' +
        'Check signature ' + SIG + ' using the Solana Explorer or CLI tools.');
    }
    if (confirmThrows) throw new Error(String(confirmThrows));
    // A transaction accepted while its blockhash was already expired can NEVER
    // be confirmed — web3.js rejects it once the block height passes.
    if (deadTx) {
      throw new Error(
        'Signature ' + SIG + ' has expired: block height exceeded.');
    }
    return { value: { err: null } };
  });

  patch('getBlockHeight', async function () { await sleep(rpcLatencyMs); return 499000; });

  // ---- globals ----
  const g = globalThis;
  const savedGlobals = {};
  const setGlobal = (k, v) => {
    savedGlobals[k] = { had: k in g, value: g[k] };
    try { Object.defineProperty(g, k, { value: v, configurable: true, writable: true }); }
    catch { /* getter-only */ }
  };
  setGlobal('window', window);
  setGlobal('document', window.document);
  setGlobal('navigator', { userAgent: ua });
  setGlobal('fetch', window.fetch);
  setGlobal('location', window.location);
  setGlobal('requestAnimationFrame', (fn) => realTimeout(() => fn(Date.now()), 0));
  setGlobal('cancelAnimationFrame', () => {});
  setGlobal('innerWidth', 1280);
  setGlobal('innerHeight', 800);
  setGlobal('devicePixelRatio', 1);

  // Clamp long page-side sleeps (e.g. the 2s rebroadcast tick) so tests observe
  // several ticks quickly, but RECORD the requested delay so a test can assert
  // the real cadence rather than trusting the clamp.
  const sleeps = [];
  const realClearTimeout = clearTimeout;
  setGlobal('setTimeout', (fn, ms, ...rest) => {
    sleeps.push(ms);
    // Keep the desktop preparation refresh from becoming a 25ms busy loop in
    // tests. Other long transactional waits stay clamped for fast scenarios.
    return realTimeout(fn, ms === 5000 ? 1000 : (ms >= 250 ? 25 : ms), ...rest);
  });
  // Capture the REAL clearTimeout first: referring to the global name here would
  // resolve back to this stub and recurse ("Maximum call stack size exceeded").
  setGlobal('clearTimeout', (id) => realClearTimeout(id));
  // capture the status poller instead of letting it keep the process alive
  const intervals = [];
  setGlobal('setInterval', (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; });
  setGlobal('clearInterval', () => {});

  const msgs = [];
  const obs = new window.MutationObserver(() => {
    const el = window.document.getElementById('mint-msg');
    if (el) { const t = el.textContent.trim(); if (t && msgs[msgs.length - 1] !== t) msgs.push(t); }
  });
  const msgEl = window.document.getElementById('mint-msg');
  if (msgEl) obs.observe(msgEl, { childList: true, subtree: true, characterData: true });

  // Wrap the REAL connector so we can observe the onSigned callback the page
  // passes, without reimplementing any of the send logic.
  // Fresh module instance per jsdom page. wallet.js discovers injected providers
  // through browser globals; sharing its module instance across repeated boots
  // couples one page's replaced globals to the next scenario.
  const walletMod = await import(
    pathToFileURL(join(process.cwd(), CLIENT, 'wallet.js')).href + '?boot=' + Date.now() + '-' + Math.random());
  const realCreate = walletMod.createWalletConnector;
  const wrapCreate = (args) => {
    const wc = realCreate(args);
    const origSend = wc.signAndSend.bind(wc);
    // The connector exposes GETTERS (publicKey, walletName). Object.assign would
    // snapshot them to their connect-time values (null), silently disabling the
    // Roll button. Delegate with a Proxy so getters stay live.
    return new Proxy(wc, {
      get(target, prop, recv) {
        if (prop === 'signAndSend') {
          return (tx, options = {}) => origSend(tx, {
            ...options,
            onSigned: (s, raw) => {
              signedSigs.push(s);
              // Model the reported production case: Phantom signs but the page's
              // signatureOf extraction returns nothing (s=null) while raw bytes are
              // still present. The page must still treat this as "a signature was
              // produced" and never re-prompt.
              const effectiveSig = signatureOfNull ? null : s;
              if (typeof options.onSigned === 'function') options.onSigned(effectiveSig, raw);
            },
          });
        }
        return Reflect.get(target, prop, target);
      },
    });
  };

  const file = join(mkdtempSync(join(tmpdir(), 'mintpage-')), 'page.mjs');
  // Route the page's connector import through our wrapper.
  const moduleSrc = extractModule().replace(
    /import \{ createWalletConnector, isMobileWalletBrowser \} from ("[^"]+");/,
    'const { createWalletConnector, isMobileWalletBrowser } = globalThis.__mintHarnessWallet;',
  );
  globalThis.__mintHarnessWallet = {
    createWalletConnector: wrapCreate,
    isMobileWalletBrowser: () => mobile,
  };
  writeFileSync(file, moduleSrc);

  let error = null;
  try {
    await import(pathToFileURL(file).href + '?t=' + Date.now());
    await new Promise((r) => realTimeout(r, 30));
    window.document.getElementById('btn-connect').click();
    for (let i = 0; i < 60 && !window.document.getElementById('btn-mint'); i++) await sleep(10);
    // Wait for the page's explicit ready state. Desktop Roll is intentionally
    // disabled until a complete fresh transaction is prepared; a fixed 400ms
    // sleep races that preparation when simulated RPC latency is high.
    for (let i = 0; i < 300; i++) {
      if (window.document.getElementById('btn-mint')?.getAttribute('aria-disabled') === 'false') break;
      await sleep(10);
    }
    mark('--- CONNECTED, clicking Roll ---');
    if (roll) {
      window.document.getElementById('btn-mint').click();
      // wait until reveal or error
      for (let i = 0; i < 400; i++) {
        const revealed = window.document.getElementById('reveal-box')?.classList.contains('revealed');
        const errShown = window.document.getElementById('mint-msg')?.classList.contains('err');
        if (revealed || errShown) break;
        await sleep(25);
      }
      mark('--- ROLL SETTLED ---');
      // The production page intentionally reconciles `confirmed` in the
      // background after revealing at `processed`. Let that short mocked task
      // drain before restoring shared globals/prototypes, or it leaks into the
      // next jsdom page in this process.
      await new Promise((r) => realTimeout(r, Math.max(40, rpcLatencyMs + 20)));
    }
  } catch (e) {
    error = e;
  } finally {
    window.dispatchEvent(new window.Event('beforeunload'));
    obs.disconnect();
    for (const [k, v] of Object.entries(saved)) C[k] = v;
    for (const [k, s] of Object.entries(savedGlobals)) {
      try {
        if (s.had) Object.defineProperty(g, k, { value: s.value, configurable: true, writable: true });
        else delete g[k];
      } catch { /* ignore */ }
    }
  }

  const doc = window.document;
  return {
    trace, msgs, intervals, error, window, sleeps,
    // Signatures the PAGE was told about via the onSigned callback, i.e. before
    // submission. Proves the money-safety reconciliation hook actually fires.
    signedSignatures: signedSigs,
    revealed: !!doc.getElementById('reveal-box')?.classList.contains('revealed'),
    slotName: doc.getElementById('slot-name')?.textContent || '',
    finalMsg: doc.getElementById('mint-msg')?.textContent || '',
    isError: !!doc.getElementById('mint-msg')?.classList.contains('err'),
    popupAt: trace.find((t) => t.label.startsWith('POPUP_OPEN'))?.at ?? null,
    approvedAt: trace.find((t) => t.label === 'POPUP_APPROVED')?.at ?? null,
    rollAt: trace.find((t) => t.label.includes('clicking Roll'))?.at ?? null,
    settledAt: trace.find((t) => t.label.includes('ROLL SETTLED'))?.at ?? null,
  };
}
