import {
  createPinnedReleaseSeal,
  getProductionReleaseSealContract,
} from './v2-release-seal.mjs';

const STEP5_REVISION = 'f69dab643ac401859a9d21d6aeabf4dab53cf640';

export async function createR1ReleaseSeal({ objectDatabase }) {
  return createPinnedReleaseSeal({
    commitId: STEP5_REVISION,
    objectDatabase,
  });
}

export function getR1ReleaseSealContract() {
  const contract = getProductionReleaseSealContract();
  return Object.freeze({
    step5Revision: STEP5_REVISION,
    sealFormat: contract.format,
    paths: contract.allowlist,
    status: 'repository-only-unpersisted',
  });
}
