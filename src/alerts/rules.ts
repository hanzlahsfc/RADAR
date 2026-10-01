import { meetsThreshold, rawFromString } from '../shared/amounts.js';
import type { ChainEvent } from '../chain/types.js';

export type AlertKind = 'eth_native' | 'erc20_transfer' | 'token_launch';
export type AlertDirection = 'in' | 'out' | 'both';
export type EventDirection = 'in' | 'out' | 'self';

export interface AlertRuleSpec {
  id: string;
  kind: AlertKind;
  tokenAddress?: string | null;
  direction: AlertDirection;
  /** Exact base-unit threshold as a decimal string (wei for ETH). */
  thresholdRaw?: string | null;
  enabled: boolean;
}

export interface WatchContext {
  watchId: string;
  /** Normalized (lowercase) watched address. */
  address: string;
  /** Only events strictly after this block qualify for live alerts. */
  alertStartBlock: bigint;
}

export interface RuleMatch {
  ruleId: string;
  watchId: string;
  direction: EventDirection;
  isSelfTransfer: boolean;
}

/** Direction of an event relative to a watched address, or null if unrelated. */
export function eventDirectionFor(event: ChainEvent, address: string): EventDirection | null {
  const from = event.fromAddress?.toLowerCase();
  const to = event.toAddress?.toLowerCase();
  const creator = event.creatorAddress?.toLowerCase();
  const watched = address.toLowerCase();

  if (event.kind === 'token_launch') {
    return creator === watched ? 'in' : null;
  }
  if (from === watched && to === watched) return 'self';
  if (to === watched) return 'in';
  if (from === watched) return 'out';
  return null;
}

/**
 * Evaluate a single rule against one event for one watch.
 * Returns a match, or null when the rule does not apply.
 *
 * Guarantees:
 *  - threshold comparison is inclusive (amount >= threshold),
 *  - self-transfers match at most once (a single RuleMatch),
 *  - events at or before the watch's activation block never match.
 */
export function evaluateRule(
  rule: AlertRuleSpec,
  watch: WatchContext,
  event: ChainEvent,
): RuleMatch | null {
  if (!rule.enabled) return null;
  if (!event.canonical || event.confirmationStatus === 'orphaned') return null;
  if (event.blockNumber <= watch.alertStartBlock) return null;

  const direction = eventDirectionFor(event, watch.address);
  if (!direction) return null;

  if (rule.kind === 'eth_native') {
    if (event.kind !== 'native_transfer') return null;
  } else if (rule.kind === 'erc20_transfer') {
    if (event.kind !== 'erc20_transfer') return null;
    if (
      rule.tokenAddress &&
      event.tokenAddress?.toLowerCase() !== rule.tokenAddress.toLowerCase()
    ) {
      return null;
    }
  } else if (rule.kind === 'token_launch') {
    if (event.kind !== 'token_launch') return null;
  }

  if (direction !== 'self') {
    if (rule.direction === 'in' && direction !== 'in') return null;
    if (rule.direction === 'out' && direction !== 'out') return null;
  }

  if (!passesThreshold(rule, event)) return null;

  return {
    ruleId: rule.id,
    watchId: watch.watchId,
    direction,
    isSelfTransfer: direction === 'self',
  };
}

function passesThreshold(rule: AlertRuleSpec, event: ChainEvent): boolean {
  if (rule.thresholdRaw === null || rule.thresholdRaw === undefined) {
    return true;
  }
  if (event.amountRaw === null || event.amountRaw === undefined) {
    // A thresholded rule cannot be satisfied by an event with no amount.
    return false;
  }
  return meetsThreshold(rawFromString(event.amountRaw), rawFromString(rule.thresholdRaw));
}
