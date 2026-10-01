import { pino, type Logger, type LoggerOptions } from 'pino';

/**
 * Keys whose values must never reach logs. Extended defensively so that
 * accidental structured logging of config objects cannot leak secrets.
 */
export const REDACT_KEYS = [
  'token',
  'botToken',
  'telegramBotToken',
  'webhookSecret',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'EXPLORER_API_KEY',
  'apiKey',
  'authorization',
  'DATABASE_URL',
  'databaseUrl',
  'rpcHttpUrl',
  'RPC_HTTP_URL',
  'privateKey',
  'mnemonic',
  'seedPhrase',
] as const;

export const REDACT_PATHS: string[] = REDACT_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]);

export interface CreateLoggerOptions {
  level: string;
  /** Pretty-print (dev only). Defaults to enabled when NODE_ENV !== production. */
  pretty?: boolean;
  name?: string;
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const isProd = process.env.NODE_ENV === 'production';
  const usePretty = options.pretty ?? !isProd;

  const base: LoggerOptions = {
    level: options.level,
    name: options.name ?? 'radar',
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (!usePretty) {
    return pino(base);
  }

  try {
    // pino-pretty is a dev dependency; production uses plain JSON output.
    return pino({
      ...base,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      },
    });
  } catch {
    return pino(base);
  }
}

/**
 * Remove credentials embedded in URLs (e.g. postgres://user:pass@host).
 * Returns a string safe to log or display.
 */
export function redactUrl(input: string): string {
  try {
    const url = new URL(input);
    if (url.username || url.password) {
      url.username = url.username ? '[redacted]' : '';
      url.password = url.password ? '[redacted]' : '';
    }
    for (const param of ['key', 'apikey', 'api_key', 'token', 'secret']) {
      if (url.searchParams.has(param)) {
        url.searchParams.set(param, '[redacted]');
      }
    }
    return url.toString();
  } catch {
    // Not a URL we can parse; avoid returning something that might contain a secret.
    return '[unparseable-url]';
  }
}

/** Redact the middle of a token for safe logging (e.g. bot1234…cdef). */
export function redactToken(token: string | undefined): string {
  if (!token) return '[none]';
  if (token.length <= 8) return '[redacted]';
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}
