import { describe, expect, it } from 'vitest';
import { createExplorerHistoryProvider } from '../../src/chain/explorer-history-provider.js';
import { ProviderError } from '../../src/shared/errors.js';
import type { Address } from '../../src/shared/addresses.js';

const BASE = 'https://explorer.example/api';
const ADDRESS = '0x1111111111111111111111111111111111111111' as Address;

interface Record_ {
  hash: string;
  blockNumber: string;
  timeStamp: string;
}

function record(index: number, seconds: number): Record_ {
  return {
    hash: `0x${index.toString(16).padStart(64, '0')}`,
    blockNumber: String(1000 + index),
    timeStamp: String(seconds),
  };
}

function makeFetch(handlers: {
  txlist: (page: number) => unknown;
  tokentx: (page: number) => unknown;
}): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const action = url.searchParams.get('action') ?? '';
    const page = Number(url.searchParams.get('page') ?? '1');
    calls.push(`${action}:${page}`);
    const body = action === 'txlist' ? handlers.txlist(page) : handlers.tokentx(page);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const WINDOW = {
  fromTimestamp: new Date('2026-01-01T00:00:00.000Z'),
  toTimestamp: new Date('2026-01-02T00:00:00.000Z'),
};

describe('explorer history provider', () => {
  it('merges normal transactions with token-only activity', async () => {
    const { fetchImpl } = makeFetch({
      txlist: () => ({ status: '1', result: [record(1, 1767225600)] }),
      tokentx: () => ({ status: '1', result: [record(2, 1767225700)] }),
    });
    const provider = createExplorerHistoryProvider({
      apiBaseUrl: BASE,
      chainId: 4663,
      fetchImpl,
    });
    const page = await provider.getAddressHistory({ address: ADDRESS, ...WINDOW, limit: 10 });
    // A token-only transfer must not be missed by relying on txlist alone.
    expect(page.transactions.map((tx) => tx.hash)).toEqual([record(1, 0).hash, record(2, 0).hash]);
    expect(page.complete).toBe(true);
  });

  it('filters candidates outside the requested window', async () => {
    const { fetchImpl } = makeFetch({
      txlist: () => ({
        status: '1',
        result: [record(1, 1767225600), record(2, 1766000000)],
      }),
      tokentx: () => ({
        status: '0',
        message: 'No transactions found',
        result: 'No transactions found',
      }),
    });
    const provider = createExplorerHistoryProvider({ apiBaseUrl: BASE, chainId: 4663, fetchImpl });
    const page = await provider.getAddressHistory({ address: ADDRESS, ...WINDOW, limit: 10 });
    expect(page.transactions).toHaveLength(1);
  });

  it('paginates independently per endpoint and reports completeness', async () => {
    const { fetchImpl, calls } = makeFetch({
      txlist: (page) => ({
        status: '1',
        result:
          page === 1 ? [record(1, 1767225600), record(2, 1767225601)] : [record(3, 1767225602)],
      }),
      tokentx: () => ({
        status: '0',
        message: 'No transactions found',
        result: 'No transactions found',
      }),
    });
    const provider = createExplorerHistoryProvider({
      apiBaseUrl: BASE,
      chainId: 4663,
      fetchImpl,
      pageSize: 2,
    });

    const first = await provider.getAddressHistory({ address: ADDRESS, ...WINDOW, limit: 10 });
    expect(first.complete).toBe(false);
    expect(first.nextCursor).toBeTypeOf('string');

    const second = await provider.getAddressHistory({
      address: ADDRESS,
      ...WINDOW,
      limit: 10,
      cursor: first.nextCursor,
    });
    expect(second.complete).toBe(true);
    expect(calls).toContain('txlist:2');
  });

  it('raises a ProviderError for unexpected response shapes instead of returning empty', async () => {
    const { fetchImpl } = makeFetch({
      txlist: () => ({ status: '1' }),
      tokentx: () => ({ status: '1', result: [] }),
    });
    const provider = createExplorerHistoryProvider({ apiBaseUrl: BASE, chainId: 4663, fetchImpl });
    await expect(
      provider.getAddressHistory({ address: ADDRESS, ...WINDOW, limit: 10 }),
    ).rejects.toThrow(ProviderError);
  });

  it('surfaces an error message rather than a fabricated empty result', async () => {
    const { fetchImpl } = makeFetch({
      txlist: () => ({ status: '0', message: 'NOTOK', result: 'Rate limit exceeded' }),
      tokentx: () => ({ status: '1', result: [] }),
    });
    const provider = createExplorerHistoryProvider({ apiBaseUrl: BASE, chainId: 4663, fetchImpl });
    await expect(
      provider.getAddressHistory({ address: ADDRESS, ...WINDOW, limit: 10 }),
    ).rejects.toThrow(/Rate limit exceeded/);
  });
});
