import { bigint, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * A Telegram user. Telegram IDs are stored as bigint (never truncated).
 * Accounts are soft-deleted (`deleted_at`) so deliveries can be cancelled first.
 */
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  telegramUserId: bigint('telegram_user_id', { mode: 'bigint' }).notNull().unique(),
  telegramChatId: bigint('telegram_chat_id', { mode: 'bigint' }).notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type AccountRow = typeof accounts.$inferSelect;
export type NewAccountRow = typeof accounts.$inferInsert;
