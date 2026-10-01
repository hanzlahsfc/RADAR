import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  numeric,
  unique,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { watchedWallets } from './watched-wallets.js';

/**
 * Alert rules attach to a watch.
 *  - kind:      eth_native | erc20_transfer | token_launch
 *  - direction: in | out | both
 * Thresholds are stored as exact base-unit integers (numeric(78,0)); wei for ETH.
 */
export const alertRules = pgTable(
  'alert_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    watchId: uuid('watch_id')
      .notNull()
      .references(() => watchedWallets.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    tokenAddress: text('token_address'),
    direction: text('direction').notNull().default('both'),
    thresholdRaw: numeric('threshold_raw', { precision: 78, scale: 0 }),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('alert_rules_id_watch_key').on(table.id, table.watchId),
    index('alert_rules_watch_idx').on(table.watchId),
    index('alert_rules_enabled_idx')
      .on(table.kind)
      .where(sql`${table.enabled} = true`),
    check(
      'alert_rules_kind_check',
      sql`${table.kind} IN ('eth_native','erc20_transfer','token_launch')`,
    ),
    check('alert_rules_direction_check', sql`${table.direction} IN ('in','out','both')`),
  ],
);

export type AlertRuleRow = typeof alertRules.$inferSelect;
