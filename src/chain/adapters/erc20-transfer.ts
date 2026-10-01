import { keccak256, toHex, type Hex } from 'viem';
import type { Address } from '../../shared/addresses.js';
import type { ChainEvent, NormalizedBlock, NormalizedReceipt } from '../types.js';

/** keccak256("Transfer(address,address,uint256)") */
export const ERC20_TRANSFER_SIGNATURE = 'Transfer(address,address,uint256)';
export const ERC20_TRANSFER_TOPIC = keccak256(toHex(ERC20_TRANSFER_SIGNATURE)).toLowerCase() as Hex;

export interface Erc20TokenMeta {
  decimals?: number;
  symbol?: string;
}

export interface Erc20DecodeOptions {
  /** Keyed by lowercase token address. */
  tokenMetadata?: ReadonlyMap<string, Erc20TokenMeta>;
}

/**
 * Decode ERC-20 Transfer logs from a receipt. Only successful receipts with a
 * canonical (non-removed) log and a well-formed Transfer topic produce events.
 * Amounts are exact integers (raw base units).
 */
export function decodeErc20Transfers(
  block: NormalizedBlock,
  receipt: NormalizedReceipt,
  chainId: number,
  options: Erc20DecodeOptions = {},
): ChainEvent[] {
  if (receipt.status !== 'success') {
    return [];
  }

  const events: ChainEvent[] = [];
  for (const log of receipt.logs) {
    if (log.removed) continue;
    if (log.topics.length !== 3) continue;
    const topic0 = log.topics[0]?.toLowerCase();
    if (topic0 !== ERC20_TRANSFER_TOPIC) continue;

    const from = addressFromTopic(log.topics[1]);
    const to = addressFromTopic(log.topics[2]);
    if (!from || !to) continue;

    let amountRaw: string;
    try {
      amountRaw = BigInt(log.data).toString();
    } catch {
      continue;
    }

    const meta = options.tokenMetadata?.get(log.address.toLowerCase());
    events.push({
      chainId,
      blockNumber: block.number,
      blockHash: block.hash,
      transactionHash: receipt.transactionHash,
      eventKey: `log:${log.logIndex}:erc20_transfer`,
      kind: 'erc20_transfer',
      timestamp: block.timestamp,
      fromAddress: from,
      toAddress: to,
      tokenAddress: log.address,
      amountRaw,
      ...(meta?.decimals !== undefined ? { tokenDecimals: meta.decimals } : {}),
      ...(meta?.symbol !== undefined ? { tokenSymbol: meta.symbol } : {}),
      canonical: true,
      confirmationStatus: 'confirmed',
    });
  }
  return events;
}

function addressFromTopic(topic: Hex | undefined): Address | undefined {
  if (!topic) return undefined;
  const hex = topic.toLowerCase();
  if (hex.length !== 66) return undefined;
  return `0x${hex.slice(26)}` as Address;
}
