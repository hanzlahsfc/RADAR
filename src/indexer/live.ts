import { and, eq, isNull } from 'drizzle-orm';
import type { Logger } from 'pino';
import { materializeAlertsForEvents } from '../alerts/materialize.js';
import { ERC20_TRANSFER_TOPIC, decodeErc20Transfers } from '../chain/adapters/erc20-transfer.js';
import { decodeNativeTransfers } from '../chain/adapters/native-transfer.js';
import type {
  ChainEvent,
  ChainReader,
  NormalizedBlock,
  NormalizedLog,
  NormalizedReceipt,
} from '../chain/types.js';
import type { TokenConfig } from '../config/contracts.js';
import type { Database } from '../db/client.js';
import { insertEvents } from '../db/repositories/events.js';
import { watchedWallets } from '../db/schema/index.js';
import { recordCanonicalBlock } from './canonicality.js';
import { advanceCursor, tryStreamLock } from './checkpoints.js';

export interface LiveBatchOptions {
  db: Database;
  reader: ChainReader;
  chainId: bigint;
  fromBlock: bigint;
  toBlock: bigint;
  streamKey: string;
  logger: Logger;
  supportedTokens: TokenConfig[];
  materializeAlerts?: boolean;
}

export interface LiveBatchResult {
  acquired: boolean;
  blocksProcessed: number;
  eventsInserted: number;
  alertsCreated: number;
  reorgDetected: boolean;
  forkExceedsWindow: boolean;
  lastBlock: bigint | null;
  reason?: string;
}

/**
 * Process one bounded batch of blocks for the live stream.
 *
 * Everything happens in ONE transaction that first takes a stream advisory
 * lock, so: the lock is released on commit/rollback, events and the cursor
 * advance atomically, and a crash cannot leave the cursor ahead of the data.
 * Historical backfill must NOT call this — it is the only path that materializes
 * live alerts.
 */
function touchesWatched(event: ChainEvent, watched: Set<string>): boolean {
  const addresses = [event.fromAddress, event.toAddress, event.creatorAddress];
  return addresses.some((address) => address !== undefined && watched.has(address.toLowerCase()));
}

/**
 * Query Transfer logs for the configured tokens over the batch, then decode per
 * transaction using the already-fetched blocks for canonical timestamps.
 */
async function collectTokenEvents(
  options: LiveBatchOptions,
  blocks: Map<string, NormalizedBlock>,
  toBlock: bigint,
  watched: Set<string>,
): Promise<ChainEvent[]> {
  const tokenAddresses = options.supportedTokens.map((token) => token.address);
  const tokenMeta = new Map(
    options.supportedTokens.map((token) => [
      token.address.toLowerCase(),
      { decimals: token.decimals, symbol: token.symbol },
    ]),
  );

  const logs = await options.reader.getLogs({
    fromBlock: options.fromBlock,
    toBlock,
    address: tokenAddresses,
    topics: [ERC20_TRANSFER_TOPIC],
  });

  const byTransaction = new Map<string, NormalizedLog[]>();
  for (const log of logs) {
    if (!log.transactionHash || log.blockNumber === undefined) continue;
    const key = `${log.blockNumber.toString()}:${log.transactionHash}`;
    const bucket = byTransaction.get(key) ?? [];
    bucket.push(log);
    byTransaction.set(key, bucket);
  }

  const events: ChainEvent[] = [];
  for (const group of byTransaction.values()) {
    const first = group[0];
    if (!first || first.blockNumber === undefined || !first.transactionHash) continue;
    const block = blocks.get(first.blockNumber.toString());
    if (!block) continue;

    const receipt: NormalizedReceipt = {
      transactionHash: first.transactionHash,
      blockNumber: first.blockNumber,
      blockHash: block.hash,
      status: 'success',
      from: first.address,
      to: null,
      logs: group,
    };
    for (const event of decodeErc20Transfers(block, receipt, Number(options.chainId), {
      tokenMetadata: tokenMeta,
    })) {
      if (touchesWatched(event, watched)) {
        events.push(event);
      }
    }
  }
  return events;
}

function notAcquired(reason: string): LiveBatchResult {
  return {
    acquired: false,
    blocksProcessed: 0,
    eventsInserted: 0,
    alertsCreated: 0,
    reorgDetected: false,
    forkExceedsWindow: false,
    lastBlock: null,
    reason,
  };
}

export async function processLiveBatch(options: LiveBatchOptions): Promise<LiveBatchResult> {
  return options.db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    const acquired = await tryStreamLock(txDb, options.streamKey);
    if (!acquired) {
      return notAcquired('stream is locked by another worker');
    }

    const watches = await txDb
      .select({ address: watchedWallets.address })
      .from(watchedWallets)
      .where(and(eq(watchedWallets.chainId, options.chainId), isNull(watchedWallets.removedAt)));
    const watched = new Set(watches.map((watch) => watch.address.toLowerCase()));

    const blocks = new Map<string, NormalizedBlock>();
    let reorgDetected = false;
    let forkExceedsWindow = false;
    let lastBlock: bigint | null = null;

    for (let number = options.fromBlock; number <= options.toBlock; number += 1n) {
      const block = await options.reader.getBlock(number);
      blocks.set(number.toString(), block);
      const outcome = await recordCanonicalBlock(txDb, options.chainId, block);
      reorgDetected = reorgDetected || outcome.reorgDetected;
      forkExceedsWindow = forkExceedsWindow || outcome.forkExceedsWindow;
      lastBlock = block.number;
      if (forkExceedsWindow) break;
    }

    const events: ChainEvent[] = [];
    for (const block of blocks.values()) {
      for (const event of decodeNativeTransfers(block, Number(options.chainId))) {
        if (touchesWatched(event, watched)) {
          events.push(event);
        }
      }
    }

    if (options.supportedTokens.length > 0 && lastBlock !== null) {
      events.push(...(await collectTokenEvents(options, blocks, lastBlock, watched)));
    }

    const inserted = await insertEvents(txDb, events);
    let alertsCreated = 0;
    if (options.materializeAlerts && inserted.length > 0) {
      alertsCreated = await materializeAlertsForEvents(txDb, inserted);
    }

    if (lastBlock !== null) {
      const lastHash = blocks.get(lastBlock.toString())?.hash;
      if (lastHash) {
        await advanceCursor(txDb, {
          streamKey: options.streamKey,
          chainId: options.chainId,
          blockNumber: lastBlock,
          blockHash: lastHash,
        });
      }
    }

    return {
      acquired: true,
      blocksProcessed: blocks.size,
      eventsInserted: inserted.length,
      alertsCreated,
      reorgDetected,
      forkExceedsWindow,
      lastBlock,
    };
  });
}
