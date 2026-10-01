import { sql } from 'drizzle-orm';
import { createDatabase, type DatabaseHandle } from '../../src/db/client.js';

/** Real PostgreSQL is required for integration tests (never an in-memory fake). */
export function integrationDatabaseUrl(): string {
  return (
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://radar:radar@localhost:5433/radar'
  );
}

export async function connectTestDatabase(): Promise<DatabaseHandle> {
  return createDatabase(integrationDatabaseUrl(), { max: 5, applicationName: 'radar-test' });
}

const TABLES_IN_DEPENDENCY_ORDER = [
  'delivery_attempts',
  'alert_outbox',
  'alert_rules',
  'backfill_coverage',
  'backfill_jobs',
  'processed_telegram_updates',
  'telegram_update_inbox',
  'events',
  'index_cursors',
  'indexed_blocks',
  'token_metadata',
  'watched_wallets',
  'accounts',
];

export async function truncateAll(handle: DatabaseHandle): Promise<void> {
  await handle.db.execute(
    sql.raw(`truncate table ${TABLES_IN_DEPENDENCY_ORDER.join(', ')} restart identity cascade`),
  );
}

/** Convenience: create an account directly through the repository layer. */
export async function createTestAccount(
  handle: DatabaseHandle,
  telegramUserId: bigint,
): Promise<{ id: string }> {
  const { upsertAccountByTelegramUser } = await import('../../src/db/repositories/accounts.js');
  const account = await upsertAccountByTelegramUser(handle.db, {
    telegramUserId,
    telegramChatId: telegramUserId,
  });
  return { id: account.id };
}

export const TEST_CHAIN_ID = 4663n;
