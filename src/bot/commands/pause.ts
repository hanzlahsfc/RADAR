import type { MiddlewareFn } from 'grammy';
import { setWatchActive } from '../../db/repositories/watched-wallets.js';
import { shortenAddress } from '../../shared/addresses.js';
import { isUuid } from '../../shared/ids.js';
import type { BotContext } from '../context.js';

/**
 * Shared implementation for /pause and /resume.
 *  - pausing keeps the row (so it can be resumed) but stops alert materialization,
 *  - resuming does NOT flood old alerts because `alertStartBlock` is unchanged
 *    and only events after it qualify.
 */
export function setWatchStateCommand(active: boolean): MiddlewareFn<BotContext> {
  return async (ctx) => {
    const account = ctx.account;
    if (!account) {
      await ctx.reply('Please open a private chat and send /start first.');
      return;
    }
    const watchId = (ctx.match ?? '').toString().trim();
    if (!isUuid(watchId)) {
      await ctx.reply(
        `Usage: /${active ? 'resume' : 'pause'} <watch-id>. Use /list to see your ids.`,
      );
      return;
    }
    const updated = await setWatchActive(ctx.dependencies.db, account.id, watchId, active);
    if (!updated) {
      await ctx.reply('No watch with that id belongs to you.');
      return;
    }
    await ctx.reply(
      active
        ? `Resumed alerts for ${shortenAddress(updated.address)}.`
        : `Paused alerts for ${shortenAddress(updated.address)}. The watch is kept and can be resumed.`,
    );
  };
}

export function pauseCommand(): MiddlewareFn<BotContext> {
  return setWatchStateCommand(false);
}
