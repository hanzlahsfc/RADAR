import { describe, expect, it } from 'vitest';
import { probeHistoryWindow } from '../../src/chain/verify-history.js';
import type { HistoryProvider, HistoryQuery } from '../../src/chain/types.js';
const hash = `0x${'1'.repeat(64)}` as const;
const query: HistoryQuery = {
  address: `0x${'1'.repeat(40)}`,
  fromTimestamp: new Date(0),
  toTimestamp: new Date(),
  limit: 4,
};
describe('bounded history verification', () => {
  it('walks all pages and counts unique candidates', async () => {
    const provider: HistoryProvider = {
      kind: 'fixture',
      getAddressHistory: async (q) => ({
        transactions: [{ hash, blockNumber: 1n }],
        complete: q.cursor === 'second',
        ...(q.cursor ? {} : { nextCursor: 'second' }),
      }),
    };
    const result = await probeHistoryWindow(provider, query, 5, hash);
    expect(result).toMatchObject({
      pagesChecked: 2,
      candidates: 2,
      uniqueCandidates: 1,
      windowComplete: true,
      expectedTransactionFound: true,
      continuationAccepted: true,
    });
  });
  it('reports an incomplete window at its page budget', async () => {
    let page = 0;
    const provider: HistoryProvider = {
      kind: 'fixture',
      getAddressHistory: async () => ({
        transactions: [],
        complete: false,
        nextCursor: String(++page),
      }),
    };
    expect(await probeHistoryWindow(provider, query, 2)).toMatchObject({
      pagesChecked: 2,
      windowComplete: false,
    });
  });
  it('rejects repeated cursors', async () => {
    const provider: HistoryProvider = {
      kind: 'fixture',
      getAddressHistory: async () => ({ transactions: [], complete: false, nextCursor: 'same' }),
    };
    await expect(probeHistoryWindow(provider, query, 5)).rejects.toThrow(/cursor/);
  });
  it('rejects incomplete pages without a continuation', async () => {
    const provider: HistoryProvider = {
      kind: 'fixture',
      getAddressHistory: async () => ({ transactions: [], complete: false }),
    };
    await expect(probeHistoryWindow(provider, query, 5)).rejects.toThrow(/cursor/);
  });
  it('counts a single page once and reports an absent known transaction', async () => {
    const provider: HistoryProvider = {
      kind: 'fixture',
      getAddressHistory: async () => ({
        transactions: [{ hash, blockNumber: 1n }],
        complete: true,
      }),
    };
    expect(await probeHistoryWindow(provider, query, 5, `0x${'2'.repeat(64)}`)).toMatchObject({
      candidates: 1,
      expectedTransactionFound: false,
      continuationAccepted: false,
    });
  });
});
