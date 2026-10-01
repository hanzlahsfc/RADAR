import type { ChainEvent, NormalizedBlock } from '../types.js';

export interface NativeDecodeOptions {
  /** Transaction hashes whose receipts reverted; these must be excluded. */
  failedHashes?: ReadonlySet<string>;
}

/**
 * Decode top-level native (ETH) transfers from a normalized block.
 * Only transactions with a non-zero value are emitted. Failed transactions are
 * excluded when their hashes are supplied.
 */
export function decodeNativeTransfers(
  block: NormalizedBlock,
  chainId: number,
  options: NativeDecodeOptions = {},
): ChainEvent[] {
  const failed = options.failedHashes;
  const events: ChainEvent[] = [];

  for (const tx of block.transactions) {
    if (tx.value <= 0n) continue;
    if (failed?.has(tx.hash.toLowerCase())) continue;

    events.push({
      chainId,
      blockNumber: block.number,
      blockHash: block.hash,
      transactionHash: tx.hash,
      eventKey: 'native:0',
      kind: 'native_transfer',
      timestamp: block.timestamp,
      fromAddress: tx.from,
      ...(tx.to ? { toAddress: tx.to } : {}),
      amountRaw: tx.value.toString(),
      tokenDecimals: 18,
      canonical: true,
      confirmationStatus: 'confirmed',
    });
  }
  return events;
}
