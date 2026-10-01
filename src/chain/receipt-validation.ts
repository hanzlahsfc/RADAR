import type { ContractsConfig } from '../config/contracts.js';
import { decodeErc20Transfers, type Erc20TokenMeta } from './adapters/erc20-transfer.js';
import { decodeNativeTransfers } from './adapters/native-transfer.js';
import { decodePonsLaunches, type PonsLaunchConfig } from './adapters/pons-launch.js';
import type {
  ChainEvent,
  ChainReader,
  Hash,
  NormalizedBlock,
  TransactionCandidate,
} from './types.js';

export interface VerifyCandidatesOptions {
  reader: ChainReader;
  chainId: number;
  candidates: TransactionCandidate[];
  contracts?: ContractsConfig;
  ponsConfig?: PonsLaunchConfig;
  tokenMetadata?: ReadonlyMap<string, Erc20TokenMeta>;
}

export interface VerifiedCandidateBatch {
  events: ChainEvent[];
  /** Candidate hashes whose receipts reverted (excluded from events). */
  failedHashes: Hash[];
  /** Observed blocks keyed by block number, for canonicality tracking. */
  blocks: Map<string, NormalizedBlock>;
  /** Candidates where block/receipt hashes disagreed (reorg mid-verification). */
  mismatchedHashes: Hash[];
}

/**
 * Turn explorer-discovered candidate transactions into verified events by
 * re-reading canonical block + receipt data. Explorer data only *discovers*
 * candidates; this function is what makes them trustworthy.
 *
 * Failed transactions are excluded. If a receipt's block hash disagrees with the
 * block we fetched, the candidate is reported as mismatched and NOT decoded.
 */
export async function verifyCandidates(
  options: VerifyCandidatesOptions,
): Promise<VerifiedCandidateBatch> {
  const blocks = new Map<string, NormalizedBlock>();
  const failedHashes: Hash[] = [];
  const mismatchedHashes: Hash[] = [];
  const events: ChainEvent[] = [];

  for (const candidate of options.candidates) {
    const key = candidate.blockNumber.toString();
    let block = blocks.get(key);
    if (!block) {
      block = await options.reader.getBlock(candidate.blockNumber);
      blocks.set(key, block);
    }

    const receipt = await options.reader.getReceipt(candidate.hash);

    if (receipt.blockHash.toLowerCase() !== block.hash.toLowerCase()) {
      mismatchedHashes.push(candidate.hash);
      continue;
    }
    if (receipt.status !== 'success') {
      failedHashes.push(candidate.hash);
      continue;
    }

    events.push(
      ...decodeErc20Transfers(block, receipt, options.chainId, {
        ...(options.tokenMetadata ? { tokenMetadata: options.tokenMetadata } : {}),
      }),
    );
    if (options.ponsConfig) {
      events.push(
        ...decodePonsLaunches({
          block,
          receipt,
          chainId: options.chainId,
          config: options.ponsConfig,
        }),
      );
    }
  }

  // Native transfers are decoded once per observed block, then filtered to the
  // candidate set so a block scan does not emit unrelated transactions.
  const candidateHashes = new Set(
    options.candidates.map((candidate) => candidate.hash.toLowerCase()),
  );
  const failedSet = new Set(failedHashes.map((hash) => hash.toLowerCase()));
  for (const block of blocks.values()) {
    const native = decodeNativeTransfers(block, options.chainId, { failedHashes: failedSet });
    for (const event of native) {
      if (candidateHashes.has(event.transactionHash.toLowerCase())) {
        events.push(event);
      }
    }
  }

  return { events, failedHashes, blocks, mismatchedHashes };
}
