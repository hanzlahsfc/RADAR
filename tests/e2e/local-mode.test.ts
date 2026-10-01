import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deliverPendingAlerts, type TelegramSender } from '../../src/alerts/deliver.js';
import { eventDirectionFor } from '../../src/alerts/rules.js';
import { renderAlertMessage } from '../../src/bot/formatters/event.js';
import type { ChainEvent, ChainReader, NormalizedBlock } from '../../src/chain/types.js';
import type { Address } from '../../src/shared/addresses.js';
import type { DatabaseHandle } from '../../src/db/client.js';
import { addWatch } from '../../src/db/repositories/watched-wallets.js';
import { alertRules, watchedWallets } from '../../src/db/schema/index.js';
import { processLiveBatch } from '../../src/indexer/live.js';
import { createLogger } from '../../src/shared/logger.js';
import {
  connectTestDatabase,
  createTestAccount,
  TEST_CHAIN_ID,
  truncateAll,
} from '../integration/harness.js';

const WATCH = '0x1111111111111111111111111111111111111111' as Address;
const OTHER = '0x2222222222222222222222222222222222222222' as Address;
const logger = createLogger({ level: 'silent', pretty: false });

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

function blockAt(number: bigint, value: bigint): NormalizedBlock {
  const hour = 12 + Number(number - 100n);
  return {
    number,
    hash: `0x${number.toString(16).padStart(64, '0')}`,
    parentHash: `0x${(number - 1n).toString(16).padStart(64, '0')}`,
    timestamp: new Date(`2026-01-01T${String(hour).padStart(2, '0')}:00:00.000Z`),
    transactions: [
      {
        hash: `0x${(number * 2n).toString(16).padStart(64, '0')}`,
        from: OTHER,
        to: WATCH,
        value,
        input: '0x',
        nonce: Number(number),
        transactionIndex: 0,
      },
    ],
  };
}

/** Deterministic read-only chain backed by fixtures. No network access. */
function fixtureReader(blocks: Map<string, NormalizedBlock>): ChainReader {
  const head = BigInt(
    [...blocks.keys()].sort((a, b) => Number(BigInt(a) - BigInt(b))).at(-1) ?? '0',
  );
  return {
    async getHead() {
      return head;
    },
    async getConfirmedHead() {
      return head;
    },
    async getBlock(number: bigint) {
      const found = blocks.get(number.toString());
      if (!found) throw new Error(`no fixture block ${number}`);
      return found;
    },
    async getReceipt(hash: `0x${string}`) {
      const block = [...blocks.values()].find((candidate) =>
        candidate.transactions.some((tx) => tx.hash === hash),
      );
      if (!block) throw new Error(`no receipt for ${hash}`);
      return {
        transactionHash: hash,
        blockNumber: block.number,
        blockHash: block.hash,
        status: 'success' as const,
        from: OTHER,
        to: WATCH,
        logs: [],
      };
    },
    async getLogs() {
      return [];
    },
  };
}

function recordingSender(): { sender: TelegramSender; messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    sender: {
      async sendMessage(_chatId, html) {
        messages.push(html);
        return BigInt(messages.length);
      },
    },
  };
}

async function seedWatch(telegramId: bigint, alertStartBlock: bigint, thresholdRaw: string | null) {
  const account = await createTestAccount(handle, telegramId);
  const { watch } = await addWatch(handle.db, {
    accountId: account.id,
    chainId: TEST_CHAIN_ID,
    address: WATCH,
    label: 'Launch wallet',
    alertStartBlock,
    maxWatches: 5,
  });
  await handle.db.insert(alertRules).values({
    watchId: watch.id,
    kind: 'eth_native',
    direction: 'both',
    thresholdRaw,
    enabled: true,
  });
  return { account, watch };
}

