import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { fetchCollection, Key, mplCore } = require('@metaplex-foundation/mpl-core');
const { publicKey } = require('@metaplex-foundation/umi');

export const CORE_PROGRAM_ID = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';
export const COLLECTION_URI = 'ar://oGxXHkoQKnsq47U4KESzurJ0-qk0dJa2FWofHQc_-SQ';
export const TREASURY = 'FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6';
export const ROYALTY_BPS = 500;

export function verifyCoreCollection(value, expectedAuthority) {
  if (!value || value.owner !== CORE_PROGRAM_ID) throw new Error('Collection account is not owned by canonical mpl-core.');
  if (value.updateAuthority !== expectedAuthority) throw new Error('Collection update authority does not equal config PDA.');
  if (value.name !== 'cumzillaraptors') throw new Error('Collection name mismatch.');
  if (value.uri !== COLLECTION_URI) throw new Error('Collection URI mismatch.');
  const royalties = value.royalties;
  if (!royalties || royalties.basisPoints !== ROYALTY_BPS) throw new Error('Collection royalties must be 500 basis points.');
  if (royalties.creators?.length !== 1 || royalties.creators[0].address !== TREASURY || royalties.creators[0].percentage !== 100) throw new Error('Collection royalty recipient mismatch.');
  return true;
}

export function normalizeFetchedCoreCollection(fetched) {
  if (!fetched?.header?.owner) throw new Error('Fetched Core collection is missing its RPC account owner.');
  if (fetched.key !== Key.CollectionV1) throw new Error('Fetched Core account is not CollectionV1.');
  return {
    owner: String(fetched.header.owner), updateAuthority: String(fetched.updateAuthority), name: fetched.name, uri: fetched.uri,
    royalties: fetched.royalties && { basisPoints: fetched.royalties.basisPoints, creators: fetched.royalties.creators.map((creator) => ({ address: String(creator.address), percentage: creator.percentage })) },
  };
}

export async function fetchAndVerifyCoreCollection({ rpc, collection, expectedAuthority, fetchCollectionFn = fetchCollection, umiFactory = createUmi }) {
  const umi = umiFactory(rpc).use(mplCore());
  const fetched = await fetchCollectionFn(umi, publicKey(collection));
  const normalized = normalizeFetchedCoreCollection(fetched);
  verifyCoreCollection(normalized, expectedAuthority);
  return normalized;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [target, expectedAuthority, rpc = 'https://api.devnet.solana.com'] = process.argv.slice(2);
  if (!target || !expectedAuthority) { console.error('Usage: node scripts/verify-core-collection.mjs <collection-address|state.json> <config-pda> [rpc]'); process.exitCode = 1; }
  else try {
    const value = target.endsWith('.json') ? JSON.parse(await readFile(target, 'utf8')) : await fetchAndVerifyCoreCollection({ rpc, collection: target, expectedAuthority });
    if (target.endsWith('.json')) verifyCoreCollection(value, expectedAuthority);
    console.log(JSON.stringify({ verified: true, collection: target, state: value }, null, 2));
  } catch (error) { console.error(`VERIFY ERROR: ${error.message}`); process.exitCode = 1; }
}
