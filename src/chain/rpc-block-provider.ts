import type { Hex } from 'viem';
import type { NetworkConfig } from '../config/network.js';
import { ProviderError } from '../shared/errors.js';
import type { PublicClient } from './client.js';
import type {
  ChainReader,
  Hash,
  NormalizedBlock,
  NormalizedLog,
  NormalizedReceipt,
  NormalizedTransaction,
} from './types.js';

export interface RpcBlockProviderOptions {
  minLogChunkSize?: number;
}

export function createRpcBlockProvider(
  publicClient: PublicClient,
  network: NetworkConfig,
  options: RpcBlockProviderOptions = {},
): ChainReader {
  const minChunk = options.minLogChunkSize ?? 100;

  async function getHead(): Promise<bigint> {
    try {
      return await publicClient.getBlockNumber();
    } catch (error) {
      throw new ProviderError('Failed to read the latest block number', {
        retryable: true,
        cause: error,
      });
    }
  }

  async function getConfirmedHead(): Promise<bigint> {
    const finality = network.finality;
    if (finality.kind === 'depth') {
      const head = await getHead();
      const confirmed = head - BigInt(finality.depth);
      return confirmed < 0n ? 0n : confirmed;
    }
    try {
      const block = await publicClient.getBlock({ blockTag: finality.tag });
      return block.number ?? 0n;
    } catch (error) {
      throw new ProviderError(
        `Provider does not support block tag "${finality.tag}" required by the finality policy`,
        { retryable: false, cause: error, context: { tag: finality.tag } },
      );
    }
  }

  async function getBlock(number: bigint): Promise<NormalizedBlock> {
    try {
      const block = await publicClient.getBlock({ blockNumber: number, includeTransactions: true });
      const transactions: NormalizedTransaction[] = block.transactions.map((tx) => ({
        hash: tx.hash,
        from: tx.from.toLowerCase() as `0x${string}`,
        to: tx.to === null ? null : (tx.to.toLowerCase() as `0x${string}`),
        value: tx.value,
        input: tx.input,
        nonce: tx.nonce,
        transactionIndex: tx.transactionIndex,
      }));
      return {
        number: block.number ?? number,
        hash: block.hash as Hash,
        parentHash: block.parentHash as Hash,
        timestamp: new Date(Number(block.timestamp) * 1000),
        transactions,
      };
    } catch (error) {
      throw new ProviderError(`Failed to fetch block ${number}`, {
        retryable: true,
        cause: error,
        context: { blockNumber: number.toString() },
      });
    }
  }

  async function getReceipt(hash: Hash): Promise<NormalizedReceipt> {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      return {
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash as Hash,
        status: receipt.status === 'success' ? 'success' : 'reverted',
        from: receipt.from.toLowerCase() as `0x${string}`,
        to: receipt.to === null ? null : (receipt.to.toLowerCase() as `0x${string}`),
        logs: receipt.logs.map((log) => ({
          address: log.address.toLowerCase() as `0x${string}`,
          topics: log.topics as Hex[],
          data: log.data,
          logIndex: log.logIndex,
          removed: log.removed ?? false,
        })),
      };
    } catch (error) {
      throw new ProviderError(`Failed to fetch receipt ${hash}`, {
        retryable: true,
        cause: error,
        context: { hash },
      });
    }
  }

  async function getLogsRange(params: {
    fromBlock: bigint;
    toBlock: bigint;
    address?: `0x${string}` | `0x${string}`[];
    topics?: (Hex | Hex[] | null)[];
  }): Promise<NormalizedLog[]> {
    const logs = await publicClient.getLogs({
      fromBlock: params.fromBlock,
      toBlock: params.toBlock,
      ...(params.address ? { address: params.address } : {}),
      ...(params.topics ? { topics: params.topics } : {}),
    });
    return logs.map((log) => ({
      address: log.address.toLowerCase() as `0x${string}`,
      topics: (log.topics ?? []) as Hex[],
      data: log.data,
      logIndex: log.logIndex ?? 0,
      removed: log.removed ?? false,
      ...(log.transactionHash ? { transactionHash: log.transactionHash } : {}),
      ...(log.blockNumber !== null && log.blockNumber !== undefined
        ? { blockNumber: log.blockNumber }
        : {}),
    }));
  }

  /**
   * Bounded, adaptive log query. If the provider rejects a range as too large,
   * the range is halved recursively down to `minChunk` before surfacing an error.
   */
  async function getLogs(params: {
    fromBlock: bigint;
    toBlock: bigint;
    address?: `0x${string}` | `0x${string}`[];
    topics?: (Hex | Hex[] | null)[];
  }): Promise<NormalizedLog[]> {
    if (params.fromBlock > params.toBlock) return [];
    try {
      return await getLogsRange(params);
    } catch (error) {
      const span = params.toBlock - params.fromBlock + 1n;
      if (span <= BigInt(minChunk)) {
        throw new ProviderError(
          `eth_getLogs failed for a range of ${span.toString()} blocks (already at minimum chunk size)`,
          { retryable: false, cause: error, context: { fromBlock: params.fromBlock.toString() } },
        );
      }
      const midpoint = params.fromBlock + span / 2n - 1n;
      const left = await getLogs({ ...params, toBlock: midpoint });
      const right = await getLogs({ ...params, fromBlock: midpoint + 1n });
      return [...left, ...right];
    }
  }

  return { getHead, getConfirmedHead, getBlock, getReceipt, getLogs };
}
