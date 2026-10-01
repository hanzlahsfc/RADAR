import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { MessageContext } from '../alerts/deliver.js';
import { eventDirectionFor } from '../alerts/rules.js';
import { renderAlertMessage } from '../bot/formatters/event.js';
import type { ChainReader, HistoryProvider } from '../chain/types.js';
import type { ContractsConfig } from '../config/contracts.js';
import type { Env } from '../config/env.js';
import { explorerTxUrl, type NetworkConfig } from '../config/network.js';
import type { Database } from '../db/client.js';
import { toChainEvent } from '../db/repositories/events.js';
import { events, watchedWallets } from '../db/schema/index.js';
import {
  claimBackfillJob,
  completeBackfillJob,
  continueBackfillJob,
  failBackfillJob,
  processBackfillJob,
} from '../indexer/backfill.js';
import { getCursor } from '../indexer/checkpoints.js';
import { processLiveBatch } from '../indexer/live.js';

export interface WorkerContext {
  env: Env;
  logger: Logger;
  db: Database;
  network: NetworkConfig | null;
  chain: ChainReader | null;
  provider: HistoryProvider | null;
  contracts: ContractsConfig;
}

function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function buildLiveStreamKey(network: NetworkConfig): string {
  return `live:native:${network.chainId}`;
}

export async function liveTick(context: WorkerContext): Promise<void> {
  const { network, chain, db, env, logger } = context;
  if (!network || !chain) return;

  const streamKey = buildLiveStreamKey(network);
  const cursor = await getCursor(db, streamKey);
  const confirmedHead = await chain.getConfirmedHead();
  const batchSize = BigInt(env.INITIAL_BLOCK_BATCH_SIZE);

  const fromBlock = cursor
    ? cursor.lastProcessedBlock + 1n
    : confirmedHead > batchSize
      ? confirmedHead - batchSize
      : 0n;

  if (fromBlock > confirmedHead) return;
  const toBlock = minBigInt(fromBlock + batchSize - 1n, confirmedHead);

  const result = await processLiveBatch({
    db,
    reader: chain,
    chainId: BigInt(network.chainId),
    fromBlock,
    toBlock,
    streamKey,
    logger,
    supportedTokens: context.contracts.supportedTokens,
    materializeAlerts: true,
  });

  if (result.acquired) {
    logger.debug(
      {
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
        inserted: result.eventsInserted,
        alerts: result.alertsCreated,
        reorg: result.reorgDetected,
      },
      'live batch processed',
    );
  }
}

export async function backfillTick(context: WorkerContext): Promise<void> {
  const { db, chain, provider, network, contracts, logger } = context;
  if (!network || !chain || !provider) return;

  const job = await claimBackfillJob(db, { leaseMs: 120_000 });
  if (!job) return;

  try {
    const tokenMetadata = new Map(
      contracts.supportedTokens.map((token) => [
        token.address.toLowerCase(),
        { decimals: token.decimals, symbol: token.symbol },
      ]),
    );
    const outcome = await processBackfillJob(
      { db, chainId: BigInt(network.chainId), provider, reader: chain, tokenMetadata },
      job,
    );
    if (outcome.complete) {
      await completeBackfillJob(db, job.id, {
        start: job.fromTimestamp,
        end: job.toTimestamp,
      });
      logger.info({ jobId: job.id, ...outcome }, 'backfill job completed');
    } else if (outcome.nextCursor) {
      await continueBackfillJob(db, job.id, outcome.nextCursor);
      logger.info(
        { jobId: job.id, pages: outcome.pages },
        'backfill page budget reached; job will continue',
      );
    } else {
      throw new Error(
        'Backfill provider returned incomplete history without a continuation cursor',
      );
    }
  } catch (error) {
    logger.warn({ err: error, jobId: job.id }, 'backfill job failed; will retry');
    await failBackfillJob(db, job.id, {
      error: error instanceof Error ? error.message : String(error),
      retryInMs: 30_000,
    });
  }
}

export async function renderOutboxMessage(
  db: Database,
  network: NetworkConfig | null,
  context: MessageContext,
): Promise<string> {
  const eventRow = (
    await db.select().from(events).where(eq(events.id, context.outbox.eventId)).limit(1)
  )[0];
  if (!eventRow) {
    return '<b>RADAR</b>\nThis alert referenced an event that is no longer stored.';
  }
  const watch = (
    await db
      .select()
      .from(watchedWallets)
      .where(eq(watchedWallets.id, context.outbox.watchId))
      .limit(1)
  )[0];
  const event = toChainEvent(eventRow);
  const direction = watch ? (eventDirectionFor(event, watch.address) ?? 'in') : 'in';
  const txUrl = network ? explorerTxUrl(network, event.transactionHash) : undefined;
  return renderAlertMessage({
    event,
    watchLabel: watch?.label ?? null,
    direction,
    ...(txUrl ? { explorerTxUrl: txUrl } : {}),
  });
}
