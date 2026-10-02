import { ProviderError } from '../shared/errors.js';
import type { Address } from '../shared/addresses.js';
import type { HistoryPage, HistoryProvider, HistoryQuery, TransactionCandidate } from './types.js';

/**
 * A generic, Etherscan-compatible address-history provider.
 *
 * Implements the Etherscan-style contract (`module=account&action=txlist|tokentx`).
 * The configured Blockscout PRO endpoint has passed a sampled 72-hour walk and
 * token-only receipt comparison; see docs/NETWORK_VERIFICATION.md. Other
 * providers still require their own shape, limit and coverage verification.
 * Malformed responses and record-cap truncation raise ProviderError so they
 * cannot become persisted complete coverage.
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
  /** Conservative cap per stream; Blockscout documents 10,000 records. */
  maxRecords?: number;
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
    if (
      !Number.isSafeInteger(parsed.txPage) ||
      (parsed.txPage ?? 0) < 1 ||
      !Number.isSafeInteger(parsed.tokenPage) ||
      (parsed.tokenPage ?? 0) < 1 ||
      typeof parsed.txDone !== 'boolean' ||
      typeof parsed.tokenDone !== 'boolean'
    ) {
      throw new Error('Invalid cursor state');
    }
    return parsed as ExplorerCursorState;
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
  if (typeof timeStamp !== 'string' || !/^\d+$/.test(timeStamp)) return null;
  const seconds = Number(timeStamp);
  if (!Number.isSafeInteger(seconds)) return null;
  const timestamp = new Date(seconds * 1000);
  if (!Number.isFinite(timestamp.getTime())) return null;
  return { hash: hash as `0x${string}`, blockNumber: BigInt(blockNumber), timestamp };
}

export function createExplorerHistoryProvider(
  config: ExplorerHistoryProviderConfig,
): HistoryProvider {
  const pageSize = config.pageSize ?? 100;
  const timeoutMs = config.timeoutMs ?? 15_000;
  const maxRecords = config.maxRecords ?? 10_000;
  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    !Number.isSafeInteger(maxRecords) ||
    maxRecords < 1
  ) {
    throw new ProviderError('Explorer page size and record limit must be positive integers');
  }
  const fetchImpl = config.fetchImpl ?? fetch;
  const base = config.apiBaseUrl.trim().replace(/\/+$/, '');
  if (!base) {
    throw new ProviderError('Explorer API base URL is not configured', { retryable: false });
  }

  async function fetchStream(
    action: 'txlist' | 'tokentx',
    address: Address,
    page: number,
    limit: number,
    fromTimestamp: Date,
  ): Promise<{ records: ParsedRecord[]; full: boolean; exhaustedByWindow: boolean }> {
    if ((page - 1) * limit >= maxRecords) {
      throw new ProviderError('Explorer record limit reached before history boundary', {
        retryable: false,
        context: { action, maxRecords },
      });
    }
    const url = new URL(base);
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', action);
    url.searchParams.set('address', address);
    url.searchParams.set('page', String(page));
    url.searchParams.set('offset', String(limit));
    url.searchParams.set('sort', 'desc');
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

    if (typeof body !== 'object' || body === null) {
      throw new ProviderError('Explorer history returned an invalid envelope');
    }
    const envelope = body as { status?: unknown; message?: unknown; result?: unknown };
    const result = envelope.result;
    const noRecords = [envelope.message, result].some(
      (value) => typeof value === 'string' && NO_RECORD_MESSAGES.includes(value.toLowerCase()),
    );
    if (
      envelope.status === '0' &&
      !(noRecords && (typeof result === 'string' || (Array.isArray(result) && result.length === 0)))
    ) {
      throw new ProviderError(
        typeof result === 'string' && /rate limit/i.test(result)
          ? 'Rate limit exceeded by explorer history'
          : 'Explorer history returned a failure status',
        {
          retryable: false,
          context: { action },
        },
      );
    }
    if (Array.isArray(result)) {
      const parsed = result.map(parseRecord);
      if (parsed.some((record) => record === null)) {
        throw new ProviderError('Explorer history contains a malformed record', {
          retryable: false,
          context: { action },
        });
      }
      const records = parsed as ParsedRecord[];
      const oldest = records.reduce<Date | undefined>(
        (value, record) => (!value || record.timestamp < value ? record.timestamp : value),
        undefined,
      );
      const exhaustedByWindow = oldest !== undefined && oldest < fromTimestamp;
      if (!exhaustedByWindow && (page - 1) * limit + result.length >= maxRecords) {
        throw new ProviderError('Explorer record limit reached before history boundary', {
          retryable: false,
          context: { action, maxRecords },
        });
      }
      return {
        records,
        full: result.length >= limit,
        exhaustedByWindow,
      };
    }
    if (typeof result === 'string') {
      if (NO_RECORD_MESSAGES.includes(result.toLowerCase())) {
        return { records: [], full: false, exhaustedByWindow: false };
      }
      throw new ProviderError(
        'Explorer history returned an unexpected message (possibly rate limit exceeded)',
        {
          retryable: false,
          context: { action },
        },
      );
    }
    throw new ProviderError(
      'Explorer history response did not match the expected shape (missing array result)',
      { retryable: false, context: { action } },
    );
  }

  return {
    kind: 'explorer',
    async getAddressHistory(query: HistoryQuery): Promise<HistoryPage> {
      if (!Number.isSafeInteger(query.limit) || query.limit < 2) {
        throw new ProviderError('Explorer history page limit must be an integer of at least 2', {
          retryable: false,
        });
      }
      const streamLimit = Math.min(pageSize, Math.floor(query.limit / 2));
      const state = decodeCursor(query.cursor);
      const address: Address = query.address;

      const fromTx = state.txDone
        ? { records: [] as ParsedRecord[], full: false, exhaustedByWindow: false }
        : await fetchStream('txlist', address, state.txPage, streamLimit, query.fromTimestamp);
      const fromToken = state.tokenDone
        ? { records: [] as ParsedRecord[], full: false, exhaustedByWindow: false }
        : await fetchStream('tokentx', address, state.tokenPage, streamLimit, query.fromTimestamp);

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

      const txDone = state.txDone || !fromTx.full || fromTx.exhaustedByWindow;
      const tokenDone = state.tokenDone || !fromToken.full || fromToken.exhaustedByWindow;
      const nextState: ExplorerCursorState = {
        txPage: txDone ? state.txPage : state.txPage + 1,
        tokenPage: tokenDone ? state.tokenPage : state.tokenPage + 1,
        txDone,
        tokenDone,
      };
      const complete = nextState.txDone && nextState.tokenDone && sorted.length <= query.limit;
      const nextCursor = complete ? undefined : encodeCursor(nextState);
      return { transactions, ...(nextCursor ? { nextCursor } : {}), complete };
    },
  };
}
