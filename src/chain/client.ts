import { createPublicClient, http, type PublicClient } from 'viem';
import { ConfigError } from '../shared/errors.js';
import type { NetworkConfig } from '../config/network.js';

/**
 * Build a read-only viem public client.
 *
 * No `chain` is supplied on purpose: RADAR never assumes a network. The
 * configured CHAIN_ID is compared against `eth_chainId` by callers (see
 * `verify:network`) and startup fails on mismatch.
 */
export function createChainClient(network: NetworkConfig): PublicClient {
  return createPublicClient({
    transport: http(network.rpcHttpUrl, {
      timeout: 20_000,
      retryCount: 2,
      retryDelay: 250,
    }),
  });
}

export type { PublicClient };

export async function assertChainIdentity(
  client: Pick<PublicClient, 'getChainId'>,
  expected: number,
): Promise<void> {
  const actual = await client.getChainId();
  if (actual !== expected)
    throw new ConfigError('RPC chain ID mismatch: expected ' + expected + ', received ' + actual);
}
