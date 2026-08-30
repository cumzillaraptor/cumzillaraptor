const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('dist/claim/index.html', 'utf8');
const blocks = [...src.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
console.log('module blocks:', blocks.length);

let js = blocks.join('\n');
const imports = [...js.matchAll(/^\s*import\s[\s\S]*?from\s*["'][^"']+["'];?\s*$/gm)].map((m) => m[0]);
js = js.replace(/^\s*import\s[\s\S]*?from\s*["'][^"']+["'];?\s*$/gm, '');
new vm.Script('(async()=>{' + js + '})()');
console.log('claim module parses OK');

// The page calls advanceNonceInstruction, so it must be imported.
const importsAdvance = imports.some((i) => i.includes('advanceNonceInstruction'));
const callsAdvance = /advanceNonceInstruction\s*\(/.test(js);
console.log('imports advanceNonceInstruction:', importsAdvance);
console.log('calls advanceNonceInstruction:', callsAdvance);
if (callsAdvance && !importsAdvance) {
  throw new Error('FATAL: advanceNonceInstruction called but never imported');
}

for (const path of ['dist/claim/index.html', 'dist/cumzillaraptors/claim/claim-nonce.js']) {
  if (!fs.existsSync(path)) {
    console.log(path, 'MISSING');
    continue;
  }
  const t = fs.readFileSync(path, 'utf8');
  console.log(
    path,
    'authorityPassed=' + /advanceNonceInstruction\([^)]*authority/.test(t),
    'requiresAuthority=' + t.includes('requires the nonce authority'),
    'bareNonceAdvance=' + /nonceAdvance\(\{\s*noncePubkey:[^}]*\}\)/.test(t),
  );
}
