import { describe, expect, it } from 'vitest';
import { createExplorerHistoryProvider } from '../../src/chain/explorer-history-provider.js';
import type { Address } from '../../src/shared/addresses.js';
const address = '0x1111111111111111111111111111111111111111' as Address;
const query = {
  address,
  fromTimestamp: new Date(100_000),
  toTimestamp: new Date(300_000),
  limit: 4,
};
const record = (i: number, timeStamp = '200') => ({
  hash: `0x${i.toString(16).padStart(64, '0')}`,
  blockNumber: String(i),
  timeStamp,
});
function provider(txlist: (page: number) => unknown) {
  return createExplorerHistoryProvider({
    apiBaseUrl: 'https://example.com/api',
    chainId: 4663,
    maxRecords: 3,
    fetchImpl: (async (input) => {
      const u = new URL(String(input));
      return new Response(
        JSON.stringify(
          u.searchParams.get('action') === 'txlist'
            ? txlist(Number(u.searchParams.get('page')))
            : { status: '1', result: [] },
        ),
      );
    }) as typeof fetch,
  });
}
describe('explorer coverage safety', () => {
  it('rejects a short page at the provider record cap', async () => {
    const p = provider((page) => ({
      status: '1',
      result: page === 1 ? [record(2), record(1)] : [record(3)],
    }));
    const first = await p.getAddressHistory(query);
    await expect(p.getAddressHistory({ ...query, cursor: first.nextCursor })).rejects.toThrow(
      /record limit/,
    );
  });
  it('allows the cap when the stream crossed the requested boundary', async () => {
    const p = provider((page) => ({
      status: '1',
      result: page === 1 ? [record(2), record(1)] : [record(3, '99')],
    }));
    const first = await p.getAddressHistory(query);
    expect((await p.getAddressHistory({ ...query, cursor: first.nextCursor })).complete).toBe(true);
  });
  it.each([
    {},
    { hash: 'bad', blockNumber: '1', timeStamp: '200' },
    { ...record(1), timeStamp: 'invalid' },
    { ...record(1), timeStamp: undefined },
  ])('rejects malformed records before claiming coverage: %j', async (value) => {
    await expect(
      provider(() => ({ status: '1', result: [value] })).getAddressHistory(query),
    ).rejects.toThrow(/record/);
  });
  it('rejects failure envelopes containing an empty array', async () => {
    await expect(
      provider(() => ({ status: '0', message: 'NOTOK', result: [] })).getAddressHistory(query),
    ).rejects.toThrow();
  });
  it('rejects invalid cursor state', async () => {
    const cursor = Buffer.from(
      JSON.stringify({ txPage: 0, tokenPage: 1, txDone: false, tokenDone: false }),
    ).toString('base64url');
    await expect(
      provider(() => ({ status: '1', result: [] })).getAddressHistory({ ...query, cursor }),
    ).rejects.toThrow(/cursor/);
  });
});
