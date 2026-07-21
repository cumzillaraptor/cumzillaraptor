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

test('uses the approved palette and exact launch copy', async () => {
  const source = await readHtml();
  assert.match(source, /--green:\s*#6dfe41/i);
  assert.match(source, /--charcoal:\s*#000000/i);
  assert.match(source, /@font-face[\s\S]*font-family:\s*"Chewy"[\s\S]*Chewy-Regular\.ttf/);
  assert.match(source, /body\s*\{[\s\S]*font-family:\s*"Chewy"/);
  assert.doesNotMatch(source, /body::before/);
  assert.match(source, /💦ing[\s\S]*soon/);
  assert.doesNotMatch(source, /internet creature approaches/i);
});

test('contains the complete requested navigation contract', async () => {
  const source = await readHtml();
  assert.match(source, /https:\/\/pump\.fun\/coin\/9p3NuCz29u7KUsjfrZcBPNGB2pryDpACggjSjYWbkpds/);
  assert.match(source, /https:\/\/opensea\.io\/collection\/cumzillaraptors/);
  assert.match(source, /\$CUM 💦/);
  assert.match(source, /cumzillaraptors 🦖/);
  assert.match(source, /aria-disabled="true"/);
  assert.match(source, /cumzillaraptor live \(18\+\)/);
  assert.doesNotMatch(source, /<span class="soon">/);
  assert.match(source, /<span class="menu-link disabled" aria-disabled="true">merch<\/span>/);
});

test('has green splash and staggered entrance motion', async () => {
  const source = await readHtml();
  assert.match(source, /class="splash"[^>]*[\s\S]*<svg/);
  assert.match(source, /<path[^>]+fill="var\(--green\)"/);
  assert.match(source, /@keyframes splash-enter/);
  assert.match(source, /@keyframes mascot-enter/);
  assert.match(source, /@keyframes caption-enter/);
  assert.match(source, /@keyframes credit-enter/);
  assert.match(source, /animation:\s*splash-enter/);
  assert.match(source, /animation:\s*mascot-enter/);
  assert.match(source, /animation:\s*caption-enter/);
});

test('menu and motion are accessible', async () => {
  const source = await readHtml();
  assert.match(source, /aria-expanded="false"/);
  assert.match(source, /aria-controls="site-menu"/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /event\.key === 'Escape'/);
});
