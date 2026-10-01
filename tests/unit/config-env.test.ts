import { describe, expect, it } from 'vitest';
import { loadEnv, redactedEnvSummary } from '../../src/config/env.js';
import { ConfigError } from '../../src/shared/errors.js';

const DB = 'postgresql://radar:radar@localhost:5433/radar';

function source(values: Record<string, string>): NodeJS.ProcessEnv {
  return { ...values } as NodeJS.ProcessEnv;
}

describe('environment configuration validation', () => {
  it('applies documented defaults', () => {
    const env = loadEnv({ role: 'migrate', source: source({ DATABASE_URL: DB }) });
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.TELEGRAM_TRANSPORT).toBe('polling');
    expect(env.HISTORY_PROVIDER).toBe('explorer');
    expect(env.POLL_INTERVAL_MS).toBe(5000);
    expect(env.MAX_WATCHES_PER_ACCOUNT).toBe(5);
    expect(env.MAX_BACKFILL_HOURS).toBe(72);
  });

  it('never defaults to a real network', () => {
    const env = loadEnv({ role: 'migrate', source: source({ DATABASE_URL: DB }) });
    expect(env.CHAIN_ID).toBeUndefined();
    expect(env.RPC_HTTP_URL).toBeUndefined();
  });

  it('requires a token for the bot role', () => {
    expect(() => loadEnv({ role: 'bot', source: source({ DATABASE_URL: DB }) })).toThrow(
      ConfigError,
    );
  });

  it('requires DATABASE_URL for the bot role', () => {
    expect(() => loadEnv({ role: 'bot', source: source({ TELEGRAM_BOT_TOKEN: 'x:y' }) })).toThrow(
      ConfigError,
    );
  });

  it('accepts a valid bot configuration', () => {
    const env = loadEnv({
      role: 'bot',
      source: source({ DATABASE_URL: DB, TELEGRAM_BOT_TOKEN: '123:abc' }),
    });
    expect(env.TELEGRAM_BOT_TOKEN).toBe('123:abc');
  });

  it('requires webhook secret and https public URL in webhook mode', () => {
    const base = {
      DATABASE_URL: DB,
      TELEGRAM_BOT_TOKEN: '123:abc',
      TELEGRAM_TRANSPORT: 'webhook',
    };
    expect(() => loadEnv({ role: 'bot', source: source(base) })).toThrow(ConfigError);
    expect(() =>
      loadEnv({
        role: 'bot',
        source: source({ ...base, TELEGRAM_WEBHOOK_SECRET: 's', PUBLIC_BASE_URL: 'http://x' }),
      }),
    ).toThrow(ConfigError);
    const ok = loadEnv({
      role: 'bot',
      source: source({ ...base, TELEGRAM_WEBHOOK_SECRET: 's', PUBLIC_BASE_URL: 'https://x' }),
    });
    expect(ok.TELEGRAM_TRANSPORT).toBe('webhook');
  });

  it('rejects CHAIN_ID without RPC_HTTP_URL and vice versa', () => {
    expect(() =>
      loadEnv({ role: 'worker', source: source({ DATABASE_URL: DB, CHAIN_ID: '4663' }) }),
    ).toThrow(ConfigError);
    expect(() =>
      loadEnv({
        role: 'worker',
        source: source({ DATABASE_URL: DB, RPC_HTTP_URL: 'https://rpc.example' }),
      }),
    ).toThrow(ConfigError);
  });

  it('validates FINALITY_MODE format', () => {
    expect(() =>
      loadEnv({
        role: 'migrate',
        source: source({ DATABASE_URL: DB, FINALITY_MODE: 'eventual' }),
      }),
    ).toThrow(ConfigError);
    const env = loadEnv({
      role: 'migrate',
      source: source({ DATABASE_URL: DB, FINALITY_MODE: 'depth:12' }),
    });
    expect(env.FINALITY_MODE).toBe('depth:12');
  });

  it('requires verified finality in production when a chain is configured', () => {
    expect(() =>
      loadEnv({
        role: 'worker',
        source: source({
          DATABASE_URL: DB,
          NODE_ENV: 'production',
          CHAIN_ID: '4663',
          RPC_HTTP_URL: 'https://rpc.example',
          EXPLORER_API_BASE_URL: 'https://explorer.example/api',
        }),
      }),
    ).toThrow(ConfigError);
  });

  it('requires the verify role to provide RPC access', () => {
    expect(() => loadEnv({ role: 'verify', source: source({}) })).toThrow(ConfigError);
    const env = loadEnv({
      role: 'verify',
      source: source({ CHAIN_ID: '4663', RPC_HTTP_URL: 'https://rpc.example' }),
    });
    expect(env.CHAIN_ID).toBe(4663);
  });

  it('redacts secrets in the summary', () => {
    const env = loadEnv({
      role: 'bot',
      source: source({ DATABASE_URL: DB, TELEGRAM_BOT_TOKEN: '123:supersecret' }),
    });
    const summary = redactedEnvSummary(env);
    expect(summary.telegramBotToken).toBe('[set]');
    expect(JSON.stringify(summary)).not.toContain('supersecret');
  });

  it('reports actionable problems', () => {
    try {
      loadEnv({ role: 'bot', source: source({}) });
      throw new Error('expected ConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const problems = (error as ConfigError).context?.problems as string[];
      expect(problems.join(' ')).toContain('TELEGRAM_BOT_TOKEN');
      expect(problems.join(' ')).toContain('DATABASE_URL');
    }
  });
});
