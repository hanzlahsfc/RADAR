import { describe, expect, it } from 'vitest';
import { decodeNativeTransfers } from '../../src/chain/adapters/native-transfer.js';
import {
  ADDRESSES,
  CHAIN_ID,
  FAILED_NATIVE_HASHES,
  NATIVE_BLOCK,
  NATIVE_FIXTURES,
} from '../fixtures/index.js';

describe('native transfer decoding', () => {
  it('emits only value-bearing transactions', () => {
    const events = decodeNativeTransfers(NATIVE_BLOCK, CHAIN_ID);
    // Three transactions, one has value 0 → two events.
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.eventKey)).toEqual(['native:0', 'native:0']);
  });

  it('preserves exact wei amounts as decimal strings', () => {
    const events = decodeNativeTransfers(NATIVE_BLOCK, CHAIN_ID);
    expect(events.map((event) => event.amountRaw)).toEqual([
      '400000000000000000',
      '1000000000000000000',
    ]);
  });

  it('marks events as confirmed and canonical with native decimals', () => {
    const [event] = decodeNativeTransfers(NATIVE_BLOCK, CHAIN_ID);
    expect(event?.confirmationStatus).toBe('confirmed');
    expect(event?.canonical).toBe(true);
    expect(event?.tokenDecimals).toBe(18);
    expect(event?.kind).toBe('native_transfer');
  });

  it('excludes failed (reverted) transactions when hashes are supplied', () => {
    const events = decodeNativeTransfers(NATIVE_BLOCK, CHAIN_ID, {
      failedHashes: FAILED_NATIVE_HASHES,
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.toAddress).toBe(ADDRESSES.watched);
  });

  it('matches the committed fixtures', () => {
    for (const fixture of NATIVE_FIXTURES) {
      const events = decodeNativeTransfers(fixture.block, fixture.chainId, {
        ...(fixture.failedHashes ? { failedHashes: fixture.failedHashes } : {}),
      });
      expect(events).toHaveLength(fixture.expectedEvents.length);
      for (const [index, expected] of fixture.expectedEvents.entries()) {
        expect(events[index]?.transactionHash).toBe(expected.transactionHash);
        expect(events[index]?.amountRaw).toBe(expected.amountRaw);
      }
    }
  });
});
