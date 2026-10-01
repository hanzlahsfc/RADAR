import { z } from 'zod';
import { ConfigError } from '../shared/errors.js';

export type ProcessRole = 'bot' | 'worker' | 'migrate' | 'verify';
export type NodeEnvironment = 'development' | 'test' | 'production';
export type TelegramTransport = 'polling' | 'webhook';
export type HistoryProviderKind = 'explorer' | 'rpc' | 'disabled';

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalNonEmpty = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const urlLike = z.string().refine(
  (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'must be a valid URL' },
);

const optionalUrl = z.preprocess(emptyToUndefined, urlLike.optional());

/**
 * FINALITY_MODE is one of the documented block tags or an explicit depth.
 * Format is validated here; *semantics* must be confirmed per network in Phase 0.
 */
const finalityMode = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .refine(
      (value) =>
        value === 'latest' ||
        value === 'safe' ||
        value === 'finalized' ||
        /^depth:\d+$/.test(value),
      { message: 'must be latest | safe | finalized | depth:<n>' },
    )
    .optional(),
);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .url()
      .refine((value) => /^postgres(ql)?:\/\//.test(value), 'must be a PostgreSQL URL')
      .optional(),
  ),

  TELEGRAM_BOT_TOKEN: optionalNonEmpty,
  TELEGRAM_TRANSPORT: z.enum(['polling', 'webhook']).default('polling'),
  TELEGRAM_WEBHOOK_SECRET: optionalNonEmpty,
  TELEGRAM_DEV_TEST_CHAT_ID: optionalNonEmpty,
  PUBLIC_BASE_URL: optionalUrl,
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  CHAIN_ID: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  RPC_HTTP_URL: optionalUrl,
  EXPLORER_BASE_URL: optionalUrl,
  EXPLORER_API_BASE_URL: optionalUrl,
  EXPLORER_API_KEY: optionalNonEmpty,

  HISTORY_PROVIDER: z.enum(['explorer', 'rpc', 'disabled']).default('explorer'),
  FINALITY_VERIFIED: z.enum(['true', 'false']).default('false'),
  FINALITY_MODE: finalityMode,
  CONFIRMATION_DEPTH: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional()),

  POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(5000),
  INITIAL_BLOCK_BATCH_SIZE: z.coerce.number().int().min(1).max(10_000).default(100),
  MAX_BACKFILL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(72),
  MAX_WATCHES_PER_ACCOUNT: z.coerce.number().int().min(1).max(5).default(5),
});

export type Env = z.infer<typeof envSchema>;

export interface LoadEnvOptions {
  role: ProcessRole;
  /** Defaults to process.env; injectable for tests. */
  source?: NodeJS.ProcessEnv;
}

/**
 * Parse and validate environment variables, then apply role-specific rules.
 * Throws ConfigError with actionable messages. Never defaults to a real network.
 */
export function loadEnv(options: LoadEnvOptions): Env {
  const source = options.source ?? process.env;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigError('Invalid environment configuration', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    });
  }
  const env = parsed.data;
  validateForRole(env, options.role);
  if (options.role !== 'migrate') validateChainConsistency(env);
  return env;
}

