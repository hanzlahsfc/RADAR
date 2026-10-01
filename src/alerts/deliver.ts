import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { Database } from '../db/client.js';
import { accounts, alertOutbox, watchedWallets, type AlertOutboxRow } from '../db/schema/index.js';
import { computeBackoff } from '../shared/retry.js';
import {
  claimOutboxRows,
  markPermanentFailure,
  markRetryable,
  markSent,
  recordDeliveryAttempt,
} from './outbox.js';

export interface TelegramSender {
  sendMessage(chatId: bigint, html: string): Promise<bigint>;
}

export class TelegramSendError extends Error {
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | undefined;
  readonly blocked: boolean;

  constructor(
    message: string,
    options: { retryable: boolean; retryAfterSeconds?: number; blocked?: boolean },
  ) {
    super(message);
    this.name = 'TelegramSendError';
    this.retryable = options.retryable;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.blocked = options.blocked ?? false;
  }
}

export interface MessageContext {
  outbox: AlertOutboxRow;
  chatId: bigint;
}

export interface DeliverOptions {
  db: Database;
  sender: TelegramSender;
  logger: Logger;
  renderMessage: (context: MessageContext) => string | Promise<string>;
  batchSize?: number;
  leaseMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: number;
}

export interface DeliverResult {
  sent: number;
  failed: number;
  cancelled: number;
}

interface ErrorClassification {
  retryable: boolean;
  sanitized: string;
  outcome: string;
  retryClassification: string;
  retryAfterSeconds?: number;
}

function classifyDeliveryError(error: unknown): ErrorClassification {
  if (error instanceof TelegramSendError) {
    if (error.blocked || !error.retryable) {
      return {
        retryable: false,
        sanitized: error.message,
        outcome: 'permanent_failure',
        retryClassification: error.blocked ? 'blocked' : 'permanent',
      };
    }
    if (error.retryAfterSeconds !== undefined) {
      return {
        retryable: true,
        sanitized: error.message,
        outcome: 'rate_limited',
        retryClassification: 'rate_limit',
        retryAfterSeconds: error.retryAfterSeconds,
      };
    }
    return {
      retryable: true,
      sanitized: error.message,
      outcome: 'retryable_failure',
      retryClassification: 'transient',
    };
  }
  return {
    retryable: true,
    sanitized: error instanceof Error ? error.message : String(error),
    outcome: 'retryable_failure',
    retryClassification: 'unknown',
  };
}

/**
 * Deliver due alerts. Sends happen OUTSIDE any long-running transaction, and
 * each attempt is recorded for diagnostics. A timeout after Telegram accepts a
 * message can produce an ambiguous outcome — RADAR does not promise
 * exactly-once delivery.
 */
export async function deliverPendingAlerts(options: DeliverOptions): Promise<DeliverResult> {
  const {
    db,
    sender,
    logger,
    renderMessage,
    batchSize = 20,
    leaseMs = 60_000,
    maxAttempts = 6,
    baseDelayMs = 2_000,
    maxDelayMs = 300_000,
    jitter = 0.2,
  } = options;

  const claimed = await claimOutboxRows(db, { limit: batchSize, leaseMs });
  let sent = 0;
  let failed = 0;
  let cancelled = 0;

  for (const row of claimed) {
    const watch = (
      await db.select().from(watchedWallets).where(eq(watchedWallets.id, row.watchId)).limit(1)
    )[0];
    const account = (
      await db.select().from(accounts).where(eq(accounts.id, row.accountId)).limit(1)
    )[0];

    // Recheck state before sending: paused/removed watches and deleted accounts
    // must not receive messages.
    if (
      !account ||
      account.deletedAt !== null ||
      !watch ||
      !watch.active ||
      watch.removedAt !== null
    ) {
      await db.update(alertOutbox).set({ status: 'cancelled' }).where(eq(alertOutbox.id, row.id));
      cancelled += 1;
      continue;
    }

    const html = await renderMessage({ outbox: row, chatId: account.telegramChatId });

    try {
      const messageId = await sender.sendMessage(account.telegramChatId, html);
      await markSent(db, row.id, messageId);
      await recordDeliveryAttempt(db, {
        outboxId: row.id,
        outcome: 'sent',
        retryClassification: 'transient',
      });
      sent += 1;
    } catch (error) {
      const classification = classifyDeliveryError(error);
      logger.warn(
        { outboxId: row.id, outcome: classification.outcome, retry: classification.retryable },
        'alert delivery attempt failed',
      );

      if (!classification.retryable || row.attempts >= maxAttempts) {
        await markPermanentFailure(db, row.id, classification.sanitized);
        await recordDeliveryAttempt(db, {
          outboxId: row.id,
          outcome: classification.outcome,
          retryClassification: classification.retryClassification,
          errorSanitized: classification.sanitized,
        });
        failed += 1;
        continue;
      }

      const delayMs =
        classification.retryAfterSeconds !== undefined
          ? classification.retryAfterSeconds * 1000
          : computeBackoff({
              attempt: row.attempts,
              baseDelayMs,
              maxDelayMs,
              jitter,
            });
      await markRetryable(db, row.id, {
        availableAt: new Date(Date.now() + delayMs),
        error: classification.sanitized,
      });
      await recordDeliveryAttempt(db, {
        outboxId: row.id,
        outcome: classification.outcome,
        retryClassification: classification.retryClassification,
        errorSanitized: classification.sanitized,
      });
      failed += 1;
    }
  }

  return { sent, failed, cancelled };
}
