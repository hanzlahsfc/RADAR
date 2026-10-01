import { describe, expect, it } from 'vitest';
import {
  evaluateRule,
  eventDirectionFor,
  type AlertRuleSpec,
  type WatchContext,
} from '../../src/alerts/rules.js';
import type { ChainEvent, Hash } from '../../src/chain/types.js';
import type { Address } from '../../src/shared/addresses.js';
import { ADDRESSES } from '../fixtures/index.js';

const WATCH = ADDRESSES.watched.toLowerCase() as Address;
const OTHER = ADDRESSES.other.toLowerCase() as Address;
const BLOCK_HASH = `0x${'a'.repeat(64)}` as Hash;
const TX_HASH = `0x${'b'.repeat(64)}` as Hash;

const watch: WatchContext = { watchId: 'watch-1', address: WATCH, alertStartBlock: 50n };

function makeEvent(overrides: Partial<ChainEvent> = {}): ChainEvent {
  return {
    chainId: 4663,
    blockNumber: 100n,
    blockHash: BLOCK_HASH,
    transactionHash: TX_HASH,
    eventKey: 'native:0',
    kind: 'native_transfer',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    fromAddress: WATCH,
    toAddress: OTHER,
    amountRaw: '1000000000000000000',
    tokenDecimals: 18,
    canonical: true,
    confirmationStatus: 'confirmed',
    ...overrides,
  };
}

function rule(overrides: Partial<AlertRuleSpec> = {}): AlertRuleSpec {
  return {
    id: 'rule-1',
    kind: 'eth_native',
    direction: 'both',
    thresholdRaw: null,
    enabled: true,
    ...overrides,
  };
}

describe('alert rule evaluation', () => {
  it('classifies direction relative to the watched address', () => {
    expect(eventDirectionFor(makeEvent({ toAddress: WATCH, fromAddress: OTHER }), WATCH)).toBe(
      'in',
    );
    expect(eventDirectionFor(makeEvent({ fromAddress: WATCH, toAddress: OTHER }), WATCH)).toBe(
      'out',
    );
    expect(eventDirectionFor(makeEvent({ fromAddress: WATCH, toAddress: WATCH }), WATCH)).toBe(
      'self',
    );
    expect(
      eventDirectionFor(makeEvent({ fromAddress: OTHER, toAddress: OTHER }), WATCH),
    ).toBeNull();
  });

  it('respects the configured direction', () => {
    const inbound = makeEvent({ toAddress: WATCH, fromAddress: OTHER });
    const outbound = makeEvent({ fromAddress: WATCH, toAddress: OTHER });
    expect(evaluateRule(rule({ direction: 'in' }), watch, inbound)).not.toBeNull();
    expect(evaluateRule(rule({ direction: 'in' }), watch, outbound)).toBeNull();
    expect(evaluateRule(rule({ direction: 'out' }), watch, outbound)).not.toBeNull();
    expect(evaluateRule(rule({ direction: 'both' }), watch, outbound)).not.toBeNull();
  });

  it('applies thresholds inclusively', () => {
    const exactly = makeEvent({ amountRaw: '400000000000000000' });
    const below = makeEvent({ amountRaw: '399999999999999999' });
    const spec = rule({ thresholdRaw: '400000000000000000' });
    expect(evaluateRule(spec, watch, exactly)).not.toBeNull();
    expect(evaluateRule(spec, watch, below)).toBeNull();
  });

  it('matches any amount when no threshold is configured', () => {
    expect(evaluateRule(rule({ thresholdRaw: null }), watch, makeEvent())).not.toBeNull();
  });

  it('does not satisfy a thresholded rule when the event has no amount', () => {
    const spec = rule({ thresholdRaw: '1' });
    const event = makeEvent({ amountRaw: undefined });
    expect(evaluateRule(spec, watch, event)).toBeNull();
  });

  it('emits a self-transfer exactly once', () => {
    const self = makeEvent({ fromAddress: WATCH, toAddress: WATCH });
    const match = evaluateRule(rule(), watch, self);
    expect(match).not.toBeNull();
    expect(match?.isSelfTransfer).toBe(true);
    expect(match?.direction).toBe('self');
  });

  it('ignores events at or before the watch activation block', () => {
    expect(evaluateRule(rule(), watch, makeEvent({ blockNumber: 50n }))).toBeNull();
    expect(evaluateRule(rule(), watch, makeEvent({ blockNumber: 49n }))).toBeNull();
    expect(evaluateRule(rule(), watch, makeEvent({ blockNumber: 51n }))).not.toBeNull();
  });

  it('ignores disabled rules and orphaned events', () => {
    expect(evaluateRule(rule({ enabled: false }), watch, makeEvent())).toBeNull();
    expect(
      evaluateRule(rule(), watch, makeEvent({ canonical: false, confirmationStatus: 'orphaned' })),
    ).toBeNull();
  });

  it('filters token rules by token address', () => {
    const tokenEvent = makeEvent({
      kind: 'erc20_transfer',
      eventKey: 'log:0:erc20_transfer',
      tokenAddress: ADDRESSES.token,
      fromAddress: OTHER,
      toAddress: WATCH,
    });
    expect(
      evaluateRule(
        rule({ kind: 'erc20_transfer', tokenAddress: ADDRESSES.token }),
        watch,
        tokenEvent,
      ),
    ).not.toBeNull();
    expect(
      evaluateRule(
        rule({ kind: 'erc20_transfer', tokenAddress: ADDRESSES.strangerFactory }),
        watch,
        tokenEvent,
      ),
    ).toBeNull();
  });

  it('does not match a native rule against a token event', () => {
    const tokenEvent = makeEvent({
      kind: 'erc20_transfer',
      tokenAddress: ADDRESSES.token,
      toAddress: WATCH,
      fromAddress: OTHER,
    });
    expect(evaluateRule(rule({ kind: 'eth_native' }), watch, tokenEvent)).toBeNull();
  });

  it('matches launches created by the watched address', () => {
    const launch = makeEvent({
      kind: 'token_launch',
      eventKey: 'log:2:token_launch',
      fromAddress: OTHER,
      toAddress: undefined,
      creatorAddress: WATCH,
      launchedTokenAddress: ADDRESSES.launchedToken,
      factoryAddress: ADDRESSES.factory,
    });
    expect(evaluateRule(rule({ kind: 'token_launch' }), watch, launch)).not.toBeNull();
    expect(
      evaluateRule(
        rule({ kind: 'token_launch' }),
        watch,
        makeEvent({ kind: 'token_launch', creatorAddress: OTHER }),
      ),
    ).toBeNull();
  });
});
