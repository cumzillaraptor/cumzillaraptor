#!/usr/bin/env node
// Regenerate slim site data files from canonical artifacts:
//   cumzillaraptors/client/data/metadata-slim.json  — { "<id>": { u, p } } for ALL 420
//   cumzillaraptors/client/data/pool-order.json     — [ids...] in reviewed manifest order (public)
//   cumzillaraptors/client/data/claims-by-eth.json  — { "<eth>": { id, p } } for 174 claims
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const md = JSON.parse(fs.readFileSync(path.join(ROOT, 'nft-data/metadata-merkle-v1.devnet.json'), 'utf8'));
const claims = JSON.parse(fs.readFileSync(path.join(ROOT, 'nft-data/claims-v1.devnet.json'), 'utf8'));
const mintCsv = fs.readFileSync(path.join(ROOT, 'nft-data/allocation-source/mint_list.csv'), 'utf8').trim().split(/\r?\n/).slice(1);

const metaDir = path.join(ROOT, 'nft-data/metadata');
const metadataSlim = {};
for (const [id, m] of Object.entries(md.metadata)) {
  const full = JSON.parse(fs.readFileSync(path.join(metaDir, `${id}.json`), 'utf8'));
  metadataSlim[id] = { u: m.uri, p: m.proof, t: full.attributes.map((a) => [a.trait_type, a.value]) };
}

const poolOrder = mintCsv.map((line) => Number(line.split(',')[0]));
if (poolOrder.length !== 246 || new Set(poolOrder).size !== 246) throw new Error('mint_list parse error');

const claimsByEth = {};
for (const c of claims.claims) {
  const k = c.ethAddress.toLowerCase();
  (claimsByEth[k] ??= []).push({ id: c.nftId, p: c.proof });
}
// keep each holder's list ordered by id
for (const k of Object.keys(claimsByEth)) claimsByEth[k].sort((a, b) => a.id - b.id);

const OUT = path.join(ROOT, 'cumzillaraptors/client/data');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'metadata-slim.json'), JSON.stringify(metadataSlim));
fs.writeFileSync(path.join(OUT, 'pool-order.json'), JSON.stringify(poolOrder));
fs.writeFileSync(path.join(OUT, 'claims-by-eth.json'), JSON.stringify(claimsByEth));
console.log(`metadata-slim: ${Object.keys(metadataSlim).length} entries`);
console.log(`pool-order: ${poolOrder.length} ids (first 5: ${poolOrder.slice(0,5).join(',')})`);
console.log(`claims-by-eth: ${Object.keys(claimsByEth).length} addresses, ${Object.values(claimsByEth).reduce((a, v) => a + v.length, 0)} claims`);
