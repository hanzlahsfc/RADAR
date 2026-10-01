import { and, eq } from 'drizzle-orm';
import { cancelUnsentAlerts } from '../alerts/outbox.js';
import type { Database } from '../db/client.js';
import { events, indexedBlocks } from '../db/schema/index.js';
import type { NormalizedBlock } from '../chain/types.js';

export interface ReorgOutcome {
  reorgDetected: boolean;
  /** Heights whose canonical rows were replaced. */
  orphanedBlockNumbers: bigint[];
  /** Event ids marked orphaned (their unsent alerts are cancelled). */
  orphanedEventIds: string[];
}

export interface RecordCanonicalOptions {
  /** How far back to follow parent-hash disagreements before reporting degraded. */
  maxForkDepth?: number;
}

/**
 * Record a block as canonical, detecting conflicts against stored state.
 *
 * If a different canonical hash already exists at the same height, that block
 * and its events are orphaned and unsafe alerts are cancelled. Parent-hash
 * linkage is then checked backwards within `maxForkDepth` so a deeper fork is
 * surfaced rather than silently accepted.
 *
 * `forkExceedsWindow` is true when the walk-back limit is reached; callers
 * should stop the stream and report degraded status instead of guessing.
 */
export async function recordCanonicalBlock(
  db: Database,
  chainId: bigint,
  block: NormalizedBlock,
  options: RecordCanonicalOptions = {},
): Promise<ReorgOutcome & { forkExceedsWindow: boolean }> {
  const maxForkDepth = options.maxForkDepth ?? 64;
  const orphanedBlockNumbers: bigint[] = [];
  const orphanedEventIds: string[] = [];
  let reorgDetected = false;

  const existing = await db
    .select()
    .from(indexedBlocks)
    .where(
      and(
        eq(indexedBlocks.chainId, chainId),
        eq(indexedBlocks.blockNumber, block.number),
        eq(indexedBlocks.canonical, true),
      ),
    )
    .limit(1);

  const previous = existing[0];
  if (previous && previous.blockHash.toLowerCase() === block.hash.toLowerCase()) {
    return {
      reorgDetected: false,
      orphanedBlockNumbers,
      orphanedEventIds,
      forkExceedsWindow: false,
    };
  }

  if (previous) {
    reorgDetected = true;
    const orphaned = await orphanBlock(db, chainId, previous.blockHash, previous.blockNumber);
    orphanedBlockNumbers.push(previous.blockNumber);
    orphanedEventIds.push(...orphaned);
  }

  await db
    .insert(indexedBlocks)
    .values({
      chainId,
      blockNumber: block.number,
      blockHash: block.hash,
      parentHash: block.parentHash,
      blockTimestamp: block.timestamp,
      canonical: true,
    })
    .onConflictDoUpdate({
      target: [indexedBlocks.chainId, indexedBlocks.blockHash],
      set: {
        blockNumber: block.number,
        parentHash: block.parentHash,
        blockTimestamp: block.timestamp,
        canonical: true,
      },
    });

  // Follow parent-hash disagreements backwards within the retained window.
  let forkExceedsWindow = false;
  let cursorParentHash: string = block.parentHash;
  let cursorNumber = block.number - 1n;
  for (let depth = 0; depth < maxForkDepth && cursorNumber >= 0n; depth += 1) {
    const parentRows = await db
      .select()
      .from(indexedBlocks)
      .where(
        and(
          eq(indexedBlocks.chainId, chainId),
          eq(indexedBlocks.blockNumber, cursorNumber),
          eq(indexedBlocks.canonical, true),
        ),
      )
      .limit(1);
    const parent = parentRows[0];
    if (!parent) {
      break; // We simply have not indexed that height yet.
    }
    if (parent.blockHash.toLowerCase() === cursorParentHash.toLowerCase()) {
      break; // Chain links up correctly.
    }
    reorgDetected = true;
    const orphaned = await orphanBlock(db, chainId, parent.blockHash, parent.blockNumber);
    orphanedBlockNumbers.push(parent.blockNumber);
    orphanedEventIds.push(...orphaned);
    cursorParentHash = parent.parentHash;
    cursorNumber = parent.blockNumber - 1n;
    if (depth === maxForkDepth - 1) {
      forkExceedsWindow = true;
    }
  }

  if (orphanedEventIds.length > 0) {
    await cancelUnsentAlerts(db, { eventIds: orphanedEventIds });
  }

  return { reorgDetected, orphanedBlockNumbers, orphanedEventIds, forkExceedsWindow };
}

async function orphanBlock(
  db: Database,
  chainId: bigint,
  blockHash: string,
  blockNumber: bigint,
): Promise<string[]> {
  await db
    .update(indexedBlocks)
    .set({ canonical: false })
    .where(and(eq(indexedBlocks.chainId, chainId), eq(indexedBlocks.blockHash, blockHash)));

  const orphaned = await db
    .update(events)
    .set({ canonical: false, confirmationStatus: 'orphaned' })
    .where(and(eq(events.chainId, chainId), eq(events.blockHash, blockHash)))
    .returning({ id: events.id });

  void blockNumber;
  return orphaned.map((row) => row.id);
}

/** Look up stored canonical hashes for a list of heights, oldest first. */
export async function getCanonicalWindow(
  db: Database,
  chainId: bigint,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Array<{ blockNumber: bigint; blockHash: string; parentHash: string }>> {
  const rows = await db
    .select({
      blockNumber: indexedBlocks.blockNumber,
      blockHash: indexedBlocks.blockHash,
      parentHash: indexedBlocks.parentHash,
    })
    .from(indexedBlocks)
    .where(and(eq(indexedBlocks.chainId, chainId), eq(indexedBlocks.canonical, true)));
  return rows
    .filter((row) => row.blockNumber >= fromBlock && row.blockNumber <= toBlock)
    .sort((a, b) => (a.blockNumber < b.blockNumber ? -1 : 1));
}
