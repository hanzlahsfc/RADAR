import { ProviderError } from '../shared/errors.js';
import type { Address } from '../shared/addresses.js';
import type { HistoryPage, HistoryProvider, HistoryQuery, TransactionCandidate } from './types.js';

/**
 * A generic, Etherscan-compatible address-history provider.
 *
 * IMPORTANT (Phase 0 honesty): the concrete Robinhood Chain explorer response
 * shape is NOT yet verified. This adapter implements the widely-used
 * Etherscan-style contract (`module=account&action=txlist|tokentx`) and, when a
 * response does not match that shape, raises a ProviderError instead of
 * fabricating or silently returning empty results. The real endpoint, params,
 * pagination limits, and whether token transfers are included must be confirmed
 * by `pnpm verify:network` and recorded in docs/NETWORK_VERIFICATION.md.
 *
 * Two endpoints are queried and merged on purpose: a normal-transactions
 * endpoint (txlist) does NOT include token-only activity, so token transfers
 * (tokentx) are fetched separately. Each endpoint is paged independently so one
 * stream running dry cannot truncate the other.
 */
export interface ExplorerHistoryProviderConfig {
  apiBaseUrl: string;
  apiKey?: string;
  chainId: number;
  fetchImpl?: typeof fetch;
  pageSize?: number;
  timeoutMs?: number;
}

interface ExplorerCursorState {
  txPage: number;
  tokenPage: number;
  txDone: boolean;
  tokenDone: boolean;
}

interface ParsedRecord {
  hash: `0x${string}`;
  blockNumber: bigint;
  timestamp: Date;
}

const NO_RECORD_MESSAGES = [
  'no transactions found',
  'no records found',
  'no result found',
  'no results found',
];

function encodeCursor(state: ExplorerCursorState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): ExplorerCursorState {
  if (!cursor) {
    return { txPage: 1, tokenPage: 1, txDone: false, tokenDone: false };
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<ExplorerCursorState>;
    return {
      txPage:
        Number.isInteger(parsed.txPage) && (parsed.txPage as number) > 0
          ? (parsed.txPage as number)
          : 1,
      tokenPage:
        Number.isInteger(parsed.tokenPage) && (parsed.tokenPage as number) > 0
          ? (parsed.tokenPage as number)
          : 1,
      txDone: parsed.txDone === true,
      tokenDone: parsed.tokenDone === true,
    };
  } catch (error) {
    throw new ProviderError('Invalid explorer cursor', { retryable: false, cause: error });
  }
}

function parseRecord(value: unknown): ParsedRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const hash = record.hash;
  const blockNumber = record.blockNumber;
  const timeStamp = record.timeStamp;
  if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;
  if (typeof blockNumber !== 'string' || !/^\d+$/.test(blockNumber)) return null;
  const seconds = typeof timeStamp === 'string' ? Number(timeStamp) : NaN;
  const timestamp = Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date(0);
  return { hash: hash as `0x${string}`, blockNumber: BigInt(blockNumber), timestamp };
}

export function createExplorerHistoryProvider(
  config: ExplorerHistoryProviderConfig,
): HistoryProvider {
  const pageSize = config.pageSize ?? 100;
  const timeoutMs = config.timeoutMs ?? 15_000;
  const fetchImpl = config.fetchImpl ?? fetch;
  const base = config.apiBaseUrl.trim().replace(/\/+$/, '');
  if (!base) {
    throw new ProviderError('Explorer API base URL is not configured', { retryable: false });
  }

  async function fetchStream(
    action: 'txlist' | 'tokentx',
    address: Address,
    page: number,
  ): Promise<{ records: ParsedRecord[]; full: boolean }> {
    const url = new URL(base);
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', action);
    url.searchParams.set('address', address);
    url.searchParams.set('page', String(page));
    url.searchParams.set('offset', String(pageSize));
    url.searchParams.set('sort', 'asc');
    if (config.apiKey) url.searchParams.set('apikey', config.apiKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
    } catch (error) {
      throw new ProviderError('Explorer history request failed', {
        retryable: true,
        cause: error,
        context: { action },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new ProviderError(`Explorer history responded HTTP ${response.status}`, {
        retryable: response.status >= 500 || response.status === 429,
        context: { action, status: response.status },
      });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new ProviderError('Explorer history returned non-JSON', {
        retryable: false,
        cause: error,
        context: { action },
      });
    }

    const result = (body as { result?: unknown }).result;
    if (Array.isArray(result)) {
      const records = result.map(parseRecord).filter((r): r is ParsedRecord => r !== null);
      return { records, full: result.length >= pageSize };
    }
    if (typeof result === 'string') {
      if (NO_RECORD_MESSAGES.some((message) => result.toLowerCase().includes(message))) {
        return { records: [], full: false };
      }
      throw new ProviderError(`Explorer history returned an unexpected message: ${result}`, {
        retryable: false,
        context: { action },
      });
    }
    throw new ProviderError(
      'Explorer history response did not match the expected shape (missing array result)',
      { retryable: false, context: { action } },
    );
  }

  return {
    kind: 'explorer',
    async getAddressHistory(query: HistoryQuery): Promise<HistoryPage> {
      const state = decodeCursor(query.cursor);
      const address: Address = query.address;

      const fromTx = state.txDone
        ? { records: [] as ParsedRecord[], full: false }
        : await fetchStream('txlist', address, state.txPage);
      const fromToken = state.tokenDone
        ? { records: [] as ParsedRecord[], full: false }
        : await fetchStream('tokentx', address, state.tokenPage);

      const merged = new Map<string, ParsedRecord>();
      for (const record of [...fromTx.records, ...fromToken.records]) {
        if (record.timestamp < query.fromTimestamp || record.timestamp > query.toTimestamp)
          continue;
        if (!merged.has(record.hash)) merged.set(record.hash, record);
      }
      const sorted = [...merged.values()].sort((a, b) =>
        a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : 0,
      );
      const transactions: TransactionCandidate[] = sorted
        .slice(0, query.limit)
        .map((record) => ({ hash: record.hash, blockNumber: record.blockNumber }));

      const nextState: ExplorerCursorState = {
        txPage: state.txDone ? state.txPage : state.txPage + 1,
        tokenPage: state.tokenDone ? state.tokenPage : state.tokenPage + 1,
        txDone: state.txDone || !fromTx.full,
        tokenDone: state.tokenDone || !fromToken.full,
      };
      const complete = nextState.txDone && nextState.tokenDone && sorted.length <= query.limit;
      const nextCursor = complete ? undefined : encodeCursor(nextState);
      return { transactions, ...(nextCursor ? { nextCursor } : {}), complete };
    },
  };
}
