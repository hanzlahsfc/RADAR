import type { MiddlewareFn } from 'grammy';
import { upsertAccountByTelegramUser } from '../../db/repositories/accounts.js';
import { chatIdOf, userIdOf, type BotContext } from '../context.js';

/**
 * Resolve (or lazily create) the account for the sender and attach it to the
 * context. Only runs for private chats; the account middleware never asks for a
 * seed phrase or signature.
 */
export function loadAccount(): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    if (ctx.chat?.type !== 'private') {
      ctx.account = null;
      await next();
      return;
    }
    const userId = userIdOf(ctx);
    const chatId = chatIdOf(ctx);
    if (userId === null || chatId === null) {
      ctx.account = null;
      await next();
      return;
    }
    ctx.account = await upsertAccountByTelegramUser(ctx.dependencies.db, {
      telegramUserId: userId,
      telegramChatId: chatId,
    });
    await next();
  };
}
