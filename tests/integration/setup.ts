import { fileURLToPath } from 'node:url';
import { beforeAll } from 'vitest';
import { runMigrations } from '../../src/db/client.js';
import { integrationDatabaseUrl } from './harness.js';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * Integration tests run against a REAL PostgreSQL database. Migrations are
 * applied once per test file (idempotent via Drizzle's journal).
 */
beforeAll(async () => {
  await runMigrations(integrationDatabaseUrl(), MIGRATIONS_FOLDER);
}, 60_000);
