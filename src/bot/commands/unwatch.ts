import type { MiddlewareFn } from 'grammy';
import { cancelUnsentAlerts } from '../../alerts/outbox.js';
import { removeWatch } from '../../db/repositories/watched-wallets.js';
import { shortenAddress } from '../../shared/addresses.js';
import { isUuid } from '../../shared/ids.js';
import type { BotContext } from '../context.js';

/** /unwatch <watch-id> — remove a watch and cancel its unsent alerts. */
export function unwatchCommand(): MiddlewareFn<BotContext> {
  return async (ctx) => {
    const account = ctx.account;
    if (!account) {
      await ctx.reply('Please open a private chat and send /start first.');
      return;
    }
    const watchId = (ctx.match ?? '').toString().trim();
    if (!isUuid(watchId)) {
      await ctx.reply('Usage: /unwatch <watch-id>. Use /list to see your watch ids.');
      return;
    }
    const removed = await removeWatch(ctx.dependencies.db, account.id, watchId);
    if (!removed) {
      await ctx.reply('No watch with that id belongs to you.');
      return;
    }
    const cancelled = await cancelUnsentAlerts(ctx.dependencies.db, { watchId });
    await ctx.reply(
      `Stopped watching ${shortenAddress(removed.address)}. Cancelled ${cancelled} unsent alert(s).`,
    );
  };
}
