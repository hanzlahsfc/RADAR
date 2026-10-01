import type { Env, HistoryProviderKind } from '../config/env.js';
import type { NetworkConfig } from '../config/network.js';
import { ValidationError } from '../shared/errors.js';
import { createExplorerHistoryProvider } from './explorer-history-provider.js';
import type { HistoryPage, HistoryProvider, HistoryQuery } from './types.js';

/** Deterministic in-memory provider used by unit/integration tests. */
export interface FixtureHistoryEntry {
  hash: `0x${string}`;
  blockNumber: bigint;
  timestamp: Date;
}

export function createFixtureHistoryProvider(entries: FixtureHistoryEntry[]): HistoryProvider {
  const sorted = [...entries].sort((a, b) => Number(a.blockNumber - b.blockNumber));
  return {
    kind: 'fixture',
    async getAddressHistory(query: HistoryQuery): Promise<HistoryPage> {
      const inWindow = sorted.filter(
        (entry) => entry.timestamp >= query.fromTimestamp && entry.timestamp <= query.toTimestamp,
      );
      const startIndex = query.cursor ? Number.parseInt(query.cursor, 10) : 0;
      if (Number.isNaN(startIndex) || startIndex < 0) {
        throw new ValidationError('Invalid fixture cursor', { cursor: query.cursor });
      }
      const slice = inWindow.slice(startIndex, startIndex + query.limit);
      const nextIndex = startIndex + slice.length;
      const complete = nextIndex >= inWindow.length;
      return {
        transactions: slice.map((entry) => ({ hash: entry.hash, blockNumber: entry.blockNumber })),
        ...(complete ? {} : { nextCursor: String(nextIndex) }),
        complete,
      };
    },
  };
}

export interface ProviderFactoryOptions {
  network: NetworkConfig;
  env: Env;
  fetchImpl?: typeof fetch;
}

/**
 * Build the configured history provider. When the chain/history provider is
 * disabled, throws a clear error rather than pretending no history exists.
 */
export function createHistoryProvider(options: ProviderFactoryOptions): HistoryProvider {
  const kind: HistoryProviderKind = options.network.historyProvider;
  switch (kind) {
    case 'explorer':
      return createExplorerHistoryProvider({
        apiBaseUrl: options.network.explorerApiBaseUrl ?? options.network.explorerBaseUrl ?? '',
        ...(options.network.explorerApiKey ? { apiKey: options.network.explorerApiKey } : {}),
        chainId: options.network.chainId,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      });
    case 'rpc':
      throw new ValidationError(
        'HISTORY_PROVIDER=rpc is not supported yet: RPC block scanning cannot discover token-only activity for arbitrary addresses. Use the explorer provider or provide fixtures.',
      );
    case 'disabled':
      throw new ValidationError(
        'History provider is disabled (HISTORY_PROVIDER=disabled or no chain configured).',
      );
  }
}
