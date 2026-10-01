import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql as rawSql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Database = PostgresJsDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  sql: postgres.Sql;
  close(): Promise<void>;
}

export interface CreateDatabaseOptions {
  max?: number;
  idleTimeoutSeconds?: number;
  applicationName?: string;
}

/**
 * Create a PostgreSQL connection pool + Drizzle client.
 * The client is not connected until the first query (lazy), so constructing it
 * is safe in entry points that validate configuration before doing I/O.
 */
export function createDatabase(dbUrl: string, options: CreateDatabaseOptions = {}): DatabaseHandle {
  const sql = postgres(dbUrl, {
    max: options.max ?? 10,
    idle_timeout: options.idleTimeoutSeconds ?? 20,
    connect_timeout: 10,
    onnotice: () => undefined,
    connection: { application_name: options.applicationName ?? 'radar' },
  });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}

/** Lightweight readiness probe used by health endpoints. */
export async function pingDatabase(db: Database): Promise<void> {
  await db.execute(rawSql`select 1`);
}

/** Apply committed SQL migrations from `migrationsFolder` (idempotent). */
export async function runMigrations(databaseUrl: string, migrationsFolder: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  try {
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export { schema };
