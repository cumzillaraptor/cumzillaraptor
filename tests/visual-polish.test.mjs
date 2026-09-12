import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const home = read('index.html');
const mint = read('cumzillaraptors/mint/index.html');
const claim = read('cumzillaraptors/claim/index.html');
const css = read('assets/cumz.css');

test('all three pages use the polished shared page shell', () => {
  for (const [name, page] of [['home', home], ['mint', mint], ['claim', claim]]) {
    assert.match(page, /class="[^"]*page-shell/, `${name} is missing page-shell`);
    assert.match(page, /class="eyebrow"/, `${name} is missing its eyebrow label`);
  }
});

test('transaction pages use the shared premium dapp card', () => {
  assert.match(mint, /class="panel panel-box dapp-card"/);
  assert.match(claim, /class="panel panel-box dapp-card"/);
});

test('shared polish includes texture, current-page and keyboard focus treatments', () => {
  assert.match(css, /body::before/);
  assert.match(css, /\.menu-link\[aria-current="page"\]/);
  assert.match(css, /\.dapp-card/);
  assert.match(css, /\.eyebrow/);
  assert.match(css, /button:focus-visible/);
});

test('home keeps one clear primary mint action and a secondary claim action', () => {
  assert.equal((home.match(/id="btn-mint-now"/g) || []).length, 1);
  assert.equal((home.match(/class="link-claim"/g) || []).length, 1);
});

test('home mascot is visible immediately with no delayed entrance', () => {
  const mascotRule = home.match(/\.mascot-wrap\s*\{([\s\S]*?)\}/)?.[1] || '';
  assert.doesNotMatch(mascotRule, /opacity\s*:\s*0/);
  assert.doesNotMatch(mascotRule, /animation\s*:/);
  assert.doesNotMatch(mascotRule, /translateY\(/);
});
