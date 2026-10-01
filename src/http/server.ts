import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { pingDatabase, type Database } from '../db/client.js';

export interface ReadyCheck {
  name: string;
  check: () => Promise<void>;
}

export interface WebhookHandler {
  /** Telegram update payload. */
  secretToken: string;
  /** Path to mount the webhook on (default /telegram/webhook). */
  path?: string;
  onUpdate: (update: unknown) => Promise<void>;
}

export interface HttpServerOptions {
  logger: Logger;
  db?: Database;
  /** Extra readiness checks beyond the database ping. */
  readyChecks?: ReadyCheck[];
  /** When present, a validated Telegram webhook route is mounted. */
  webhook?: WebhookHandler;
}

export const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';

export function createHttpServer(options: HttpServerOptions): FastifyInstance {
  const app = Fastify({
    loggerInstance: options.logger as unknown as FastifyBaseLogger,
    disableRequestLogging: true,
  });

  app.get('/health/live', async () => ({ status: 'ok' }));

  app.get('/health/ready', async (_request, reply) => {
    const checks: ReadyCheck[] = [
      ...(options.db
        ? [
            {
              name: 'database',
              check: async () => {
                await pingDatabase(options.db as Database);
              },
            },
          ]
        : []),
      ...(options.readyChecks ?? []),
    ];

    const failures: string[] = [];
    for (const check of checks) {
      try {
        await check.check();
      } catch {
        failures.push(check.name);
      }
    }

    if (failures.length > 0) {
      return reply.code(503).send({ status: 'unavailable', failed: failures });
    }
    return { status: 'ready', checks: checks.map((check) => check.name) };
  });

  const webhook = options.webhook;
  if (webhook) {
    const path = webhook.path ?? '/telegram/webhook';
    app.post(path, async (request, reply) => {
      const provided = request.headers[TELEGRAM_SECRET_HEADER];
      if (typeof provided !== 'string' || provided !== webhook.secretToken) {
        return reply.code(401).send({ ok: false });
      }
      // Acknowledge only after the update is durably accepted by the handler.
      await webhook.onUpdate(request.body);
      return reply.code(200).send({ ok: true });
    });
  }

  return app;
}
