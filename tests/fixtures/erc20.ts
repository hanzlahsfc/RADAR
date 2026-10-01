import { ERC20_TRANSFER_TOPIC } from '../../src/chain/adapters/erc20-transfer.js';
import type { Address } from '../../src/shared/addresses.js';
import type { NormalizedBlock, NormalizedLog, NormalizedReceipt } from '../../src/chain/types.js';
import {
  ADDRESSES,
  BLOCK_HASH_1000,
  CHAIN_ID,
  HASHES,
  NATIVE_BLOCK,
  padAddress,
  padUint,
} from './common.js';

export const ERC20_TOKEN = { address: ADDRESSES.token, symbol: 'PONS', decimals: 18 };

const TRANSFER_LOG: NormalizedLog = {
  address: ADDRESSES.token,
  topics: [ERC20_TRANSFER_TOPIC, padAddress(ADDRESSES.watched), padAddress(ADDRESSES.other)],
  data: padUint(1000000000000000000n),
  logIndex: 0,
  removed: false,
};

const ERC20_RECEIPT: NormalizedReceipt = {
  transactionHash: HASHES.erc20,
  blockNumber: 1000n,
  blockHash: BLOCK_HASH_1000,
  status: 'success',
  from: ADDRESSES.watched,
  to: ADDRESSES.token,
  logs: [TRANSFER_LOG],
};

/** A reverted receipt whose Transfer log must be ignored entirely. */
const ERC20_REVERTED_RECEIPT: NormalizedReceipt = {
  ...ERC20_RECEIPT,
  transactionHash: HASHES.erc20Reverted,
  status: 'reverted',
};

export interface Erc20Fixture {
  name: string;
  chainId: number;
  block: NormalizedBlock;
  receipt: NormalizedReceipt;
  transferLog: NormalizedLog;
  token: { address: Address; symbol: string; decimals: number };
  expectedEvents: Array<{
    eventKey: string;
    amountRaw: string;
    fromAddress: Address;
    toAddress: Address;
  }>;
}

export const ERC20_FIXTURES: Erc20Fixture[] = [
  {
    name: 'erc20-transfer-in',
    chainId: CHAIN_ID,
    block: NATIVE_BLOCK,
    receipt: ERC20_RECEIPT,
    transferLog: TRANSFER_LOG,
    token: ERC20_TOKEN,
    expectedEvents: [
      {
        eventKey: 'log:0:erc20_transfer',
        amountRaw: '1000000000000000000',
        fromAddress: ADDRESSES.watched,
        toAddress: ADDRESSES.other,
      },
    ],
  },
  {
    name: 'erc20-reverted-ignored',
    chainId: CHAIN_ID,
    block: NATIVE_BLOCK,
    receipt: ERC20_REVERTED_RECEIPT,
    transferLog: TRANSFER_LOG,
    token: ERC20_TOKEN,
    expectedEvents: [],
  },
];
