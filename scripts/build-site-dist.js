#!/usr/bin/env node
// Assemble the publish bundle (dist/) — used by GH Actions and Cloudflare Workers Builds.
'use strict';
const { execSync } = require('child_process');
const cmd = `
set -euo pipefail
rm -rf dist
mkdir -p dist/assets/vendor dist/config dist/cumzillaraptors/mint/data dist/cumzillaraptors/claim/data dist/mint dist/claim
cp index.html dist/
cp assets/cumz.css assets/cumzillaraptor116.svg assets/cumzillaraptor-transparent.png assets/Chewy-Regular.ttf dist/assets/
cp assets/vendor/*.js dist/assets/vendor/
cp config/site.js dist/config/
cp cumzillaraptors/mint/index.html dist/cumzillaraptors/mint/
cp cumzillaraptors/client/chain.js cumzillaraptors/client/wallet.js cumzillaraptors/client/web3-shim.js cumzillaraptors/client/keccak-shim.js dist/cumzillaraptors/mint/
cp cumzillaraptors/client/data/metadata-slim.json cumzillaraptors/client/data/pool-order.json dist/cumzillaraptors/mint/data/
cp cumzillaraptors/claim/index.html dist/cumzillaraptors/claim/
cp cumzillaraptors/client/chain.js cumzillaraptors/client/wallet.js cumzillaraptors/client/web3-shim.js cumzillaraptors/client/keccak-shim.js dist/cumzillaraptors/claim/
cp cumzillaraptors/client/data/metadata-slim.json cumzillaraptors/client/data/claims-by-eth.json dist/cumzillaraptors/claim/data/
cp dist/cumzillaraptors/mint/index.html dist/mint/index.html
cp dist/cumzillaraptors/claim/index.html dist/claim/index.html
`;
execSync(cmd, { stdio: 'inherit', shell: '/bin/bash' });
console.log('dist/ assembled');
