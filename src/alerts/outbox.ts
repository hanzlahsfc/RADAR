import { and, count, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { alertOutbox, deliveryAttempts, type AlertOutboxRow } from '../db/schema/index.js';

export interface EnqueueAlertInput {
  accountId: string;
  watchId: string;
  ruleId: string;
  eventId: string;
}

/** Enqueue an alert; unique(rule_id, event_id) makes replays a no-op. */
export async function enqueueAlert(db: Database, input: EnqueueAlertInput): Promise<string | null> {
  const rows = await db
    .insert(alertOutbox)
    .values(input)
    .onConflictDoNothing({ target: [alertOutbox.ruleId, alertOutbox.eventId] })
    .returning({ id: alertOutbox.id });
  return rows[0]?.id ?? null;
}

/**
 * Claim due outbox rows with SKIP LOCKED and an expiring lease. Runs inside a
 * transaction so the lock is released immediately after committing the claim.
 */
export async function claimOutboxRows(
  db: Database,
  options: { limit: number; leaseMs: number },
): Promise<AlertOutboxRow[]> {
  const leaseUntil = new Date(Date.now() + options.leaseMs);
  const rawRows = (await db.execute(sql`
    update alert_outbox
       set status = 'sending', lease_until = ${leaseUntil.toISOString()}, attempts = attempts + 1
     where id in (
       select id from alert_outbox
        where status in ('pending', 'sending')
          and available_at <= now()
          and (lease_until is null or lease_until < now())
        order by available_at
        for update skip locked
        limit ${options.limit}
     )
     returning *;
  `)) as unknown as AlertOutboxRow[];
  return rawRows.map((row) =>
    Object.fromEntries(
      Object.entries(row as Record<string, unknown>).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
        key === 'telegram_message_id' && value !== null ? BigInt(String(value)) : value,
      ]),
    ),
  ) as unknown as AlertOutboxRow[];
}

export async function markSent(
  db: Database,
  outboxId: string,
  telegramMessageId: bigint | null,
): Promise<void> {
  await db
    .update(alertOutbox)
    .set({ status: 'sent', sentAt: new Date(), telegramMessageId, lastError: null })
    .where(eq(alertOutbox.id, outboxId));
}

export async function markRetryable(
  db: Database,
  outboxId: string,
  input: { availableAt: Date; error: string },
): Promise<void> {
  await db
    .update(alertOutbox)
    .set({ status: 'pending', availableAt: input.availableAt, lastError: input.error })
    .where(eq(alertOutbox.id, outboxId));
}

export async function markPermanentFailure(
  db: Database,
  outboxId: string,
  error: string,
): Promise<void> {
  await db
    .update(alertOutbox)
    .set({ status: 'failed', lastError: error })
    .where(eq(alertOutbox.id, outboxId));
}

/** Cancel unsent alerts (used by /unwatch, orphaned events, and account removal). */
export async function cancelUnsentAlerts(
  db: Database,
  criteria: { watchId?: string; eventIds?: string[] },
): Promise<number> {
  if (criteria.eventIds && criteria.eventIds.length === 0) return 0;
  const conditions = [inArray(alertOutbox.status, ['pending', 'sending'])];
  if (criteria.watchId) {
    conditions.push(eq(alertOutbox.watchId, criteria.watchId));
  }
  if (criteria.eventIds) {
    conditions.push(inArray(alertOutbox.eventId, criteria.eventIds));
  }
  const rows = await db
    .update(alertOutbox)
    .set({ status: 'cancelled' })
    .where(and(...conditions))
    .returning({ id: alertOutbox.id });
  return rows.length;
}

export interface DeliveryAttemptInput {
  outboxId: string;
  outcome: string;
  retryClassification: string;
  errorSanitized?: string | null;
}

export async function recordDeliveryAttempt(
  db: Database,
  input: DeliveryAttemptInput,
): Promise<void> {
  await db.insert(deliveryAttempts).values({
    outboxId: input.outboxId,
    outcome: input.outcome,
    retryClassification: input.retryClassification,
    errorSanitized: input.errorSanitized ?? null,
  });
}

export async function countPendingAlerts(db: Database, accountId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(alertOutbox)
    .where(
      and(
        eq(alertOutbox.accountId, accountId),
        inArray(alertOutbox.status, ['pending', 'sending']),
      ),
    );
  return Number(row?.value ?? 0);
}

export async function listPendingOutbox(db: Database, limit = 50): Promise<AlertOutboxRow[]> {
  return db
    .select()
    .from(alertOutbox)
    .where(and(eq(alertOutbox.status, 'pending'), lte(alertOutbox.availableAt, new Date())))
    .limit(limit);
}
