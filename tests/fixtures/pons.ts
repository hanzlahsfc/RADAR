import type { Hex } from 'viem';
import type { PonsFactoryEntry } from '../../src/chain/adapters/pons-launch.js';
import { ERC20_TRANSFER_TOPIC } from '../../src/chain/adapters/erc20-transfer.js';
import type { Address } from '../../src/shared/addresses.js';
import type { NormalizedBlock, NormalizedReceipt } from '../../src/chain/types.js';
import {
  ADDRESSES,
  BLOCK_HASH_1000,
  CHAIN_ID,
  HASHES,
  NATIVE_BLOCK,
  hash,
  padAddress,
} from './common.js';

export const PONS_LAUNCH_TOPIC = hash('PonsLaunch(address,address)');

const VERIFIED_FACTORY: PonsFactoryEntry = {
  address: ADDRESSES.factory,
  version: 'v2',
  launchEventTopic: PONS_LAUNCH_TOPIC,
  creatorTopicIndex: 1,
  tokenTopicIndex: 2,
};

export const PONS_CONFIG = {
  factories: [VERIFIED_FACTORY],
  supportedVersions: ['v2'],
};

const LAUNCH_LOG = {
  address: ADDRESSES.factory,
  topics: [PONS_LAUNCH_TOPIC, padAddress(ADDRESSES.watched), padAddress(ADDRESSES.launchedToken)],
  data: '0x' as Hex,
  logIndex: 2,
  removed: false,
};

function launchReceipt(overrides: Partial<NormalizedReceipt>): NormalizedReceipt {
  return {
    transactionHash: HASHES.launch,
    blockNumber: 1000n,
    blockHash: BLOCK_HASH_1000,
    status: 'success',
    from: ADDRESSES.watched,
    to: ADDRESSES.factory,
    logs: [LAUNCH_LOG],
    ...overrides,
  };
}

export interface PonsFixture {
  name: string;
  chainId: number;
  block: NormalizedBlock;
  receipt: NormalizedReceipt;
  config: { factories: PonsFactoryEntry[]; supportedVersions: string[] };
  expectedEvents: Array<{ launchedTokenAddress: Address; creatorAddress: Address }>;
}

export const PONS_FIXTURES: PonsFixture[] = [
  {
    name: 'pons-launch-allowlisted',
    chainId: CHAIN_ID,
    block: NATIVE_BLOCK,
    receipt: launchReceipt({}),
    config: PONS_CONFIG,
    expectedEvents: [
      { launchedTokenAddress: ADDRESSES.launchedToken, creatorAddress: ADDRESSES.watched },
    ],
  },
  {
    name: 'pons-launch-non-allowlisted-rejected',
    chainId: CHAIN_ID,
    block: NATIVE_BLOCK,
    receipt: launchReceipt({
      transactionHash: HASHES.launchForeign,
      to: ADDRESSES.strangerFactory,
      logs: [{ ...LAUNCH_LOG, address: ADDRESSES.strangerFactory }],
    }),
    config: PONS_CONFIG,
    expectedEvents: [],
  },
  {
    name: 'pons-launch-unknown-signature-rejected',
    chainId: CHAIN_ID,
    block: NATIVE_BLOCK,
    receipt: launchReceipt({
      transactionHash: HASHES.launchForeign,
      logs: [
        {
          ...LAUNCH_LOG,
          topics: [
            ERC20_TRANSFER_TOPIC,
            padAddress(ADDRESSES.watched),
            padAddress(ADDRESSES.launchedToken),
          ],
        },
      ],
    }),
    config: PONS_CONFIG,
    expectedEvents: [],
  },
  {
    name: 'pons-launch-reverted-rejected',
    chainId: CHAIN_ID,
    block: NATIVE_BLOCK,
    receipt: launchReceipt({ status: 'reverted' }),
    config: PONS_CONFIG,
    expectedEvents: [],
  },
  {
    name: 'pons-launch-empty-allowlist-disabled',
    chainId: CHAIN_ID,
    block: NATIVE_BLOCK,
    receipt: launchReceipt({}),
    config: { factories: [], supportedVersions: ['v2'] },
    expectedEvents: [],
  },
];
