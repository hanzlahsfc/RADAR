import { Bot, type MiddlewareFn } from 'grammy';
import { alertsCommand } from './commands/alerts.js';
import { deleteMeCommand } from './commands/delete-me.js';
import { helpCommand } from './commands/help.js';
import { listCommand } from './commands/list.js';
import { pauseCommand } from './commands/pause.js';
import { recentCommand } from './commands/recent.js';
import { resumeCommand } from './commands/resume.js';
import { startCommand } from './commands/start.js';
import { statusCommand } from './commands/status.js';
import { unwatchCommand } from './commands/unwatch.js';
import { watchCommand } from './commands/watch.js';
import type { BotContext, BotDependencies } from './context.js';
import { loadAccount } from './middleware/account.js';
import { privateChatOnly } from './middleware/private-chat.js';
import { rateLimit } from './middleware/rate-limit.js';

export interface CreateBotOptions {
  token: string;
  dependencies: BotDependencies;
}

/**
 * Assemble the bot. Command registration is explicit so the command surface is
 * greppable and testable. Only private chats may run account-changing commands.
 */
export function createBot(options: CreateBotOptions): Bot<BotContext> {
  const bot = new Bot<BotContext>(options.token);

  // Inject dependencies into every update.
  bot.use(async (ctx, next) => {
    ctx.dependencies = options.dependencies;
    ctx.account = null;
    await next();
  });

  bot.use(rateLimit({ capacity: 10, refillPerSecond: 1 }));

  // Read-only commands available anywhere.
  bot.command('help', helpCommand());

  // Private-chat-only commands.
  const guarded = (handler: MiddlewareFn<BotContext>): MiddlewareFn<BotContext>[] => [
    privateChatOnly(),
    loadAccount(),
    handler,
  ];

  bot.command('start', ...guarded(startCommand()));
  bot.command('watch', ...guarded(watchCommand()));
  bot.command('list', ...guarded(listCommand()));
  bot.command('unwatch', ...guarded(unwatchCommand()));
  bot.command('pause', ...guarded(pauseCommand()));
  bot.command('resume', ...guarded(resumeCommand()));
  bot.command('recent', ...guarded(recentCommand()));
  bot.command('alerts', ...guarded(alertsCommand()));
  bot.command('status', ...guarded(statusCommand()));
  bot.command('delete_me', ...guarded(deleteMeCommand()));

  bot.catch((error) => {
    options.dependencies.logger.error(
      { err: error.error, updateId: error.ctx.update.update_id },
      'bot update failed',
    );
  });

  return bot;
}

export type { BotContext };
