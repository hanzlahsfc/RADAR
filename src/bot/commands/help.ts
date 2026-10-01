import type { MiddlewareFn } from 'grammy';
import type { BotContext } from '../context.js';
import { START_TEXT } from './start.js';

const HELP_EXTRA = [
  '',
  '<b>About the data</b>',
  '• Amounts are exact base-unit integers; RADAR never uses floating point.',
  '• A watched address does not imply ownership, and a transfer is never labeled a "purchase" without verified swap decoding.',
  '• Token symbols/names come from untrusted on-chain data and are escaped before display.',
  '• RADAR is read-only: no trading, custody, payments, or token launches.',
].join('\n');

export function helpCommand(): MiddlewareFn<BotContext> {
  return async (ctx) => {
    await ctx.reply(`${START_TEXT}${HELP_EXTRA}`, { parse_mode: 'HTML' });
  };
}
