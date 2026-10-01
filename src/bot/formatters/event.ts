import { shortenAddress } from '../../shared/addresses.js';
import { formatUnitsTrimmed } from '../../shared/amounts.js';
import { asCodeSpan, escapeTelegramHtml, sanitizeUntrustedText } from '../../shared/sanitize.js';
import type { ChainEvent } from '../../chain/types.js';
import type { EventDirection } from '../../alerts/rules.js';

export interface AlertRenderInput {
  event: ChainEvent;
  watchLabel: string | null;
  direction: EventDirection;
  explorerTxUrl?: string;
}

const NATIVE_SYMBOL = 'ETH';

/**
 * Deterministic Telegram HTML for an alert. No LLM, no markup injection: all
 * untrusted text is sanitized/escaped and addresses are rendered as code spans.
 */
export function renderAlertMessage(input: AlertRenderInput): string {
  const { event } = input;
  const title = alertTitle(event, input.direction);
  const lines: string[] = [`<b>${title}</b>`, ''];

  lines.push(`Wallet: ${escapeTelegramHtml(input.watchLabel ?? 'Unlabeled')}`);
  lines.push(`${amountLabel(event, input.direction)}: ${formatAmount(event)}`);

  if (event.kind === 'token_launch') {
    if (event.creatorAddress) {
      lines.push(`Creator: ${asCodeSpan(shortenAddress(event.creatorAddress))}`);
    }
    if (event.launchedTokenAddress) {
      lines.push(`Token: ${asCodeSpan(shortenAddress(event.launchedTokenAddress))}`);
    }
  } else {
    const counterparty = input.direction === 'out' ? event.toAddress : event.fromAddress;
    if (counterparty) {
      const label = input.direction === 'out' ? 'To' : 'From';
      lines.push(`${label}: ${asCodeSpan(shortenAddress(counterparty))}`);
    }
  }

  lines.push(`Time: ${formatUtcTime(event.timestamp)}`);
  lines.push(`Status: ${statusLabel(event.confirmationStatus)}`);

  if (input.explorerTxUrl) {
    lines.push('');
    lines.push(`<a href="${escapeTelegramHtml(input.explorerTxUrl)}">View transaction</a>`);
  }

  return lines.join('\n');
}

function alertTitle(event: ChainEvent, direction: EventDirection): string {
  if (event.kind === 'native_transfer') {
    if (direction === 'out') return 'RADAR · Outgoing ETH';
    if (direction === 'self') return 'RADAR · ETH self-transfer';
    return 'RADAR · Incoming ETH';
  }
  if (event.kind === 'erc20_transfer') {
    const symbol = event.tokenSymbol ? sanitizeUntrustedText(event.tokenSymbol, 32) : 'token';
    return `RADAR · ${direction === 'out' ? 'Outgoing' : 'Incoming'} ${escapeTelegramHtml(symbol)}`;
  }
  return 'RADAR · Token launch';
}

function amountLabel(event: ChainEvent, direction: EventDirection): string {
  const verb = direction === 'out' ? 'Sent' : 'Received';
  if (event.kind === 'native_transfer') {
    return direction === 'out' ? 'Sent' : 'Received';
  }
  return verb;
}

function formatAmount(event: ChainEvent): string {
  const raw = event.amountRaw ?? '0';
  if (event.tokenDecimals === undefined) {
    // Never guess decimals: show raw units and label the limitation.
    return `${raw} raw units (decimals unavailable)`;
  }
  const value = formatUnitsTrimmed(BigInt(raw), event.tokenDecimals, 6);
  if (event.kind === 'native_transfer') {
    return `${value} ${NATIVE_SYMBOL}`;
  }
  const symbol = event.tokenSymbol
    ? escapeTelegramHtml(sanitizeUntrustedText(event.tokenSymbol, 32))
    : 'tokens';
  return `${value} ${symbol}`;
}

function formatUtcTime(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes} UTC`;
}

function statusLabel(status: ChainEvent['confirmationStatus']): string {
  switch (status) {
    case 'confirmed':
      return 'Confirmed';
    case 'pending':
      return 'Pending';
    case 'orphaned':
      return 'Orphaned (reorged)';
  }
}