function chainEvent(overrides: Partial<ChainEvent> = {}): ChainEvent {
  return {
    chainId: Number(TEST_CHAIN_ID),
    blockNumber: 100n,
    blockHash: blockAt(100n, 0n).hash,
    transactionHash: blockAt(100n, 0n).transactions[0]!.hash,
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

async function renderForWatch(outboxWatchId: string, amountRaw = '400000000000000000') {
  const watch = (
    await handle.db
      .select()
      .from(watchedWallets)
      .where(eq(watchedWallets.id, outboxWatchId))
      .limit(1)
  )[0];
  const event = chainEvent({ amountRaw });
  return renderAlertMessage({
    event,
    watchLabel: watch?.label ?? null,
    direction: eventDirectionFor(event, WATCH) ?? 'in',
  });
}

async function runLiveBlock(number: bigint, value: bigint) {
  const blocks = new Map([[number.toString(), blockAt(number, value)]]);
  return processLiveBatch({
    db: handle.db,
    reader: fixtureReader(blocks),
    chainId: TEST_CHAIN_ID,
    fromBlock: number,
    toBlock: number,
    streamKey: 'live:native:4663',
    logger,
    supportedTokens: [],
    materializeAlerts: true,
  });
}

describe('deterministic local end-to-end flow', () => {
  it('indexes a watched transfer, alerts at the inclusive threshold, and delivers once', async () => {
    await seedWatch(1001n, 99n, '400000000000000000');

    const batch = await runLiveBlock(100n, 400000000000000000n);
    expect(batch.acquired).toBe(true);
    expect(batch.eventsInserted).toBe(1);
    expect(batch.alertsCreated).toBe(1);

    const { sender, messages } = recordingSender();
    const result = await deliverPendingAlerts({
      db: handle.db,
      sender,
      logger,
      renderMessage: ({ outbox }) => renderForWatch(outbox.watchId),
    });

    expect(result.sent).toBe(1);
    expect(messages[0]).toContain('RADAR · Incoming ETH');
    expect(messages[0]).toContain('0.4 ETH');
    expect(messages[0]).toContain('Status: Confirmed');
  });

  it('never re-creates or re-delivers the same logical alert when a range is replayed', async () => {
    await seedWatch(2002n, 99n, null);

    const first = await runLiveBlock(100n, 1000000000000000000n);
    const replay = await runLiveBlock(100n, 1000000000000000000n);

    expect(first.alertsCreated).toBe(1);
    expect(replay.alertsCreated).toBe(0);

    const { sender, messages } = recordingSender();
    await deliverPendingAlerts({
      db: handle.db,
      sender,
      logger,
      renderMessage: ({ outbox }) => renderForWatch(outbox.watchId, '1000000000000000000'),
    });
    expect(messages).toHaveLength(1);
  });

  it('does not alert below the configured threshold', async () => {
    await seedWatch(3003n, 99n, '400000000000000000');
    const batch = await runLiveBlock(100n, 100000000000000000n);
    expect(batch.eventsInserted).toBe(1);
    expect(batch.alertsCreated).toBe(0);
  });

  it('suppresses alerts for paused watches but keeps indexing', async () => {
    const { watch } = await seedWatch(4004n, 99n, null);
    await handle.db
      .update(watchedWallets)
      .set({ active: false })
      .where(eq(watchedWallets.id, watch.id));

    const batch = await runLiveBlock(100n, 5000000000000000000n);
    expect(batch.eventsInserted).toBe(1);
    expect(batch.alertsCreated).toBe(0);
  });

  it('reports a provider outage as a visible stale state instead of empty data', async () => {
    const failing: ChainReader = {
      async getHead() {
        throw new Error('provider unavailable');
      },
      async getConfirmedHead() {
        throw new Error('provider unavailable');
      },
      async getBlock() {
        throw new Error('provider unavailable');
      },
      async getReceipt() {
        throw new Error('provider unavailable');
      },
      async getLogs() {
        throw new Error('provider unavailable');
      },
    };
    await expect(
      processLiveBatch({
        db: handle.db,
        reader: failing,
        chainId: TEST_CHAIN_ID,
        fromBlock: 100n,
        toBlock: 100n,
        streamKey: 'live:native:4663',
        logger,
        supportedTokens: [],
      }),
    ).rejects.toThrow('provider unavailable');
  });
});
