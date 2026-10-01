import type { MiddlewareFn } from 'grammy';
import type { BotContext } from '../context.js';

/**
 * Only accept account-changing commands in private chats. Group/supergroup/
 * channel usage is refused with a clear message.
 */
export function privateChatOnly(): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    if (ctx.chat?.type !== 'private') {
      await ctx.reply(
        'RADAR only accepts commands in a private chat. Open a direct chat with me and try again.',
      );
      return;
    }
    await next();
  };
}

export function isPrivateChat(ctx: BotContext): boolean {
  return ctx.chat?.type === 'private';
}
