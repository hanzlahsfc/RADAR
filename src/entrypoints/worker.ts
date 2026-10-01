import { Bot } from 'grammy';
import { deliverPendingAlerts } from '../alerts/deliver.js';
import { createGrammySender } from '../bot/telegram-sender.js';
import { assertChainIdentity, createChainClient } from '../chain/client.js';
import { createHistoryProvider } from '../chain/history-provider.js';
import { createRpcBlockProvider } from '../chain/rpc-block-provider.js';
import { loadContractsConfig } from '../config/contracts.js';
import { loadEnv } from '../config/env.js';
import { deriveNetworkConfig } from '../config/network.js';
import { createDatabase } from '../db/client.js';
import { createHttpServer } from '../http/server.js';
import { Scheduler } from '../indexer/scheduler.js';
import { loadEnvFile } from '../shared/env-file.js';
import { ConfigError } from '../shared/errors.js';
import { createLogger } from '../shared/logger.js';
import {
  backfillTick,
  buildLiveStreamKey,
  liveTick,
  renderOutboxMessage,
  type WorkerContext,
} from './worker-runtime.js';

/**
 * Worker entry point: runs the live indexer, the backfill processor, and the
 * alert delivery loop, each on its own scheduler, with graceful shutdown.
 *
 * Missing live credentials (Telegram token, chain config) degrade gracefully:
 * the corresponding scheduler is simply not started, and the reason is logged.
 */
export async function startWorker(): Promise<void> {
  loadEnvFile();
  const env = loadEnv({ role: 'worker' });
  const logger = createLogger({ level: env.LOG_LEVEL, name: 'radar:worker' });
  if (!env.DATABASE_URL) {
    throw new ConfigError('DATABASE_URL is required to run the worker.');
  }

  const network = deriveNetworkConfig(env);
  if (network) await assertChainIdentity(createChainClient(network), network.chainId);
  const contracts = loadContractsConfig(process.env.CONTRACTS_CONFIG);
  const database = createDatabase(env.DATABASE_URL, { applicationName: 'radar-worker' });

  const chain = network ? createRpcBlockProvider(createChainClient(network), network) : null;
  let provider = null;
  if (network && network.historyProvider !== 'disabled') {
    try {
      provider = createHistoryProvider({ network, env });
    } catch (error) {
      logger.warn({ err: error }, 'history provider unavailable; backfill disabled');
    }
  }

  const context: WorkerContext = {
    env,
    logger,
    db: database.db,
    network,
    chain,
    provider,
    contracts,
  };

  const schedulers: Scheduler[] = [];

  if (chain) {
    schedulers.push(
      new Scheduler({
        name: 'live-indexer',
        intervalMs: env.POLL_INTERVAL_MS,
        logger,
        tick: () => liveTick(context),
      }),
    );
  } else {
    logger.warn('chain not configured; live indexing disabled (offline foundation mode)');
  }

  if (provider && chain) {
    schedulers.push(
      new Scheduler({
        name: 'backfill',
        intervalMs: Math.max(env.POLL_INTERVAL_MS, 2000),
        logger,
        tick: () => backfillTick(context),
      }),
    );
  }

  if (env.TELEGRAM_BOT_TOKEN) {
    const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
    const sender = createGrammySender(bot);
    schedulers.push(
      new Scheduler({
        name: 'alert-delivery',
        intervalMs: Math.max(env.POLL_INTERVAL_MS, 2000),
        logger,
        tick: async () => {
          await deliverPendingAlerts({
            db: database.db,
            sender,
            logger,
            renderMessage: (messageContext) =>
              renderOutboxMessage(database.db, network, messageContext),
          });
        },
      }),
    );
  } else {
    logger.warn('TELEGRAM_BOT_TOKEN not set; alert delivery disabled');
  }

  const app = createHttpServer({
    logger,
    db: database.db,
    readyChecks: [
      {
        name: 'schedulers',
        check: async () => {
          if (schedulers.length === 0) {
            throw new Error('no schedulers running');
          }
        },
      },
    ],
  });
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info(
    {
      port: env.PORT,
      stream: network ? buildLiveStreamKey(network) : null,
      schedulers: schedulers.length,
    },
    'worker started',
  );

  for (const scheduler of schedulers) {
    scheduler.start();
  }

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'worker graceful shutdown started');
    await Promise.allSettled(schedulers.map((scheduler) => scheduler.stop()));
    await app.close();
    await database.close();
    logger.info('worker graceful shutdown complete');
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT').then(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM').then(() => process.exit(0));
  });
}

async function main(): Promise<void> {
  try {
    await startWorker();
  } catch (error) {
    const logger = createLogger({ level: 'error', name: 'radar:worker' });
    if (error instanceof ConfigError) {
      logger.error({ code: error.code, context: error.context }, error.message);
    } else {
      logger.error({ err: error }, 'worker failed to start');
    }
    process.exitCode = 1;
  }
}

const entry = process.argv[1]?.replace(/\\/g, '/') ?? '';
if (entry.endsWith('entrypoints/worker.ts') || entry.endsWith('entrypoints/worker.js')) {
  await main();
}
