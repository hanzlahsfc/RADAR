import { keccak256, toHex, type Hex } from 'viem';
import type { Address } from '../../src/shared/addresses.js';
import type { Hash, NormalizedBlock } from '../../src/chain/types.js';

/** Deterministic, obviously-synthetic values. No real chain data is asserted. */
export const CHAIN_ID = 4663;

export const ADDRESSES = {
  watched: '0x1111111111111111111111111111111111111111' as Address,
  other: '0x2222222222222222222222222222222222222222' as Address,
  token: '0x3333333333333333333333333333333333333333' as Address,
  factory: '0x4444444444444444444444444444444444444444' as Address,
  strangerFactory: '0x5555555555555555555555555555555555555555' as Address,
  launchedToken: '0x6666666666666666666666666666666666666666' as Address,
};

export function hash(seed: string): Hash {
  return keccak256(toHex(seed));
}

export function padAddress(address: string): Hex {
  return `0x${address.toLowerCase().replace(/^0x/, '').padStart(64, '0')}` as Hex;
}

export function padUint(value: bigint): Hex {
  return `0x${value.toString(16).padStart(64, '0')}` as Hex;
}

export const HASHES = {
  nativeIn: hash('native-in'),
  nativeOut: hash('native-out'),
  nativeZero: hash('native-zero'),
  erc20: hash('erc20-transfer'),
  erc20Reverted: hash('erc20-reverted'),
  launch: hash('pons-launch'),
  launchForeign: hash('foreign-launch'),
};

export const BLOCK_HASH_1000 = hash('block-1000');
export const BLOCK_HASH_1001 = hash('block-1001');
export const PARENT_OF_1000 = hash('block-0999');

/** Block 1000: two value-bearing transfers (in/out) and one zero-value tx. */
export const NATIVE_BLOCK: NormalizedBlock = {
  number: 1000n,
  hash: BLOCK_HASH_1000,
  parentHash: PARENT_OF_1000,
  timestamp: new Date('2026-01-01T12:00:00.000Z'),
  transactions: [
    {
      hash: HASHES.nativeIn,
      from: ADDRESSES.other,
      to: ADDRESSES.watched,
      value: 400000000000000000n,
      input: '0x',
      nonce: 1,
      transactionIndex: 0,
    },
    {
      hash: HASHES.nativeOut,
      from: ADDRESSES.watched,
      to: ADDRESSES.other,
      value: 1000000000000000000n,
      input: '0x',
      nonce: 2,
      transactionIndex: 1,
    },
    {
      hash: HASHES.nativeZero,
      from: ADDRESSES.other,
      to: ADDRESSES.watched,
      value: 0n,
      input: '0x',
      nonce: 3,
      transactionIndex: 2,
    },
  ],
};

/** Lowercase hashes of transactions whose receipts reverted. */
export const FAILED_NATIVE_HASHES: ReadonlySet<string> = new Set([HASHES.nativeOut.toLowerCase()]);
