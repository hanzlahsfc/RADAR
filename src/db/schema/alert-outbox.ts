import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';
import { alertRules } from './alert-rules.js';
import { events } from './events.js';
import { watchedWallets } from './watched-wallets.js';

/**
 * Durable delivery outbox. `unique(rule_id, event_id)` makes alert creation
 * idempotent: replaying the same event/rule pair cannot create a second alert.
 */
export const alertOutbox = pgTable(
  'alert_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    watchId: uuid('watch_id')
      .notNull()
      .references(() => watchedWallets.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => alertRules.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** pending | sending | sent | failed | cancelled */
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    telegramMessageId: bigint('telegram_message_id', { mode: 'bigint' }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [
    unique('alert_outbox_rule_event_key').on(table.ruleId, table.eventId),
    foreignKey({
      name: 'alert_outbox_watch_account_fk',
      columns: [table.watchId, table.accountId],
      foreignColumns: [watchedWallets.id, watchedWallets.accountId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'alert_outbox_rule_watch_fk',
      columns: [table.ruleId, table.watchId],
      foreignColumns: [alertRules.id, alertRules.watchId],
    }).onDelete('cascade'),
    index('alert_outbox_claim_idx').on(table.status, table.availableAt),
    index('alert_outbox_account_idx').on(table.accountId),
    index('alert_outbox_watch_idx').on(table.watchId),
    check(
      'alert_outbox_status_check',
      sql`${table.status} IN ('pending','sending','sent','failed','cancelled')`,
    ),
  ],
);

export type AlertOutboxRow = typeof alertOutbox.$inferSelect;
