import { bigint, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Explicit, verified coverage intervals per address. The timeline renders
 * "no activity found in a fully indexed interval" only when this table covers
 * the whole requested window; otherwise it reports incomplete coverage.
 */
export const backfillCoverage = pgTable(
  'backfill_coverage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chainId: bigint('chain_id', { mode: 'bigint' }).notNull(),
    address: text('address').notNull(),
    rangeStart: timestamp('range_start', { withTimezone: true }).notNull(),
    rangeEnd: timestamp('range_end', { withTimezone: true }).notNull(),
    /** Which provider/stream produced this coverage: explorer | rpc. */
    source: text('source').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('backfill_coverage_address_idx').on(table.chainId, table.address)],
);

export type BackfillCoverageRow = typeof backfillCoverage.$inferSelect;
