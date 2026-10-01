import { bigint, index, jsonb, pgTable, timestamp } from 'drizzle-orm/pg-core';

/**
 * Deduplication of processed Telegram updates. `update_id` is the primary key,
 * so a redelivered update is processed at most once.
 */
export const processedTelegramUpdates = pgTable('processed_telegram_updates', {
  updateId: bigint('update_id', { mode: 'bigint' }).primaryKey(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Durable webhook inbox: an accepted update is persisted BEFORE it is
 * acknowledged, so updates cannot be lost between ack and processing.
 * Retention for `payload` is bounded by a maintenance job (see RUNBOOK).
 */
export const telegramUpdateInbox = pgTable(
  'telegram_update_inbox',
  {
    updateId: bigint('update_id', { mode: 'bigint' }).primaryKey(),
    payload: jsonb('payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [index('telegram_update_inbox_unprocessed_idx').on(table.processedAt)],
);

export type TelegramUpdateInboxRow = typeof telegramUpdateInbox.$inferSelect;
