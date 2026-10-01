import type { MiddlewareFn } from 'grammy';
import { normalizeAddress } from '../../shared/addresses.js';
import { subtractHours } from '../../shared/clock.js';
import { listEventsForAddress, toChainEvent } from '../../db/repositories/events.js';
import { enqueueBackfillJob, getCoverage, isFullyCovered } from '../../indexer/backfill.js';
import { eventDirectionFor } from '../../alerts/rules.js';
import type { BotContext } from '../context.js';
import { renderTimelineMessage, type TimelineEntry } from '../formatters/timeline.js';

/** /recent <address> — the supported activity of the last 72 hours. */
export function recentCommand(): MiddlewareFn<BotContext> {
  return async (ctx) => {
    const account = ctx.account;
    if (!account) {
      await ctx.reply('Please open a private chat and send /start first.');
      return;
    }
    const rawAddress = (ctx.match ?? '').toString().trim().split(/\s+/).filter(Boolean)[0];
    if (!rawAddress) {
      await ctx.reply('Usage: /recent <address>');
      return;
    }
    let address: `0x${string}`;
    try {
      address = normalizeAddress(rawAddress);
    } catch {
      await ctx.reply('That does not look like a valid address.');
      return;
    }

    const { db, network, env, clock } = ctx.dependencies;
    if (!network) {
      await ctx.reply(
        'History is incomplete because the data provider is unavailable: no chain is configured yet. This does not mean there was no activity.',
      );
      return;
    }

    const chainId = BigInt(network.chainId);
    const to = clock.now();
    const from = subtractHours(to, env.MAX_BACKFILL_HOURS);
    const requested = { start: from, end: to };
    const coverage = await getCoverage(db, { chainId, address });
    const complete = isFullyCovered(requested, coverage);

    if (!complete) {
      await enqueueBackfillJob(db, { chainId, address, from, to });
      await ctx.reply(
        [
          'Processing: this interval is not fully indexed yet, so I queued a bounded backfill.',
          'You will get an accurate, coverage-aware result once indexing finishes.',
          'An incomplete interval does not mean there was no activity.',
        ].join('\n'),
      );
      return;
    }

    const rows = await listEventsForAddress(db, { chainId, address, from, to, limit: 50 });
    const entries: TimelineEntry[] = rows.map((row) => {
      const event = toChainEvent(row);
      const direction = eventDirectionFor(event, address) ?? 'in';
      return { event, direction };
    });

    await ctx.reply(
      renderTimelineMessage({
        address,
        from,
        to,
        entries,
        coverageComplete: true,
        providerAvailable: true,
      }),
      { parse_mode: 'HTML' },
    );
  };
}
