import { escapeTelegramHtml } from '../../shared/sanitize.js';

export interface FreshnessView {
  chainId: number | null;
  providerKind: string;
  configured: boolean;
  headBlock: bigint | null;
  confirmedHead: bigint | null;
  lastProcessedBlock: bigint | null;
  lagBlocks: bigint | null;
  stale: boolean;
  note?: string;
}

export interface StatusView {
  watches: number;
  maxWatches: number;
  pendingAlerts: number;
  freshness: FreshnessView;
  limitations: string[];
}

/**
 * Render the freshness/coverage status. Provider problems are shown explicitly
 * (a visible stale state) rather than hidden behind a healthy-looking message.
 */
export function renderStatusMessage(view: StatusView): string {
  const lines: string[] = ['<b>RADAR status</b>', ''];
  lines.push(`Watches: ${view.watches}/${view.maxWatches}`);
  lines.push(`Pending alerts: ${view.pendingAlerts}`);
  lines.push('');

  lines.push('<b>Indexing freshness</b>');
  const f = view.freshness;
  if (!f.configured) {
    lines.push('Chain not configured (offline foundation mode).');
  } else {
    lines.push(`Chain: ${f.chainId ?? 'unknown'} (${escapeTelegramHtml(f.providerKind)})`);
    lines.push(`Head: ${f.headBlock ?? 'unavailable'}`);
    lines.push(`Confirmed head: ${f.confirmedHead ?? 'unavailable'}`);
    lines.push(`Last processed: ${f.lastProcessedBlock ?? 'never'}`);
    if (f.lagBlocks !== null) {
      lines.push(`Lag: ${f.lagBlocks} blocks`);
    }
    lines.push(`State: ${f.stale ? 'STALE — provider or indexer behind' : 'current'}`);
  }
  if (f.note) {
    lines.push(`Note: ${escapeTelegramHtml(f.note)}`);
  }

  if (view.limitations.length > 0) {
    lines.push('');
    lines.push('<b>Coverage limitations</b>');
    for (const limitation of view.limitations) {
      lines.push(`• ${escapeTelegramHtml(limitation)}`);
    }
  }

  return lines.join('\n');
}
