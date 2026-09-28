import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);
const target = 1790398799000;
const pages = [
  ['mint', new URL('cumzillaraptors/mint/index.html', root)],
  ['claim', new URL('cumzillaraptors/claim/index.html', root)],
];

test('launch instant is literal EST (UTC-5)', () => {
  assert.equal(new Date(target).toISOString(), '2026-09-26T04:59:59.000Z');
});

test('homepage mint button shows the literal 💦ing Soon label, not a countdown', async () => {
  const source = await readFile(new URL('index.html', root), 'utf8');
  assert.match(source, /<span id="mint-status">💦ing Soon<\/span>/);
  assert.doesNotMatch(source, /LAUNCH_AT|mintCountdown|MINT NOW|id="mint-countdown"/);
  const buttonRule = source.match(/\.btn-mint-now\s*\{([\s\S]*?)\}/)?.[1] || '';
  assert.doesNotMatch(buttonRule, /text-transform/, 'the label must render as written (💦ing Soon)');
});

test('worker serves the countdown homepage instead of redirecting apex', async () => {
  const source = await readFile(new URL('worker.js', root), 'utf8');
  assert.match(source, /const SITE_LIVE = true/);
});

test('hidden launch content stays hidden despite author display rules', async () => {
  const css = await readFile(new URL('assets/cumz.css', root), 'utf8');
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});

for (const [name, path] of pages) {
  test(`${name} page is a fail-closed 💦ing soon splash until mainnet-ready`, async () => {
    const source = await readFile(path, 'utf8');
    assert.match(source, /id="launch-gate"/);
    assert.match(source, /id="real-page" hidden inert/);
    assert.doesNotMatch(source, /class="launch-units"|class="launch-time"|Friday, September 25/);
    assert.doesNotMatch(source, /var LAUNCH_AT|id="launch-countdown"|role="timer"/);
    assert.match(source, /var LAUNCH_READY = false/);

    const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const gateScript = scripts.find((s) => s.includes('var LAUNCH_READY'));
    assert.ok(gateScript, 'splash gate script missing');

    // Closed gate: the real page stays hidden and no timer ever opens it.
    const dom = new JSDOM(source, { runScripts: 'outside-only' });
    dom.window.eval(gateScript);
    assert.equal(dom.window.LAUNCH_READY, false);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(dom.window.document.getElementById('launch-gate').hidden, false);
    assert.equal(dom.window.document.getElementById('real-page').hidden, true);
    assert.equal(dom.window.document.getElementById('real-page').hasAttribute('inert'), true);
    assert.equal(dom.window.document.getElementById('launch-title').textContent, '💦ing Soon');
    dom.window.close();

    // Flipped flag: the preserved real page is revealed by one deliberate edit.
    const opened = new JSDOM(source.replace('var LAUNCH_READY = false', 'var LAUNCH_READY = true'), {
      runScripts: 'outside-only',
    });
    const openedScript = [...opened.window.document.querySelectorAll('script')]
      .map((s) => s.textContent)
      .find((s) => s.includes('var LAUNCH_READY = true'));
    opened.window.eval(openedScript);
    assert.equal(opened.window.document.getElementById('launch-gate').hidden, true);
    assert.equal(opened.window.document.getElementById('real-page').hidden, false);
    assert.equal(opened.window.document.getElementById('real-page').hasAttribute('inert'), false);
    opened.window.close();
  });

  test(`${name} page makes no RPC calls while gated`, async () => {
    const source = await readFile(path, 'utf8');
    assert.match(source, /if \(window\.LAUNCH_READY\)/);
    assert.doesNotMatch(source, /^\s{4}(?:refreshStatus\(\);|prefetchMintData\(\);)/m);
  });
}

test('splash pages say only 💦ing Soon', async () => {
  const mint = await readFile(new URL('cumzillaraptors/mint/index.html', root), 'utf8');
  const claim = await readFile(new URL('cumzillaraptors/claim/index.html', root), 'utf8');
  for (const [name, page] of [['mint', mint], ['claim', claim]]) {
    assert.match(page, /<h1 class="launch-soon" id="launch-title">💦ing Soon<\/h1>/, `${name} splash copy`);
    assert.doesNotMatch(page, /the mint opens in|claiming opens in|live on solana|own a raptor/, name);
    const gate = page.match(/<section class="launch-gate"[\s\S]*?<\/section>/)?.[0] || '';
    assert.ok(gate, `${name} splash gate missing`);
    assert.equal(gate.replace(/<[^>]+>/g, '').trim(), '💦ing Soon', `${name} visible splash copy`);
  }
  // the parked headlines/notes are gone from the splash (they remain only inside
  // the hidden #real-page, which is untouched)
  assert.doesNotMatch(mint, /<p class="eyebrow">coming to solana<\/p>/);
  assert.doesNotMatch(claim, /<p class="eyebrow">for ethereum raptor holders<\/p>/);
  assert.doesNotMatch(claim, /class="snapshot-note"|📸 taken Aug 31, 2026/);
});