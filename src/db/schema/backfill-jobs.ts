import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * A bounded historical request for one address. Jobs are claimed with a lease
 * (`lease_until`) so a crashed worker is recovered after the lease expires.
 *
 * `coverage_ranges` records the explicit intervals that were successfully
 * processed. An empty result is NOT evidence that a range was fully indexed, so
 * coverage is only written after the range completes.
 */
export const backfillJobs = pgTable(
  'backfill_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chainId: bigint('chain_id', { mode: 'bigint' }).notNull(),
    address: text('address').notNull(),
    fromTimestamp: timestamp('from_timestamp', { withTimezone: true }).notNull(),
    toTimestamp: timestamp('to_timestamp', { withTimezone: true }).notNull(),
    providerCursor: text('provider_cursor'),
    /** pending | running | completed | failed | cancelled */
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    lastError: text('last_error'),
    coverageRanges: jsonb('coverage_ranges')
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('backfill_jobs_claim_idx').on(table.status, table.availableAt),
    index('backfill_jobs_address_idx').on(table.chainId, table.address),
    check(
      'backfill_jobs_status_check',
      sql`${table.status} IN ('pending','running','completed','failed','cancelled')`,
    ),
    check('backfill_jobs_window_check', sql`${table.toTimestamp} >= ${table.fromTimestamp}`),
  ],
);

export type BackfillJobRow = typeof backfillJobs.$inferSelect;
