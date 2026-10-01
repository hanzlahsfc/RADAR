import type { MiddlewareFn } from 'grammy';
import type { BotContext } from '../context.js';

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimitOptions {
  /** Bucket capacity (max burst). */
  capacity: number;
  /** Tokens refilled per second. */
  refillPerSecond: number;
  now?: () => number;
}

/**
 * In-memory per-user token bucket. Deliberately simple for Phase 0 (single bot
 * process); a shared store can replace this when the bot scales out.
 */
export function rateLimit(options: RateLimitOptions): MiddlewareFn<BotContext> {
  const buckets = new Map<bigint, Bucket>();
  const now = options.now ?? Date.now;

  return async (ctx, next) => {
    const userId = ctx.from?.id;
    if (userId === undefined) {
      await next();
      return;
    }
    const key = BigInt(userId);
    const current = now();
    const bucket = buckets.get(key) ?? { tokens: options.capacity, updatedAt: current };
    const elapsedSeconds = Math.max(0, (current - bucket.updatedAt) / 1000);
    bucket.tokens = Math.min(
      options.capacity,
      bucket.tokens + elapsedSeconds * options.refillPerSecond,
    );
    bucket.updatedAt = current;

    if (bucket.tokens < 1) {
      buckets.set(key, bucket);
      await ctx.reply('Too many requests. Please slow down and try again in a moment.');
      return;
    }
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    await next();
  };
}
