import type { MiddlewareFn } from 'grammy';
import { listWatches } from '../../db/repositories/watched-wallets.js';
import { shortenAddress } from '../../shared/addresses.js';
import { asCodeSpan, escapeTelegramHtml, sanitizeUntrustedText } from '../../shared/sanitize.js';
import type { BotContext } from '../context.js';

/** /list — show the account's watches with their ids and state. */
export function listCommand(): MiddlewareFn<BotContext> {
  return async (ctx) => {
    const account = ctx.account;
    if (!account) {
      await ctx.reply('Please open a private chat and send /start first.');
      return;
    }
    const watches = await listWatches(ctx.dependencies.db, account.id);
    if (watches.length === 0) {
      await ctx.reply('You have no watches yet. Add one with /watch <address> [label].');
      return;
    }

    const lines: string[] = ['<b>Your watches</b>', ''];
    for (const watch of watches) {
      const label = watch.label
        ? escapeTelegramHtml(sanitizeUntrustedText(watch.label, 40))
        : 'Unlabeled';
      const state = watch.active ? 'active' : 'paused';
      lines.push(
        `${asCodeSpan(watch.id)}\n  ${label} · ${asCodeSpan(shortenAddress(watch.address))} · ${state}`,
      );
    }
    await ctx.reply(lines.join('\n\n'), { parse_mode: 'HTML' });
  };
}
