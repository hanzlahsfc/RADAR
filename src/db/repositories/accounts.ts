import { eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { accounts, type AccountRow } from '../schema/index.js';

export type AccountRecord = AccountRow;

export interface UpsertAccountInput {
  telegramUserId: bigint;
  telegramChatId: bigint;
  timezone?: string;
}

/**
 * Create or refresh the account for a Telegram user. Repeated `/start` calls
 * are idempotent; the chat id is updated in case the user moved to a new chat.
 */
export async function upsertAccountByTelegramUser(
  db: Database,
  input: UpsertAccountInput,
): Promise<AccountRecord> {
  const [row] = await db
    .insert(accounts)
    .values({
      telegramUserId: input.telegramUserId,
      telegramChatId: input.telegramChatId,
      ...(input.timezone ? { timezone: input.timezone } : {}),
    })
    .onConflictDoUpdate({
      target: accounts.telegramUserId,
      set: { telegramChatId: input.telegramChatId, deletedAt: null },
    })
    .returning();
  if (!row) {
    throw new Error('Failed to upsert account');
  }
  return row;
}

export async function findAccountByTelegramUserId(
  db: Database,
  telegramUserId: bigint,
): Promise<AccountRecord | null> {
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.telegramUserId, telegramUserId))
    .limit(1);
  return rows[0] ?? null;
}

export async function setAccountTimezone(
  db: Database,
  accountId: string,
  timezone: string,
): Promise<void> {
  await db.update(accounts).set({ timezone }).where(eq(accounts.id, accountId));
}

/**
 * Permanently remove an account and all account-specific data. Relies on
 * ON DELETE CASCADE for watches, rules, outbox rows, and delivery attempts.
 */
export async function deleteAccount(db: Database, accountId: string): Promise<void> {
  await db.delete(accounts).where(eq(accounts.id, accountId));
}

/** Row-level lock used to serialize watch-limit checks for one account. */
export async function lockAccount(db: Database, accountId: string): Promise<void> {
  await db.execute(sql`select id from ${accounts} where ${accounts.id} = ${accountId} for update`);
}