function validateForRole(env: Env, role: ProcessRole): void {
  const problems: string[] = [];

  switch (role) {
    case 'bot':
      if (!env.TELEGRAM_BOT_TOKEN) {
        problems.push('TELEGRAM_BOT_TOKEN is required to run the bot (get one from @BotFather).');
      }
      if (!env.DATABASE_URL) {
        problems.push(
          'DATABASE_URL is required to run the bot (accounts and watches are persisted).',
        );
      }
      if (env.TELEGRAM_TRANSPORT === 'webhook') {
        if (!env.TELEGRAM_WEBHOOK_SECRET) {
          problems.push('TELEGRAM_WEBHOOK_SECRET is required when TELEGRAM_TRANSPORT=webhook.');
        }
        if (!env.PUBLIC_BASE_URL) {
          problems.push('PUBLIC_BASE_URL is required when TELEGRAM_TRANSPORT=webhook.');
        } else if (!env.PUBLIC_BASE_URL.startsWith('https://')) {
          problems.push('PUBLIC_BASE_URL must use https:// for Telegram webhooks.');
        }
      }
      break;
    case 'worker':
    case 'migrate':
      if (!env.DATABASE_URL) {
        problems.push('DATABASE_URL is required for this process.');
      }
      break;
    case 'verify':
      if (!env.RPC_HTTP_URL) {
        problems.push('RPC_HTTP_URL is required to verify network connectivity (read-only).');
      }
      if (!env.CHAIN_ID) {
        problems.push('CHAIN_ID is required to verify network connectivity.');
      }
      break;
  }

  if (
    (role === 'bot' || role === 'worker') &&
    env.HISTORY_PROVIDER === 'explorer' &&
    Boolean(env.CHAIN_ID) &&
    Boolean(env.RPC_HTTP_URL) &&
    !env.EXPLORER_API_BASE_URL &&
    !env.EXPLORER_BASE_URL
  ) {
    problems.push(
      'HISTORY_PROVIDER=explorer requires EXPLORER_API_BASE_URL or EXPLORER_BASE_URL for historical activity.',
    );
  }

  const chainEnabled = Boolean(env.CHAIN_ID) && Boolean(env.RPC_HTTP_URL);
  if (
    chainEnabled &&
    (role === 'bot' || role === 'worker') &&
    (!env.FINALITY_MODE || env.FINALITY_VERIFIED !== 'true')
  ) {
    problems.push(
      'Live mode requires FINALITY_MODE and FINALITY_VERIFIED=true after documenting provider and finality evidence in docs/NETWORK_VERIFICATION.md.',
    );
  }
  if (
    (role === 'bot' || role === 'worker') &&
    !chainEnabled &&
    env.HISTORY_PROVIDER !== 'disabled' &&
    env.NODE_ENV === 'production'
  ) {
    problems.push(
      'Set HISTORY_PROVIDER=disabled when no chain is configured, or provide CHAIN_ID and RPC_HTTP_URL.',
    );
  }

  if (problems.length > 0) {
    throw new ConfigError(`Invalid configuration for role "${role}"`, { problems });
  }
}

function validateChainConsistency(env: Env): void {
  const problems: string[] = [];
  const chainEnabled = Boolean(env.CHAIN_ID) || Boolean(env.RPC_HTTP_URL);
  if (chainEnabled) {
    if (!env.CHAIN_ID) problems.push('CHAIN_ID must be set when RPC_HTTP_URL is provided.');
    if (!env.RPC_HTTP_URL) problems.push('RPC_HTTP_URL must be set when CHAIN_ID is provided.');
  }
  if (env.FINALITY_MODE?.startsWith('depth:')) {
    const depth = Number(env.FINALITY_MODE.slice('depth:'.length));
    if (!Number.isInteger(depth) || depth < 0) {
      problems.push('FINALITY_MODE depth:<n> requires a non-negative integer.');
    }
  }
  if (problems.length > 0) {
    throw new ConfigError('Inconsistent chain configuration', { problems });
  }
}

/** Safe, redacted view of configuration for logging and `verify` output. */
export function redactedEnvSummary(env: Env): Record<string, unknown> {
  return {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    port: env.PORT,
    telegramTransport: env.TELEGRAM_TRANSPORT,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN ? '[set]' : '[unset]',
    telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET ? '[set]' : '[unset]',
    databaseUrl: env.DATABASE_URL ? '[set]' : '[unset]',
    chainId: env.CHAIN_ID ?? '[unset]',
    rpcHttpUrl: env.RPC_HTTP_URL ? '[set]' : '[unset]',
    explorerApiBaseUrl: env.EXPLORER_API_BASE_URL ? '[set]' : '[unset]',
    explorerApiKey: env.EXPLORER_API_KEY ? '[set]' : '[unset]',
    historyProvider: env.HISTORY_PROVIDER,
    finalityMode: env.FINALITY_MODE ?? '[unset]',
    confirmationDepth: env.CONFIRMATION_DEPTH ?? '[unset]',
    maxWatchesPerAccount: env.MAX_WATCHES_PER_ACCOUNT,
    maxBackfillHours: env.MAX_BACKFILL_HOURS,
  };
}
