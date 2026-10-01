import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * One row per observed block hash. A partial unique index guarantees at most one
 * canonical hash per (chain_id, block_number), which is the backbone of reorg
 * detection: two canonical rows for the same height would be contradictory.
 */
export const indexedBlocks = pgTable(
  'indexed_blocks',
  {
    chainId: bigint('chain_id', { mode: 'bigint' }).notNull(),
    blockNumber: bigint('block_number', { mode: 'bigint' }).notNull(),
    blockHash: text('block_hash').notNull(),
    parentHash: text('parent_hash').notNull(),
    blockTimestamp: timestamp('block_timestamp', { withTimezone: true }).notNull(),
    canonical: boolean('canonical').notNull().default(true),
  },
  (table) => [
    primaryKey({ columns: [table.chainId, table.blockHash] }),
    uniqueIndex('indexed_blocks_canonical_number_key')
      .on(table.chainId, table.blockNumber)
      .where(sql`${table.canonical} = true`),
    index('indexed_blocks_number_idx').on(table.chainId, table.blockNumber),
  ],
);

export type IndexedBlockRow = typeof indexedBlocks.$inferSelect;
