import type { MiddlewareFn } from 'grammy';
import { eq } from 'drizzle-orm';
import { alertRules } from '../../db/schema/index.js';
import { formatUnits } from '../../shared/amounts.js';
import { isUuid } from '../../shared/ids.js';
import { asCodeSpan, escapeTelegramHtml } from '../../shared/sanitize.js';
import type { BotContext } from '../context.js';

/**
 * /alerts <watch-id> — list alert rules for a watch.
 *
 * Alert RULE editing (eth/token thresholds, launches on/off) is Phase 4. This
 * command currently lists the rules that exist so the state is never hidden;
 * it does not silently pretend a rule was created.
 */
export function alertsCommand(): MiddlewareFn<BotContext> {
  return async (ctx) => {
    const account = ctx.account;
    if (!account) {
      await ctx.reply('Please open a private chat and send /start first.');
      return;
    }
    const watchId = (ctx.match ?? '').toString().trim().split(/\s+/).filter(Boolean)[0];
    if (!watchId || !isUuid(watchId)) {
      await ctx.reply(
        'Usage: /alerts <watch-id> [eth <amount> | token <address> <amount> | launches on|off]',
      );
      return;
    }

    const rules = await ctx.dependencies.db
      .select()
      .from(alertRules)
      .where(eq(alertRules.watchId, watchId));

    if (rules.length === 0) {
      await ctx.reply(
        [
          `No alert rules yet for ${watchId}.`,
          '',
          'Rule editing ships in Phase 4. Until then, alert rules are created by the worker configuration and reflected here.',
        ].join('\n'),
      );
      return;
    }

    const lines: string[] = ['<b>Alert rules</b>', ''];
    for (const rule of rules) {
      const threshold =
        rule.thresholdRaw !== null
          ? formatUnits(BigInt(rule.thresholdRaw), rule.kind === 'eth_native' ? 18 : 18)
          : 'none';
      lines.push(
        `• ${escapeTelegramHtml(rule.kind)} · ${escapeTelegramHtml(rule.direction)} · threshold ${threshold} ${rule.enabled ? '' : '(disabled)'}`,
      );
      if (rule.tokenAddress) {
        lines.push(`  token ${asCodeSpan(rule.tokenAddress)}`);
      }
    }
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  };
}
