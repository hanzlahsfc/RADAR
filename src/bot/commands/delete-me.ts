import type { MiddlewareFn } from 'grammy';
import { cancelUnsentAlerts } from '../../alerts/outbox.js';
import { deleteAccount } from '../../db/repositories/accounts.js';
import { listWatches } from '../../db/repositories/watched-wallets.js';
import type { BotContext } from '../context.js';

/**
 * /delete_me — requires explicit confirmation (`/delete_me confirm`), then
 * removes account-specific data (watches, rules, outbox rows) via cascade.
 */
export function deleteMeCommand(): MiddlewareFn<BotContext> {
  return async (ctx) => {
    const account = ctx.account;
    if (!account) {
      await ctx.reply('There is nothing stored for this chat.');
      return;
    }

    const confirmation = (ctx.match ?? '').toString().trim().toLowerCase();
    if (confirmation !== 'confirm') {
      const watches = await listWatches(ctx.dependencies.db, account.id);
      await ctx.reply(
        [
          `This will permanently remove your account data, ${watches.length} watch(es), alert rules, and any pending alerts for this chat.`,
          '',
          'To confirm, send exactly:',
          '/delete_me confirm',
        ].join('\n'),
      );
      return;
    }

    // Cancel unsent deliveries first, then delete the account (cascades).
    for (const watch of await listWatches(ctx.dependencies.db, account.id)) {
      await cancelUnsentAlerts(ctx.dependencies.db, { watchId: watch.id });
    }
    await deleteAccount(ctx.dependencies.db, account.id);
    ctx.account = null;
    await ctx.reply('Your RADAR data has been deleted. Send /start to begin again.');
  };
}
