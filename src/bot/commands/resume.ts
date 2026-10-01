import type { MiddlewareFn } from 'grammy';
import type { BotContext } from '../context.js';
import { setWatchStateCommand } from './pause.js';

/** /resume <watch-id> — resume alerts without replaying old notifications. */
export function resumeCommand(): MiddlewareFn<BotContext> {
  return setWatchStateCommand(true);
}
