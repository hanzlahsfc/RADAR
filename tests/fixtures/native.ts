import type { Address } from '../../src/shared/addresses.js';
import type { Hash, NormalizedBlock } from '../../src/chain/types.js';
import { ADDRESSES, CHAIN_ID, FAILED_NATIVE_HASHES, HASHES, NATIVE_BLOCK } from './common.js';

export interface NativeFixture {
  name: string;
  chainId: number;
  block: NormalizedBlock;
  failedHashes?: ReadonlySet<string>;
  expectedEvents: Array<{ transactionHash: Hash; amountRaw: string; toAddress?: Address }>;
}

export const NATIVE_FIXTURES: NativeFixture[] = [
  {
    name: 'block-1000-native',
    chainId: CHAIN_ID,
    block: NATIVE_BLOCK,
    expectedEvents: [
      {
        transactionHash: HASHES.nativeIn,
        amountRaw: '400000000000000000',
        toAddress: ADDRESSES.watched,
      },
      {
        transactionHash: HASHES.nativeOut,
        amountRaw: '1000000000000000000',
        toAddress: ADDRESSES.other,
      },
    ],
  },
  {
    name: 'block-1000-native-exclude-reverted',
    chainId: CHAIN_ID,
    block: NATIVE_BLOCK,
    failedHashes: FAILED_NATIVE_HASHES,
    expectedEvents: [
      {
        transactionHash: HASHES.nativeIn,
        amountRaw: '400000000000000000',
        toAddress: ADDRESSES.watched,
      },
    ],
  },
];
