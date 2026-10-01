import type { MiddlewareFn } from 'grammy';
import { countPendingAlerts } from '../../alerts/outbox.js';
import { countActiveWatches } from '../../db/repositories/watched-wallets.js';
import { listCursors } from '../../indexer/checkpoints.js';
import type { BotContext } from '../context.js';
import { renderStatusMessage, type FreshnessView } from '../formatters/status.js';

/** /status — indexing freshness and coverage limitations. */
export function statusCommand(): MiddlewareFn<BotContext> {
  return async (ctx) => {
    const { db, env, network, freshness } = ctx.dependencies;
    const account = ctx.account;

    const watches = account ? await countActiveWatches(db, account.id) : 0;
    const pending = account ? await countPendingAlerts(db, account.id) : 0;

    let view: FreshnessView;
    if (freshness) {
      view = await freshness();
    } else {
      const cursors = network ? await listCursors(db, BigInt(network.chainId)) : [];
      const lastProcessed = cursors.reduce<bigint | null>((max, cursor) => {
        if (max === null || cursor.lastProcessedBlock > max) return cursor.lastProcessedBlock;
        return max;
      }, null);
      view = {
        chainId: network?.chainId ?? null,
        providerKind: network?.historyProvider ?? 'disabled',
        configured: network !== null,
        headBlock: null,
        confirmedHead: null,
        lastProcessedBlock: lastProcessed,
        lagBlocks: null,
        stale: false,
        note: network
          ? 'Head height is tracked by the worker; run `pnpm verify:network` for live checks.'
          : 'Offline foundation mode: no chain is configured.',
      };
    }

    const limitations = [
      'Token transfers require verified explorer/token coverage; native transfers come from block scanning.',
      'Pons launch alerts stay disabled until a factory deployment is verified.',
      'An empty result is only reported as "no activity" when the interval has verified coverage.',
    ];

    await ctx.reply(
      renderStatusMessage({
        watches,
        maxWatches: env.MAX_WATCHES_PER_ACCOUNT,
        pendingAlerts: pending,
        freshness: view,
        limitations,
      }),
      { parse_mode: 'HTML' },
    );
  };
}
