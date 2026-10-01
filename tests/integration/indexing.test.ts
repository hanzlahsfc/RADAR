import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ChainEvent } from '../../src/chain/types.js';
import type { Address } from '../../src/shared/addresses.js';
import type { DatabaseHandle } from '../../src/db/client.js';
import { insertEvents, listEventsForAddress } from '../../src/db/repositories/events.js';
import { advanceCursor, getCursor } from '../../src/indexer/checkpoints.js';
import {
  claimBackfillJob,
  continueBackfillJob,
  enqueueBackfillJob,
  getCoverage,
  processBackfillJob,
} from '../../src/indexer/backfill.js';
import type { ChainReader, HistoryProvider } from '../../src/chain/types.js';
import { streamAdvisoryKey, tryStreamLock } from '../../src/indexer/checkpoints.js';
import { connectTestDatabase, TEST_CHAIN_ID, truncateAll } from './harness.js';

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

const window = {
  from: new Date('2026-01-01T00:00:00.000Z'),
  to: new Date('2026-01-02T00:00:00.000Z'),
};

describe('event persistence', () => {
  it('stores exact integer amounts as strings', async () => {
    await insertEvents(handle.db, [makeEvent({ amountRaw: '1000000000000000001' })]);
    const rows = await listEventsForAddress(handle.db, {
      chainId: TEST_CHAIN_ID,
      address: WATCH,
      ...window,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amountRaw).toBe('1000000000000000001');
  });

  it('is idempotent for duplicate events', async () => {
    const first = await insertEvents(handle.db, [makeEvent()]);
    const second = await insertEvents(handle.db, [makeEvent()]);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it('treats a different eventKey in the same transaction as distinct', async () => {
    await insertEvents(handle.db, [makeEvent()]);
    const distinct = await insertEvents(handle.db, [
      makeEvent({ eventKey: 'log:0:erc20_transfer', kind: 'erc20_transfer' }),
    ]);
    expect(distinct).toHaveLength(1);
  });

  it('excludes non-canonical events from address queries', async () => {
    await insertEvents(handle.db, [
      makeEvent({ canonical: false, confirmationStatus: 'orphaned' }),
    ]);
    expect(
      await listEventsForAddress(handle.db, {
        chainId: TEST_CHAIN_ID,
        address: WATCH,
        ...window,
      }),
    ).toHaveLength(0);
  });
});

describe('cursor advancement', () => {
  it('creates and advances a cursor', async () => {
    await advanceCursor(handle.db, {
      streamKey: 'live:native:4663',
      chainId: TEST_CHAIN_ID,
      blockNumber: 100n,
      blockHash: 'a',
    });
    expect((await getCursor(handle.db, 'live:native:4663'))?.lastProcessedBlock).toBe(100n);
  });

  it('never moves a cursor backwards', async () => {
    await advanceCursor(handle.db, {
      streamKey: 's',
      chainId: TEST_CHAIN_ID,
      blockNumber: 200n,
      blockHash: 'b',
    });
    await advanceCursor(handle.db, {
      streamKey: 's',
      chainId: TEST_CHAIN_ID,
      blockNumber: 150n,
      blockHash: 'c',
    });
    expect((await getCursor(handle.db, 's'))?.lastProcessedBlock).toBe(200n);
  });

  it('keeps streams isolated from each other', async () => {
    await advanceCursor(handle.db, {
      streamKey: 'live:native:4663',
      chainId: TEST_CHAIN_ID,
      blockNumber: 100n,
      blockHash: 'a',
    });
    expect(await getCursor(handle.db, 'live:erc20:4663')).toBeNull();
  });
});

describe('stream advisory locks', () => {
  it('serializes workers for the same stream', async () => {
    const streamKey = 'live:native:4663';
    const other = await connectTestDatabase();
    try {
      let release!: () => void;
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      let acquiredSignal!: () => void;
      const acquired = new Promise<void>((resolve) => {
        acquiredSignal = resolve;
      });

      const firstHolder = handle.db.transaction(async (tx) => {
        const got = await tryStreamLock(tx as unknown as DatabaseHandle['db'], streamKey);
        acquiredSignal();
        await hold;
        return got;
      });

      await acquired;
      const secondAttempt = await other.db.transaction(async (tx) =>
        tryStreamLock(tx as unknown as DatabaseHandle['db'], streamKey),
      );
      expect(secondAttempt).toBe(false);

      release();
      expect(await firstHolder).toBe(true);

      const afterRelease = await other.db.transaction(async (tx) =>
        tryStreamLock(tx as unknown as DatabaseHandle['db'], streamKey),
      );
      expect(afterRelease).toBe(true);
    } finally {
      await other.close();
    }
  });

  it('derives stable, distinct advisory keys', () => {
    expect(streamAdvisoryKey('a')).toBe(streamAdvisoryKey('a'));
    expect(streamAdvisoryKey('a')).not.toBe(streamAdvisoryKey('b'));
  });
});

describe('backfill job leases', () => {
  const jobInput = () => ({
    chainId: TEST_CHAIN_ID,
    address: WATCH,
    from: new Date('2026-01-01T00:00:00.000Z'),
    to: new Date('2026-01-02T00:00:00.000Z'),
  });

  it('claims a job once and skips it while leased', async () => {
    await enqueueBackfillJob(handle.db, jobInput());
    const first = await claimBackfillJob(handle.db, { leaseMs: 60_000 });
    expect(first?.status).toBe('running');
    expect(await claimBackfillJob(handle.db, { leaseMs: 60_000 })).toBeNull();
  });

  it('continues an incomplete page budget without marking coverage complete', async () => {
    await enqueueBackfillJob(handle.db, jobInput());
    const job = await claimBackfillJob(handle.db, { leaseMs: 60_000 });
    expect(job).not.toBeNull();

    const provider: HistoryProvider = {
      kind: 'explorer',
      async getAddressHistory(query) {
        expect(query.cursor).toBeUndefined();
        return { transactions: [], nextCursor: 'page-2', complete: false };
      },
    };
    const outcome = await processBackfillJob(
      { db: handle.db, chainId: TEST_CHAIN_ID, provider, reader: {} as ChainReader, maxPages: 1 },
      job!,
    );
    expect(outcome.complete).toBe(false);
    expect(outcome.nextCursor).toBe('page-2');
    expect(await getCoverage(handle.db, { chainId: TEST_CHAIN_ID, address: WATCH })).toEqual([]);

    await continueBackfillJob(handle.db, job!.id, outcome.nextCursor!, 0);
    const resumed = await claimBackfillJob(handle.db, { leaseMs: 60_000 });
    expect(resumed?.providerCursor).toBe('page-2');
    expect(resumed?.status).toBe('running');
  });

  it('recovers a job whose lease expired (worker crash)', async () => {
    await enqueueBackfillJob(handle.db, jobInput());
    const crashed = await claimBackfillJob(handle.db, { leaseMs: -1000 });
    expect(crashed).not.toBeNull();

    const recovered = await claimBackfillJob(handle.db, { leaseMs: 60_000 });
    expect(recovered?.id).toBe(crashed?.id);
    expect(recovered?.attempts).toBe(2);
  });
});
