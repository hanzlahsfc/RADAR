import type { Hex } from 'viem';
import type { Address } from '../shared/addresses.js';

export type Hash = `0x${string}`;

export type EventKind = 'native_transfer' | 'erc20_transfer' | 'token_launch';
export type ConfirmationStatus = 'pending' | 'confirmed' | 'orphaned';

/**
 * Application-level normalized event. Amounts are preserved as exact integer
 * decimal strings (never floating point).
 */
export interface ChainEvent {
  chainId: number;
  blockNumber: bigint;
  blockHash: Hash;
  transactionHash: Hash;

  /** "native:0" or "log:<logIndex>:<decodedEventKind>" */
  eventKey: string;

  kind: EventKind;
  timestamp: Date;

  fromAddress?: Address;
  toAddress?: Address;
  tokenAddress?: Address;

  amountRaw?: string;
  tokenDecimals?: number;
  tokenSymbol?: string;

  factoryAddress?: Address;
  creatorAddress?: Address;
  launchedTokenAddress?: Address;

  canonical: boolean;
  confirmationStatus: ConfirmationStatus;
}

export interface NormalizedLog {
  address: Address;
  topics: Hex[];
  data: Hex;
  logIndex: number;
  removed: boolean;
  /** Present for logs obtained via eth_getLogs (needed to group by transaction). */
  transactionHash?: Hash;
  blockNumber?: bigint;
}

export interface NormalizedTransaction {
  hash: Hash;
  from: Address;
  to: Address | null;
  value: bigint;
  input: Hex;
  nonce: number;
  transactionIndex: number;
}

export interface NormalizedBlock {
  number: bigint;
  hash: Hash;
  parentHash: Hash;
  timestamp: Date;
  transactions: NormalizedTransaction[];
}

export interface NormalizedReceipt {
  transactionHash: Hash;
  blockNumber: bigint;
  blockHash: Hash;
  status: 'success' | 'reverted';
  from: Address;
  to: Address | null;
  logs: NormalizedLog[];
}

export interface HistoryQuery {
  address: Address;
  fromTimestamp: Date;
  toTimestamp: Date;
  cursor?: string;
  limit: number;
}

export interface TransactionCandidate {
  hash: Hash;
  blockNumber: bigint;
}

export interface HistoryPage {
  transactions: TransactionCandidate[];
  nextCursor?: string;
  /** False when the provider could not return everything (paginate further). */
  complete: boolean;
}

export interface HistoryProvider {
  readonly kind: 'explorer' | 'rpc' | 'fixture';
  getAddressHistory(query: HistoryQuery): Promise<HistoryPage>;
}

export interface ChainReader {
  /** Latest observed head block number. */
  getHead(): Promise<bigint>;
  /** Head adjusted by the configured finality policy. */
  getConfirmedHead(): Promise<bigint>;
  getBlock(number: bigint): Promise<NormalizedBlock>;
  getReceipt(hash: Hash): Promise<NormalizedReceipt>;
  /** Bounded event-log query; implementations must chunk adaptively. */
  getLogs(params: {
    fromBlock: bigint;
    toBlock: bigint;
    address?: Address | Address[];
    topics?: (Hex | Hex[] | null)[];
  }): Promise<NormalizedLog[]>;
}
