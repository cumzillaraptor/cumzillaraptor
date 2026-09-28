#!/usr/bin/env node
// LOCAL PREVIEW ONLY — never part of a deploy.
//
// The built bundle links to the production origins (https://mint.cumzillaraptor.com/,
// https://claim.cumzillaraptor.com/, https://cumzillaraptor.com/). In a tunnel preview
// those links jump out to the LIVE site, which looks like "nothing changed". This
// rewrites the copies in dist/ ONLY (dist/ is gitignored, the sources keep the absolute
// production URLs and are untouched) so every link stays inside the preview.
//
// Usage: npm run build:preview   (build:site + this script)
'use strict';
const { readFileSync, writeFileSync, existsSync } = require('fs');

const REWRITES = [
  ['https://mint.cumzillaraptor.com/', '/mint/'],
  ['https://claim.cumzillaraptor.com/', '/claim/'],
  ['https://cumzillaraptor.com/', '/'],
];

const FILES = [
  'dist/index.html',
  'dist/mint/index.html',
  'dist/claim/index.html',
  'dist/cumzillaraptors/mint/index.html',
  'dist/cumzillaraptors/claim/index.html',
  'dist/config/site.js',
];

let touched = 0;
for (const file of FILES) {
  if (!existsSync(file)) continue;
  const before = readFileSync(file, 'utf8');
  let after = before;
  for (const [from, to] of REWRITES) after = after.split(from).join(to);
  if (after !== before) {
    writeFileSync(file, after);
    const count = REWRITES.reduce((n, [from]) => n + before.split(from).length - 1, 0);
    console.log(`localized ${count} link(s) in ${file}`);
    touched++;
  }
}
console.log(`preview link localization done (${touched} file(s) rewritten)`);