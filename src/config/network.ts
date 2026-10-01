import type { Address } from '../shared/addresses.js';
import { ChainNotConfiguredError, ValidationError } from '../shared/errors.js';
import type { Env, HistoryProviderKind } from './env.js';

export type FinalityTag = 'latest' | 'safe' | 'finalized';

export type FinalityMode = { kind: 'tag'; tag: FinalityTag } | { kind: 'depth'; depth: number };

export interface NetworkConfig {
  chainId: number;
  rpcHttpUrl: string;
  explorerBaseUrl?: string;
  explorerApiBaseUrl?: string;
  explorerApiKey?: string;
  historyProvider: HistoryProviderKind;
  finality: FinalityMode;
  /** Token-1 wei is the base unit for native ETH alerts. */
  nativeDecimals: number;
}

export function parseFinalityMode(
  mode: string | undefined,
  confirmationDepth?: number,
): FinalityMode {
  if (mode === 'latest' || mode === 'safe' || mode === 'finalized') {
    return { kind: 'tag', tag: mode };
  }
  if (mode && mode.startsWith('depth:')) {
    const depth = Number(mode.slice('depth:'.length));
    if (!Number.isInteger(depth) || depth < 0) {
      throw new ValidationError('FINALITY_MODE depth must be a non-negative integer', { mode });
    }
    return { kind: 'depth', depth };
  }
  if (confirmationDepth !== undefined) {
    return { kind: 'depth', depth: confirmationDepth };
  }
  // No explicit finality configured. Default to a depth of 0 only in
  // non-production contexts; production requires FINALITY_MODE (enforced in env).
  return { kind: 'depth', depth: 0 };
}

/** Returns null when the chain is not configured (offline foundation mode). */
export function deriveNetworkConfig(env: Env): NetworkConfig | null {
  if (!env.CHAIN_ID || !env.RPC_HTTP_URL) {
    return null;
  }
  return {
    chainId: env.CHAIN_ID,
    rpcHttpUrl: env.RPC_HTTP_URL,
    ...(env.EXPLORER_BASE_URL ? { explorerBaseUrl: env.EXPLORER_BASE_URL } : {}),
    ...(env.EXPLORER_API_BASE_URL ? { explorerApiBaseUrl: env.EXPLORER_API_BASE_URL } : {}),
    ...(env.EXPLORER_API_KEY ? { explorerApiKey: env.EXPLORER_API_KEY } : {}),
    historyProvider: env.HISTORY_PROVIDER,
    finality: parseFinalityMode(env.FINALITY_MODE, env.CONFIRMATION_DEPTH),
    nativeDecimals: 18,
  };
}

export function requireNetworkConfig(env: Env): NetworkConfig {
  const config = deriveNetworkConfig(env);
  if (!config) {
    throw new ChainNotConfiguredError(
      'Chain is not configured. Set CHAIN_ID and RPC_HTTP_URL, then run `pnpm verify:network`.',
    );
  }
  return config;
}

/** Build an explorer link for a transaction or address, when configured. */
export function explorerTxUrl(network: NetworkConfig, hash: string): string | undefined {
  if (!network.explorerBaseUrl) return undefined;
  return `${network.explorerBaseUrl.replace(/\/+$/, '')}/tx/${hash}`;
}

export function explorerAddressUrl(network: NetworkConfig, address: Address): string | undefined {
  if (!network.explorerBaseUrl) return undefined;
  return `${network.explorerBaseUrl.replace(/\/+$/, '')}/address/${address}`;
}
