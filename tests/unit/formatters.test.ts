import { describe, expect, it } from 'vitest';
import { renderAlertMessage } from '../../src/bot/formatters/event.js';
import {
  renderTimelineMessage,
  NO_ACTIVITY_MESSAGE,
  INCOMPLETE_MESSAGE,
} from '../../src/bot/formatters/timeline.js';
import type { ChainEvent } from '../../src/chain/types.js';
import { ADDRESSES } from '../fixtures/index.js';

const BLOCK_HASH = `0x${'a'.repeat(64)}` as const;
const TX_HASH = `0x${'b'.repeat(64)}` as const;

function makeEvent(overrides: Partial<ChainEvent> = {}): ChainEvent {
  return {
    chainId: 4663,
    blockNumber: 100n,
    blockHash: BLOCK_HASH,
    transactionHash: TX_HASH,
    eventKey: 'native:0',
    kind: 'native_transfer',
    timestamp: new Date('2026-01-01T14:03:00.000Z'),
    fromAddress: ADDRESSES.other,
    toAddress: ADDRESSES.watched,
    amountRaw: '400000000000000000',
    tokenDecimals: 18,
    canonical: true,
    confirmationStatus: 'confirmed',
    ...overrides,
  };
}

describe('alert message formatting', () => {
  it('renders the documented incoming-ETH template', () => {
    const message = renderAlertMessage({
      event: makeEvent(),
      watchLabel: 'Launch wallet',
      direction: 'in',
      explorerTxUrl: 'https://explorer.example/tx/0xabc',
    });
    expect(message).toContain('RADAR · Incoming ETH');
    expect(message).toContain('Wallet: Launch wallet');
    expect(message).toContain('0.4 ETH');
    expect(message).toContain('14:03 UTC');
    expect(message).toContain('Status: Confirmed');
    expect(message).toContain('https://explorer.example/tx/0xabc');
  });

  it('labels raw units when token decimals are unavailable', () => {
    const message = renderAlertMessage({
      event: makeEvent({
        kind: 'erc20_transfer',
        tokenDecimals: undefined,
        tokenSymbol: undefined,
      }),
      watchLabel: null,
      direction: 'in',
    });
    expect(message).toContain('raw units (decimals unavailable)');
  });

  it('escapes malicious token symbols', () => {
    const message = renderAlertMessage({
      event: makeEvent({ kind: 'erc20_transfer', tokenSymbol: '<b>EVIL</b>' }),
      watchLabel: null,
      direction: 'in',
    });
    expect(message).not.toContain('<b>EVIL</b>');
    expect(message).toContain('&lt;b&gt;EVIL&lt;/b&gt;');
  });

  it('renders outgoing transfers with the counterparty as the recipient', () => {
    const message = renderAlertMessage({
      event: makeEvent({ fromAddress: ADDRESSES.watched, toAddress: ADDRESSES.other }),
      watchLabel: 'Launch wallet',
      direction: 'out',
    });
    expect(message).toContain('RADAR · Outgoing ETH');
    expect(message).toContain('To:');
  });

  it('renders launches without pretending they are a purchase', () => {
    const message = renderAlertMessage({
      event: makeEvent({
        kind: 'token_launch',
        eventKey: 'log:2:token_launch',
        creatorAddress: ADDRESSES.watched,
        launchedTokenAddress: ADDRESSES.launchedToken,
        factoryAddress: ADDRESSES.factory,
        fromAddress: ADDRESSES.other,
        toAddress: undefined,
      }),
      watchLabel: 'Deployer',
      direction: 'in',
    });
    expect(message).toContain('RADAR · Token launch');
    expect(message.toLowerCase()).not.toContain('purchase');
  });
});

describe('timeline message formatting', () => {
  const window = {
    from: new Date('2026-01-01T00:00:00.000Z'),
    to: new Date('2026-01-02T00:00:00.000Z'),
  };

  it('distinguishes "no activity" from "incomplete data"', () => {
    const empty = renderTimelineMessage({
      address: ADDRESSES.watched,
      ...window,
      entries: [],
      coverageComplete: true,
      providerAvailable: true,
    });
    expect(empty).toContain(NO_ACTIVITY_MESSAGE);

    const incomplete = renderTimelineMessage({
      address: ADDRESSES.watched,
      ...window,
      entries: [],
      coverageComplete: false,
      providerAvailable: false,
    });
    expect(incomplete).toContain(INCOMPLETE_MESSAGE);
  });

  it('lists entries when activity exists', () => {
    const message = renderTimelineMessage({
      address: ADDRESSES.watched,
      ...window,
      entries: [{ event: makeEvent(), direction: 'in' }],
      coverageComplete: true,
      providerAvailable: true,
    });
    expect(message).toContain('1 event(s)');
    expect(message).toContain('0.4 ETH');
  });
});
