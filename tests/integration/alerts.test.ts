import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { materializeAlertsForEvent } from '../../src/alerts/materialize.js';
import {
  cancelUnsentAlerts,
  claimOutboxRows,
  countPendingAlerts,
  enqueueAlert,
} from '../../src/alerts/outbox.js';
import { addWatch } from '../../src/db/repositories/watched-wallets.js';
import type { DatabaseHandle } from '../../src/db/client.js';
import { insertEvents } from '../../src/db/repositories/events.js';
import { alertRules } from '../../src/db/schema/index.js';
import type { ChainEvent } from '../../src/chain/types.js';
import type { Address } from '../../src/shared/addresses.js';
import { connectTestDatabase, createTestAccount, TEST_CHAIN_ID, truncateAll } from './harness.js';

let handle: DatabaseHandle;

beforeAll(async () => {
  handle = await connectTestDatabase();
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await truncateAll(handle);
});

const WATCH = '0x1111111111111111111111111111111111111111' as Address;
const OTHER = '0x2222222222222222222222222222222222222222' as Address;

function makeEvent(overrides: Partial<ChainEvent> = {}): ChainEvent {
  return {
    chainId: Number(TEST_CHAIN_ID),
    blockNumber: 100n,
    blockHash: `0x${'a'.repeat(64)}`,
    transactionHash: `0x${'b'.repeat(64)}`,
    eventKey: 'native:0',
    kind: 'native_transfer',
    timestamp: new Date('2026-01-01T12:00:00.000Z'),
    fromAddress: OTHER,
    toAddress: WATCH,
    amountRaw: '400000000000000000',
    tokenDecimals: 18,
    canonical: true,
    confirmationStatus: 'confirmed',
    ...overrides,
  };
}

async function seed(telegramId: bigint, eventOverrides: Partial<ChainEvent> = {}) {
  const account = await createTestAccount(handle, telegramId);
  const { watch } = await addWatch(handle.db, {
    accountId: account.id,
    chainId: TEST_CHAIN_ID,
    address: WATCH,
    alertStartBlock: 50n,
    maxWatches: 5,
  });
  const [rule] = await handle.db
    .insert(alertRules)
    .values({
      watchId: watch.id,
      kind: 'eth_native',
      direction: 'both',
      thresholdRaw: null,
      enabled: true,
    })
    .returning();
  const [event] = await insertEvents(handle.db, [makeEvent(eventOverrides)]);
  return { account, watch, rule: rule!, event: event! };
}

describe('alert outbox idempotency', () => {
  it('rejects cross-account and mismatched watch/rule ownership', async () => {
    const first = await seed(9101n);
    const second = await seed(9102n);

    await expect(
      enqueueAlert(handle.db, {
        accountId: first.account.id,
        watchId: first.watch.id,
        ruleId: second.rule.id,
        eventId: first.event.id,
      }),
    ).rejects.toThrow();

    await expect(
      enqueueAlert(handle.db, {
        accountId: second.account.id,
        watchId: first.watch.id,
        ruleId: first.rule.id,
        eventId: first.event.id,
      }),
    ).rejects.toThrow();
  });
  it('creates at most one alert per (rule, event)', async () => {
    const { account, watch, rule, event } = await seed(1001n);
    const first = await enqueueAlert(handle.db, {
      accountId: account.id,
      watchId: watch.id,
      ruleId: rule.id,
      eventId: event.id,
    });
    const second = await enqueueAlert(handle.db, {
      accountId: account.id,
      watchId: watch.id,
      ruleId: rule.id,
      eventId: event.id,
    });
    expect(first).toBeTruthy();
    expect(second).toBeNull();
    expect(await countPendingAlerts(handle.db, account.id)).toBe(1);
  });

  it('materializes exactly one alert when replaying the same event', async () => {
    const { account, event } = await seed(2002n);
    const firstRun = await materializeAlertsForEvent(handle.db, event);
    const replay = await materializeAlertsForEvent(handle.db, event);
    expect(firstRun).toBe(1);
    expect(replay).toBe(0);
    expect(await countPendingAlerts(handle.db, account.id)).toBe(1);
  });

  it('does not alert for historical events at or before the activation block', async () => {
    const { account, event } = await seed(3003n, { blockNumber: 50n });
    expect(await materializeAlertsForEvent(handle.db, event)).toBe(0);
    expect(await countPendingAlerts(handle.db, account.id)).toBe(0);
  });

  it('does not alert for a watch that is paused', async () => {
    const { account, watch, event } = await seed(4004n);
    await handle.db.execute(sql`update watched_wallets set active = false where id = ${watch.id}`);
    expect(await materializeAlertsForEvent(handle.db, event)).toBe(0);
    expect(await countPendingAlerts(handle.db, account.id)).toBe(0);
  });
});

describe('outbox claiming and leases', () => {
  it('claims rows once and re-claims only after the lease expires', async () => {
    const seeded = await seed(5005n);
    await materializeAlertsForEvent(handle.db, seeded.event);
    const claimed = await claimOutboxRows(handle.db, { limit: 10, leaseMs: 60_000 });
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.status).toBe('sending');

    expect(await claimOutboxRows(handle.db, { limit: 10, leaseMs: 60_000 })).toHaveLength(0);

    // Simulate a crashed worker: expire the lease and re-claim.
    await handle.db.execute(sql`update alert_outbox set lease_until = now() - interval '1 minute'`);
    const reclaimed = await claimOutboxRows(handle.db, { limit: 10, leaseMs: 60_000 });
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]?.attempts).toBe(2);
  });

  it('cancels unsent alerts when a watch is removed', async () => {
    const { account, watch, event } = await seed(6006n);
    await materializeAlertsForEvent(handle.db, event);
    expect(await countPendingAlerts(handle.db, account.id)).toBe(1);

    const cancelled = await cancelUnsentAlerts(handle.db, { watchId: watch.id });
    expect(cancelled).toBe(1);
    expect(await countPendingAlerts(handle.db, account.id)).toBe(0);
    expect(await claimOutboxRows(handle.db, { limit: 10, leaseMs: 1000 })).toHaveLength(0);
  });
});
