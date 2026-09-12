import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const htmlPath = new URL('index.html', root);
const svgPath = new URL('assets/cumzillaraptor116.svg', root);
const readHtml = () => readFile(htmlPath, 'utf8');

test('uses the verified vector mascot without raster fallbacks', async () => {
  await access(svgPath);
  const [source, svg] = await Promise.all([readHtml(), readFile(svgPath, 'utf8')]);
  assert.match(source, /assets\/cumzillaraptor116\.svg/);
  assert.doesNotMatch(source, /cumzillaraptor(?:-transparent)?\.png|cumzillaraptor\.jpg/);
  assert.match(svg, /<svg[\s>]/);
  assert.doesNotMatch(svg, /<image[\s>]|data:image|<script[\s>]/i);
});

test('uses the approved palette, local font, and launch copy', async () => {
  const [source, css] = await Promise.all([readHtml(), readFile(new URL('assets/cumz.css', root), 'utf8')]);
  assert.match(css, /--green:\s*#6dfe41/i);
  assert.match(css, /--charcoal:\s*#000000/i);
  assert.match(css, /@font-face[\s\S]*font-family:\s*"Chewy"[\s\S]*Chewy-Regular\.ttf/);
  assert.match(css, /body\s*\{[\s\S]*font-family:\s*"Chewy"/);
  assert.match(source, /mint a[\s\S]*cumzillaraptor/);
  assert.doesNotMatch(source, /internet creature approaches/i);
});

test('contains the complete requested navigation contract', async () => {
  const source = await readHtml();
  assert.match(source, /https:\/\/pump\.fun\/coin\/9p3NuCz29u7KUsjfrZcBPNGB2pryDpACggjSjYWbkpds/);
  assert.match(source, /https:\/\/cumzillaraptor\.com\//);
  assert.match(source, /https:\/\/mint\.cumzillaraptor\.com\//);
  assert.match(source, /\$CUM 💦/);
  assert.match(source, /Mint 🦖/);
  assert.match(source, /aria-disabled="true"/);
  assert.match(source, /cumzillaraptor live \(18\+\)/);
  assert.match(source, /<span class="menu-link disabled" aria-disabled="true">merch/);
});

test('has green splash and staggered motion while the mascot appears immediately', async () => {
  const source = await readHtml();
  assert.match(source, /class="splash"[^>]*[\s\S]*<svg/);
  assert.match(source, /<path[^>]+fill="var\(--green\)"/);
  assert.match(source, /@keyframes splash-enter/);
  assert.match(source, /@keyframes caption-enter/);
  assert.match(source, /@keyframes credit-enter/);
  assert.match(source, /animation:\s*splash-enter/);
  assert.match(source, /animation:\s*caption-enter/);
  const mascotRule = source.match(/\.mascot-wrap\s*\{([\s\S]*?)\}/)?.[1] || '';
  assert.doesNotMatch(mascotRule, /opacity\s*:\s*0|animation\s*:/);
});

test('menu and motion are accessible', async () => {
  const source = await readHtml();
  assert.match(source, /aria-expanded="false"/);
  assert.match(source, /aria-controls="site-menu"/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /(?:event|e)\.key === 'Escape'/);
});
