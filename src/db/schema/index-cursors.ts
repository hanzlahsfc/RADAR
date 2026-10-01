import { bigint, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Per-stream indexing progress. Streams are kept separate (e.g. "native",
 * "erc20", "launch") so a failure in one cannot falsely advance another's
 * coverage. `stream_key` is the primary key, so cursors are unique per stream.
 */
export const indexCursors = pgTable(
  'index_cursors',
  {
    streamKey: text('stream_key').primaryKey(),
    chainId: bigint('chain_id', { mode: 'bigint' }).notNull(),
    lastProcessedBlock: bigint('last_processed_block', { mode: 'bigint' }).notNull(),
    lastProcessedHash: text('last_processed_hash').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('index_cursors_chain_idx').on(table.chainId)],
);

export type IndexCursorRow = typeof indexCursors.$inferSelect;
