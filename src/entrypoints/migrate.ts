import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { loadEnv } from '../config/env.js';
import { runMigrations } from '../db/client.js';
import { loadEnvFile } from '../shared/env-file.js';
import { ConfigError } from '../shared/errors.js';
import { createLogger } from '../shared/logger.js';

const MIGRATION_PATHS = [
  fileURLToPath(new URL('../../drizzle', import.meta.url)),
  fileURLToPath(new URL('../../../drizzle', import.meta.url)),
];

/** Resolve migrations from source in development or the compiled dist/src layout. */
export const MIGRATIONS_FOLDER =
  MIGRATION_PATHS.find((candidate) => existsSync(candidate)) ?? path.resolve(MIGRATION_PATHS[0]!);

async function main(): Promise<void> {
  loadEnvFile();
  const env = loadEnv({ role: 'migrate' });
  const logger = createLogger({ level: env.LOG_LEVEL, name: 'radar:migrate' });
  if (!env.DATABASE_URL) {
    throw new ConfigError('DATABASE_URL is required to run migrations.');
  }

  logger.info({ folder: MIGRATIONS_FOLDER }, 'applying database migrations');
  await runMigrations(env.DATABASE_URL, MIGRATIONS_FOLDER);
  logger.info('migrations applied successfully');
}

const entry = process.argv[1]?.replace(/\\/g, '/') ?? '';
if (entry.endsWith('entrypoints/migrate.ts') || entry.endsWith('entrypoints/migrate.js')) {
  void main().catch((error: unknown) => {
    const logger = createLogger({ level: 'error', name: 'radar:migrate' });
    if (error instanceof ConfigError) {
      logger.error({ code: error.code, context: error.context }, error.message);
    } else {
      logger.error({ err: error }, 'migration failed');
    }
    process.exitCode = 1;
  });
}

export { main as runMigrateEntrypoint };
