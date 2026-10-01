import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';

/**
 * A watched public address belonging to an account on a specific chain.
 *
 * State is modeled explicitly and unambiguously:
 *   - active:      removed_at IS NULL AND active = true
 *   - paused:      removed_at IS NULL AND active = false
 *   - removed:     removed_at IS NOT NULL (active is forced to false by a check)
 *
 * The unique constraint lets `/watch` be idempotent (re-watching reactivates the
 * existing row) while still preventing duplicate watches.
 */
export const watchedWallets = pgTable(
  'watched_wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    chainId: bigint('chain_id', { mode: 'bigint' }).notNull(),
    address: text('address').notNull(),
    label: text('label'),
    active: boolean('active').notNull().default(true),
    alertStartBlock: bigint('alert_start_block', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (table) => [
    unique('watched_wallets_id_account_key').on(table.id, table.accountId),
    unique('watched_wallets_account_chain_address_key').on(
      table.accountId,
      table.chainId,
      table.address,
    ),
    index('watched_wallets_account_idx').on(table.accountId),
    index('watched_wallets_active_scan_idx')
      .on(table.chainId, table.address)
      .where(sql`${table.active} = true AND ${table.removedAt} IS NULL`),
    check(
      'watched_wallets_removed_inactive',
      sql`${table.removedAt} IS NULL OR ${table.active} = false`,
    ),
  ],
);

export type WatchedWalletRow = typeof watchedWallets.$inferSelect;
export type NewWatchedWalletRow = typeof watchedWallets.$inferInsert;
