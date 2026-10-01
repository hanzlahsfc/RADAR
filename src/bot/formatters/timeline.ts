import { shortenAddress } from '../../shared/addresses.js';
import { formatUnitsTrimmed } from '../../shared/amounts.js';
import { asCodeSpan, escapeTelegramHtml, sanitizeUntrustedText } from '../../shared/sanitize.js';
import type { ChainEvent } from '../../chain/types.js';
import type { EventDirection } from '../../alerts/rules.js';

export interface TimelineEntry {
  event: ChainEvent;
  direction: EventDirection;
}

export interface TimelineView {
  address: string;
  from: Date;
  to: Date;
  entries: TimelineEntry[];
  /** True only when the whole requested interval has verified coverage. */
  coverageComplete: boolean;
  /** False when the provider was unavailable (incomplete, not empty). */
  providerAvailable: boolean;
  note?: string;
}

export const NO_ACTIVITY_MESSAGE = 'No supported activity found in a fully indexed interval.';
export const INCOMPLETE_MESSAGE =
  'History is incomplete because the data provider is unavailable. This does not mean there was no activity.';

/** Render the 72-hour timeline, clearly distinguishing empty from incomplete. */
export function renderTimelineMessage(view: TimelineView): string {
  const lines: string[] = ['<b>RADAR · Recent activity</b>', ''];
  lines.push(`Wallet: ${asCodeSpan(shortenAddress(view.address))}`);
  lines.push(`Window: ${formatWindow(view.from, view.to)}`);
  lines.push('');

  if (!view.providerAvailable) {
    lines.push(escapeTelegramHtml(INCOMPLETE_MESSAGE));
    if (view.note) lines.push(escapeTelegramHtml(view.note));
    return lines.join('\n');
  }

  if (view.entries.length === 0) {
    lines.push(
      view.coverageComplete ? NO_ACTIVITY_MESSAGE : escapeTelegramHtml(INCOMPLETE_MESSAGE),
    );
    if (view.note) lines.push(escapeTelegramHtml(view.note));
    return lines.join('\n');
  }

  lines.push(`<b>${view.entries.length} event(s)</b>`);
  for (const entry of view.entries) {
    lines.push(renderEntry(entry));
  }
  if (!view.coverageComplete) {
    lines.push('');
    lines.push(escapeTelegramHtml(`Coverage note: ${view.note ?? INCOMPLETE_MESSAGE}`));
  }
  return lines.join('\n');
}

function renderEntry(entry: TimelineEntry): string {
  const { event, direction } = entry;
  const verb = direction === 'out' ? 'Sent' : direction === 'self' ? 'Self' : 'Received';
  const amount = formatTimelineAmount(event);
  const time = formatUtcDateTime(event.timestamp);
  const counterparty =
    direction === 'out' ? event.toAddress : direction === 'self' ? undefined : event.fromAddress;
  const where = counterparty ? ` · ${asCodeSpan(shortenAddress(counterparty))}` : '';
  return `• ${time} — ${verb} ${amount}${where}`;
}

function formatTimelineAmount(event: ChainEvent): string {
  const raw = event.amountRaw ?? '0';
  if (event.tokenDecimals === undefined) {
    return `${raw} raw units (decimals unavailable)`;
  }
  const value = formatUnitsTrimmed(BigInt(raw), event.tokenDecimals, 6);
  if (event.kind === 'native_transfer') return `${value} ETH`;
  const symbol = event.tokenSymbol
    ? escapeTelegramHtml(sanitizeUntrustedText(event.tokenSymbol, 16))
    : 'tokens';
  return `${value} ${symbol}`;
}

function formatWindow(from: Date, to: Date): string {
  return `${formatUtcDateTime(from)} → ${formatUtcDateTime(to)}`;
}

function formatUtcDateTime(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
