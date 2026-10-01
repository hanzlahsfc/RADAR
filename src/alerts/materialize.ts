import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { alertRules, watchedWallets, type EventRow } from '../db/schema/index.js';
import { toChainEvent } from '../db/repositories/events.js';
import { enqueueAlert } from './outbox.js';
import { evaluateRule, type AlertDirection, type AlertKind, type AlertRuleSpec } from './rules.js';

/**
 * Create durable alert rows for a single stored event.
 *
 * Idempotency comes from unique(rule_id, event_id): replaying the same event
 * enqueues nothing new. Only ACTIVE, non-removed watches with ENABLED rules are
 * considered, and `evaluateRule` additionally ignores events at or before the
 * watch's activation block — so historical backfill never produces live alerts.
 */
export async function materializeAlertsForEvent(db: Database, eventRow: EventRow): Promise<number> {
  const candidateAddresses = [
    eventRow.fromAddress,
    eventRow.toAddress,
    eventRow.creatorAddress,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  if (candidateAddresses.length === 0) return 0;
  const uniqueAddresses = [...new Set(candidateAddresses.map((value) => value.toLowerCase()))];

  const watches = await db
    .select()
    .from(watchedWallets)
    .where(
      and(
        eq(watchedWallets.chainId, eventRow.chainId),
        eq(watchedWallets.active, true),
        isNull(watchedWallets.removedAt),
        inArray(watchedWallets.address, uniqueAddresses),
      ),
    );
  if (watches.length === 0) return 0;

  const rules = await db
    .select()
    .from(alertRules)
    .where(
      and(
        inArray(
          alertRules.watchId,
          watches.map((watch) => watch.id),
        ),
        eq(alertRules.enabled, true),
      ),
    );
  if (rules.length === 0) return 0;

  const event = toChainEvent(eventRow);
  let created = 0;

  for (const watch of watches) {
    const watchRules = rules.filter((rule) => rule.watchId === watch.id);
    for (const rule of watchRules) {
      const spec: AlertRuleSpec = {
        id: rule.id,
        kind: rule.kind as AlertKind,
        tokenAddress: rule.tokenAddress,
        direction: rule.direction as AlertDirection,
        thresholdRaw: rule.thresholdRaw,
        enabled: rule.enabled,
      };
      const match = evaluateRule(
        spec,
        { watchId: watch.id, address: watch.address, alertStartBlock: watch.alertStartBlock },
        event,
      );
      if (!match) continue;
      const outboxId = await enqueueAlert(db, {
        accountId: watch.accountId,
        watchId: watch.id,
        ruleId: rule.id,
        eventId: eventRow.id,
      });
      if (outboxId) created += 1;
    }
  }
  return created;
}

/** Materialize alerts for a batch of newly inserted events. */
export async function materializeAlertsForEvents(
  db: Database,
  eventRows: EventRow[],
): Promise<number> {
  let created = 0;
  for (const row of eventRows) {
    created += await materializeAlertsForEvent(db, row);
  }
  return created;
}
