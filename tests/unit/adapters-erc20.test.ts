import { describe, expect, it } from 'vitest';
import type { Hex } from 'viem';
import {
  ERC20_TRANSFER_TOPIC,
  decodeErc20Transfers,
} from '../../src/chain/adapters/erc20-transfer.js';
import type { NormalizedReceipt } from '../../src/chain/types.js';
import {
  ADDRESSES,
  BLOCK_HASH_1000,
  CHAIN_ID,
  ERC20_FIXTURES,
  NATIVE_BLOCK,
  padAddress,
} from '../fixtures/index.js';

const tokenMeta = new Map([[ADDRESSES.token.toLowerCase(), { decimals: 18, symbol: 'PONS' }]]);

describe('ERC-20 transfer decoding', () => {
  it('decodes a standard Transfer log into an exact-base-unit event', () => {
    const fixture = ERC20_FIXTURES[0]!;
    const events = decodeErc20Transfers(fixture.block, fixture.receipt, fixture.chainId, {
      tokenMetadata: tokenMeta,
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.eventKey).toBe('log:0:erc20_transfer');
    expect(events[0]?.amountRaw).toBe('1000000000000000000');
    expect(events[0]?.fromAddress).toBe(ADDRESSES.watched);
    expect(events[0]?.toAddress).toBe(ADDRESSES.other);
    expect(events[0]?.tokenDecimals).toBe(18);
  });

  it('ignores reverted receipts entirely', () => {
    const fixture = ERC20_FIXTURES[1]!;
    expect(fixture.receipt.status).toBe('reverted');
    const events = decodeErc20Transfers(fixture.block, fixture.receipt, fixture.chainId, {
      tokenMetadata: tokenMeta,
    });
    expect(events).toHaveLength(0);
  });

  it('ignores logs with an unknown signature', () => {
    const receipt: NormalizedReceipt = {
      transactionHash: ERC20_FIXTURES[0]!.receipt.transactionHash,
      blockNumber: 1000n,
      blockHash: BLOCK_HASH_1000,
      status: 'success',
      from: ADDRESSES.watched,
      to: ADDRESSES.token,
      logs: [
        {
          address: ADDRESSES.token,
          topics: [
            ('0x' + 'ab'.repeat(32)) as Hex,
            padAddress(ADDRESSES.watched),
            padAddress(ADDRESSES.other),
          ],
          data: '0x01' as Hex,
          logIndex: 0,
          removed: false,
        },
      ],
    };
    expect(
      decodeErc20Transfers(NATIVE_BLOCK, receipt, CHAIN_ID, { tokenMetadata: tokenMeta }),
    ).toHaveLength(0);
  });

  it('ignores anonymous (non-indexed) transfer logs', () => {
    const receipt: NormalizedReceipt = {
      transactionHash: ERC20_FIXTURES[0]!.receipt.transactionHash,
      blockNumber: 1000n,
      blockHash: BLOCK_HASH_1000,
      status: 'success',
      from: ADDRESSES.watched,
      to: ADDRESSES.token,
      logs: [
        {
          address: ADDRESSES.token,
          topics: [ERC20_TRANSFER_TOPIC],
          data: '0x01' as Hex,
          logIndex: 0,
          removed: false,
        },
      ],
    };
    expect(decodeErc20Transfers(NATIVE_BLOCK, receipt, CHAIN_ID)).toHaveLength(0);
  });

  it('omits token decimals when metadata is unavailable rather than guessing', () => {
    const fixture = ERC20_FIXTURES[0]!;
    const events = decodeErc20Transfers(fixture.block, fixture.receipt, fixture.chainId);
    expect(events[0]?.tokenDecimals).toBeUndefined();
    expect(events[0]?.amountRaw).toBe('1000000000000000000');
  });
});
