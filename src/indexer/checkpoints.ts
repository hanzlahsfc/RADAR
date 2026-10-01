import { eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { indexCursors } from '../db/schema/index.js';

export interface CursorRecord {
  streamKey: string;
  chainId: bigint;
  lastProcessedBlock: bigint;
  lastProcessedHash: string;
  updatedAt: Date;
}

/**
 * Map a stream key to a stable signed 64-bit advisory-lock key (FNV-1a).
 * Cursors are separated per stream so one stream's failure cannot advance
 * another stream's coverage.
 */
export function streamAdvisoryKey(streamKey: string): bigint {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = (1n << 64n) - 1n;
  for (const byte of Buffer.from(streamKey, 'utf8')) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash >= 1n << 63n ? hash - (1n << 64n) : hash;
}

/**
 * Try to acquire a transaction-scoped advisory lock for a stream.
 * The lock auto-releases at COMMIT/ROLLBACK, so it must be taken inside the
 * same transaction that processes the batch. Returns false if another worker
 * already holds it.
 */
export async function tryStreamLock(db: Database, streamKey: string): Promise<boolean> {
  const key = streamAdvisoryKey(streamKey);
  const result = (await db.execute(
    sql`select pg_try_advisory_xact_lock(${key}) as locked`,
  )) as unknown as Array<{ locked: boolean }>;
  return result[0]?.locked === true;
}

export async function getCursor(db: Database, streamKey: string): Promise<CursorRecord | null> {
  const rows = await db
    .select()
    .from(indexCursors)
    .where(eq(indexCursors.streamKey, streamKey))
    .limit(1);
  return rows[0] ?? null;
}

export async function listCursors(db: Database, chainId: bigint): Promise<CursorRecord[]> {
  return db.select().from(indexCursors).where(eq(indexCursors.chainId, chainId));
}

/**
 * Advance a cursor without going backwards. A lower block number is rejected so
 * a stale worker cannot rewind coverage accidentally (rewinds are explicit).
 */
export async function advanceCursor(
  db: Database,
  input: { streamKey: string; chainId: bigint; blockNumber: bigint; blockHash: string },
): Promise<void> {
  const existing = await getCursor(db, input.streamKey);
  if (existing && existing.lastProcessedBlock > input.blockNumber) {
    return;
  }
  await db
    .insert(indexCursors)
    .values({
      streamKey: input.streamKey,
      chainId: input.chainId,
      lastProcessedBlock: input.blockNumber,
      lastProcessedHash: input.blockHash,
    })
    .onConflictDoUpdate({
      target: indexCursors.streamKey,
      set: {
        chainId: input.chainId,
        lastProcessedBlock: input.blockNumber,
        lastProcessedHash: input.blockHash,
        updatedAt: new Date(),
      },
    });
}

/** Explicit rewind used by reorg handling. */
export async function rewindCursor(
  db: Database,
  streamKey: string,
  toBlock: bigint,
  toHash: string,
): Promise<void> {
  await db
    .update(indexCursors)
    .set({ lastProcessedBlock: toBlock, lastProcessedHash: toHash, updatedAt: new Date() })
    .where(eq(indexCursors.streamKey, streamKey));
}
