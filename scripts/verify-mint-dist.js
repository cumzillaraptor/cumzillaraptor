const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('dist/mint/index.html', 'utf8');
const blocks = [...src.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
console.log('module blocks:', blocks.length);

let js = blocks.join('\n');
// Strip static imports so the body can be parsed standalone.
js = js.replace(/^\s*import\s[\s\S]*?from\s*["'][^"']+["'];?\s*$/gm, '');
new vm.Script('(async()=>{' + js + '})()');
console.log('mint module parses OK');

const checks = {
  pendingSignatures: /pendingSignatures/,
  findLandedSignature: /findLandedSignature/,
  pollGuard: /if \(spinning\) return;/,
  preferSignOnly: /preferSignOnly/,
};

for (const path of ['dist/mint/index.html', 'dist/cumzillaraptors/mint/index.html']) {
  if (!fs.existsSync(path)) {
    console.log(path, 'MISSING');
    continue;
  }
  const t = fs.readFileSync(path, 'utf8');
  const out = Object.entries(checks)
    .map(([k, re]) => k + '=' + (t.match(new RegExp(re, 'g')) || []).length)
    .join(' ');
  console.log(path, out);
}
