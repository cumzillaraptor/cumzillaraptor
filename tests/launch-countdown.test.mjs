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

test('homepage button counts down and switches to exact MINT NOW copy', async () => {
  const source = await readFile(new URL('index.html', root), 'utf8');
  assert.match(source, /const LAUNCH_AT = 1790398799000/);
  assert.match(source, /id="mint-countdown">00:00:00:00/);
  assert.match(source, /mintCountdown\.textContent = 'MINT NOW'/);
  assert.match(source, /font-variant-numeric:\s*tabular-nums/);
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
  test(`${name} page hides the real page before launch and opens it at launch`, async () => {
    const source = await readFile(path, 'utf8');
    assert.match(source, /id="launch-gate"/);
    assert.match(source, /id="real-page" hidden inert/);
    assert.doesNotMatch(source, /class="launch-units"|class="launch-time"|Friday, September 25/);
    assert.match(source, /var LAUNCH_AT = 1790398799000/);

    const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const gateScript = scripts.find((s) => s.includes('var LAUNCH_AT = 1790398799000'));
    assert.ok(gateScript, 'countdown gate script missing');

    let now = target - (((2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000));
    const dom = new JSDOM(source, { runScripts: 'outside-only' });
    dom.window.Date.now = () => now;
    dom.window.eval(gateScript);
    assert.equal(dom.window.document.getElementById('launch-countdown').textContent, '02:03:04:05');
    assert.equal(dom.window.document.getElementById('launch-gate').hidden, false);
    assert.equal(dom.window.document.getElementById('real-page').hidden, true);

    now = target;
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(dom.window.document.getElementById('launch-gate').hidden, true);
    assert.equal(dom.window.document.getElementById('real-page').hidden, false);
    assert.equal(dom.window.document.getElementById('real-page').hasAttribute('inert'), false);
    dom.window.close();
  });
}

test('countdown pages use the requested launch copy', async () => {
  const mint = await readFile(new URL('cumzillaraptors/mint/index.html', root), 'utf8');
  const claim = await readFile(new URL('cumzillaraptors/claim/index.html', root), 'utf8');
  assert.match(mint, /<p class="eyebrow">own a raptor<\/p>/);
  assert.match(claim, /<p class="eyebrow">for ethereum raptor holders<\/p>/);
  assert.match(claim, /<p class="snapshot-note">📸 taken Aug 31, 2026<\/p>/);
  assert.doesNotMatch(mint, /the mint opens in/);
  assert.doesNotMatch(claim, /claiming opens in/);
});