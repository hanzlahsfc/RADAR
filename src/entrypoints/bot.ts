import { loadContractsConfig } from '../config/contracts.js';
import { loadEnv } from '../config/env.js';
import { deriveNetworkConfig } from '../config/network.js';
import { createBot } from '../bot/create-bot.js';
import type { BotDependencies } from '../bot/context.js';
import { assertChainIdentity, createChainClient } from '../chain/client.js';
import { createRpcBlockProvider } from '../chain/rpc-block-provider.js';
import type { ChainReader } from '../chain/types.js';
import { createDatabase } from '../db/client.js';
import { createHttpServer } from '../http/server.js';
import { getCursor } from '../indexer/checkpoints.js';
import { systemClock } from '../shared/clock.js';
import { loadEnvFile } from '../shared/env-file.js';
import { ConfigError } from '../shared/errors.js';
import { createLogger } from '../shared/logger.js';
import type { FreshnessView } from '../bot/formatters/status.js';

export async function startBot(): Promise<void> {
  loadEnvFile();
  const env = loadEnv({ role: 'bot' });
  const logger = createLogger({ level: env.LOG_LEVEL, name: 'radar:bot' });

  if (!env.TELEGRAM_BOT_TOKEN || !env.DATABASE_URL) {
    throw new ConfigError('The bot requires TELEGRAM_BOT_TOKEN and DATABASE_URL.');
  }

  const network = deriveNetworkConfig(env);
  if (network) await assertChainIdentity(createChainClient(network), network.chainId);
  const contracts = loadContractsConfig(process.env.CONTRACTS_CONFIG);
  const database = createDatabase(env.DATABASE_URL, { applicationName: 'radar-bot' });

  let chain: ChainReader | undefined;
  if (network) {
    chain = createRpcBlockProvider(createChainClient(network), network);
  }

  const dependencies: BotDependencies = {
    db: database.db,
    env,
    network,
    contracts,
    logger,
    clock: systemClock,
    ...(chain ? { chain } : {}),
    ...(network
      ? {
          freshness: async (): Promise<FreshnessView> => {
            const cursor = await getCursor(database.db, `live:native:${network.chainId}`);
            let headBlock: bigint | null = null;
            let confirmedHead: bigint | null = null;
            let stale = false;
            try {
              headBlock = await chain!.getHead();
              confirmedHead = await chain!.getConfirmedHead();
            } catch (error) {
              stale = true;
              logger.warn({ err: error }, 'freshness probe failed; reporting stale state');
            }
            const lastProcessed = cursor?.lastProcessedBlock ?? null;
            const lagBlocks =
              confirmedHead !== null && lastProcessed !== null
                ? confirmedHead - lastProcessed
                : null;
            return {
              chainId: network.chainId,
              providerKind: network.historyProvider,
              configured: true,
              headBlock,
              confirmedHead,
              lastProcessedBlock: lastProcessed,
              lagBlocks,
              stale: stale || (lagBlocks !== null && lagBlocks > 50n),
            };
          },
        }
      : {}),
  };

  const bot = createBot({ token: env.TELEGRAM_BOT_TOKEN, dependencies });

  const app = createHttpServer({
    logger,
    db: database.db,
    ...(env.TELEGRAM_TRANSPORT === 'webhook' && env.TELEGRAM_WEBHOOK_SECRET
      ? {
          webhook: {
            secretToken: env.TELEGRAM_WEBHOOK_SECRET,
            onUpdate: async (update: unknown) => {
              await bot.handleUpdate(update as Parameters<typeof bot.handleUpdate>[0]);
            },
          },
        }
      : {}),
  });

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info({ port: env.PORT, transport: env.TELEGRAM_TRANSPORT }, 'bot http server listening');

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'graceful shutdown started');
    try {
      await bot.stop();
    } catch (error) {
      logger.warn({ err: error }, 'bot.stop failed during shutdown');
    }
    try {
      await app.close();
    } catch (error) {
      logger.warn({ err: error }, 'http server close failed during shutdown');
    }
    await database.close();
    logger.info('graceful shutdown complete');
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT').then(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM').then(() => process.exit(0));
  });

  if (env.TELEGRAM_TRANSPORT === 'webhook') {
    if (!env.PUBLIC_BASE_URL) {
      throw new ConfigError('PUBLIC_BASE_URL is required for webhook mode.');
    }
    await bot.api.setWebhook(`${env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/telegram/webhook`, {
      secret_token: env.TELEGRAM_WEBHOOK_SECRET ?? undefined,
    });
    logger.info('telegram webhook registered');
  } else {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    await bot.start({
      onStart: (info) => logger.info({ username: info.username }, 'bot started (polling)'),
    });
  }
}

async function main(): Promise<void> {
  try {
    await startBot();
  } catch (error) {
    const logger = createLogger({ level: 'error', name: 'radar:bot' });
    if (error instanceof ConfigError) {
      logger.error({ code: error.code, context: error.context }, error.message);
    } else {
      logger.error({ err: error }, 'bot failed to start');
    }
    process.exitCode = 1;
  }
}

const entry = process.argv[1]?.replace(/\\/g, '/') ?? '';
if (entry.endsWith('entrypoints/bot.ts') || entry.endsWith('entrypoints/bot.js')) {
  await main();
}
