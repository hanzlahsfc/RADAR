import { and, desc, eq, sql } from 'drizzle-orm';
import type { ChainEvent } from '../../chain/types.js';
import type { Database } from '../client.js';
import { events, type EventRow, type NewEventRow } from '../schema/index.js';

/** Map a normalized ChainEvent to a DB row (exact integer amounts as strings). */
export function toEventRow(event: ChainEvent): NewEventRow {
  return {
    chainId: BigInt(event.chainId),
    blockNumber: event.blockNumber,
    blockHash: event.blockHash,
    transactionHash: event.transactionHash,
    logIndex: parseLogIndex(event.eventKey),
    eventKey: event.eventKey,
    kind: event.kind,
    blockTimestamp: event.timestamp,
    fromAddress: event.fromAddress ?? null,
    toAddress: event.toAddress ?? null,
    tokenAddress: event.tokenAddress ?? null,
    amountRaw: event.amountRaw ?? null,
    tokenDecimals: event.tokenDecimals ?? null,
    tokenSymbol: event.tokenSymbol ?? null,
    factoryAddress: event.factoryAddress ?? null,
    creatorAddress: event.creatorAddress ?? null,
    launchedTokenAddress: event.launchedTokenAddress ?? null,
    canonical: event.canonical,
    confirmationStatus: event.confirmationStatus,
  };
}

/**
 * Insert events idempotently. The unique key (chain_id, block_hash,
 * transaction_hash, event_key) means replaying a range inserts nothing new.
 * Returns only the rows that were actually inserted.
 */
export async function insertEvents(db: Database, chainEvents: ChainEvent[]): Promise<EventRow[]> {
  if (chainEvents.length === 0) return [];
  const rows = chainEvents.map(toEventRow);
  return db
    .insert(events)
    .values(rows)
    .onConflictDoNothing({
      target: [events.chainId, events.blockHash, events.transactionHash, events.eventKey],
    })
    .returning();
}

/** Rebuild a normalized ChainEvent from a stored row (for alert evaluation). */
export function toChainEvent(row: EventRow): ChainEvent {
  return {
    chainId: Number(row.chainId),
    blockNumber: row.blockNumber,
    blockHash: row.blockHash as ChainEvent['blockHash'],
    transactionHash: row.transactionHash as ChainEvent['transactionHash'],
    eventKey: row.eventKey,
    kind: row.kind as ChainEvent['kind'],
    timestamp: row.blockTimestamp,
    ...(row.fromAddress ? { fromAddress: row.fromAddress as ChainEvent['fromAddress'] } : {}),
    ...(row.toAddress ? { toAddress: row.toAddress as ChainEvent['toAddress'] } : {}),
    ...(row.tokenAddress ? { tokenAddress: row.tokenAddress as ChainEvent['tokenAddress'] } : {}),
    ...(row.amountRaw ? { amountRaw: row.amountRaw } : {}),
    ...(row.tokenDecimals !== null ? { tokenDecimals: row.tokenDecimals } : {}),
    ...(row.tokenSymbol ? { tokenSymbol: row.tokenSymbol } : {}),
    ...(row.factoryAddress
      ? { factoryAddress: row.factoryAddress as ChainEvent['factoryAddress'] }
      : {}),
    ...(row.creatorAddress
      ? { creatorAddress: row.creatorAddress as ChainEvent['creatorAddress'] }
      : {}),
    ...(row.launchedTokenAddress
      ? { launchedTokenAddress: row.launchedTokenAddress as ChainEvent['launchedTokenAddress'] }
      : {}),
    canonical: row.canonical,
    confirmationStatus: row.confirmationStatus as ChainEvent['confirmationStatus'],
  };
}

export async function listEventsForAddress(
  db: Database,
  params: { chainId: bigint; address: string; from: Date; to: Date; limit?: number },
): Promise<EventRow[]> {
  const normalized = params.address.toLowerCase();
  return db
    .select()
    .from(events)
    .where(
      and(
        eq(events.chainId, params.chainId),
        eq(events.canonical, true),
        sql`(${events.fromAddress} = ${normalized} or ${events.toAddress} = ${normalized} or ${events.creatorAddress} = ${normalized})`,
        sql`${events.blockTimestamp} >= ${params.from.toISOString()}`,
        sql`${events.blockTimestamp} <= ${params.to.toISOString()}`,
      ),
    )
    .orderBy(desc(events.blockNumber), desc(events.logIndex))
    .limit(params.limit ?? 100);
}

function parseLogIndex(eventKey: string): number | null {
  const match = /^log:(\d+):/.exec(eventKey);
  if (!match || match[1] === undefined) return null;
  return Number.parseInt(match[1], 10);
}
