import { ProviderError } from '../shared/errors.js';
import type { Hash, HistoryProvider, HistoryQuery } from './types.js';

/** Reads a fixed window without allowing an unbounded provider walk. */
export async function probeHistoryWindow(
  provider: HistoryProvider,
  query: HistoryQuery,
  maxPages: number,
  expectedHash?: Hash,
): Promise<{
  pagesChecked: number;
  candidates: number;
  uniqueCandidates: number;
  continuationAccepted: boolean;
  windowComplete: boolean;
  expectedTransactionFound: boolean | null;
}> {
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 500) {
    throw new ProviderError('VERIFY_HISTORY_MAX_PAGES must be an integer from 1 to 500');
  }
  const hashes = new Set<string>();
  const cursors = new Set<string>();
  let cursor = query.cursor;
  if (cursor) cursors.add(cursor);
  let pagesChecked = 0;
  let candidates = 0;
  let windowComplete = false;
  while (pagesChecked < maxPages) {
    const page = await provider.getAddressHistory({ ...query, ...(cursor ? { cursor } : {}) });
    pagesChecked += 1;
    candidates += page.transactions.length;
    for (const transaction of page.transactions) hashes.add(transaction.hash.toLowerCase());
    if (page.complete) {
      windowComplete = true;
      break;
    }
    if (!page.nextCursor || cursors.has(page.nextCursor)) {
      throw new ProviderError('History provider returned a missing or repeated cursor');
    }
    cursor = page.nextCursor;
    cursors.add(cursor);
  }
  return {
    pagesChecked,
    candidates,
    uniqueCandidates: hashes.size,
    continuationAccepted: pagesChecked > 1,
    windowComplete,
    expectedTransactionFound: expectedHash ? hashes.has(expectedHash.toLowerCase()) : null,
  };
}
