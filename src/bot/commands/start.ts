import type { MiddlewareFn } from 'grammy';
import { escapeTelegramHtml } from '../../shared/sanitize.js';
import type { BotContext } from '../context.js';

export const START_TEXT = [
  '<b>RADAR</b> — read-only wallet activity monitor.',
  '',
  'RADAR watches public addresses on the supported chain and tells you about supported activity. It never asks for a seed phrase or private key, never trades, and never takes custody.',
  '',
  'Commands:',
  '/watch &lt;address&gt; [label] — start watching a public address',
  '/list — show your watches',
  '/unwatch &lt;watch-id&gt; — stop watching an address',
  '/pause &lt;watch-id&gt; — pause alerts for a watch',
  '/resume &lt;watch-id&gt; — resume alerts for a watch',
  '/recent &lt;address&gt; — supported activity from the last 72 hours',
  '/alerts &lt;watch-id&gt; ... — configure alert rules',
  '/status — indexing freshness and coverage',
  '/delete_me — remove your account data',
].join('\n');

export function startCommand(): MiddlewareFn<BotContext> {
  return async (ctx) => {
    const firstName = ctx.from?.first_name ? escapeTelegramHtml(ctx.from.first_name) : null;
    const greeting = firstName ? `Hello, ${firstName}!` : 'Hello!';
    await ctx.reply(`${greeting}\n\n${START_TEXT}`, { parse_mode: 'HTML' });
  };
}
