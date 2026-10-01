import type { MiddlewareFn } from 'grammy';
import { z } from 'zod';
import { addWatch } from '../../db/repositories/watched-wallets.js';
import { normalizeAddress, shortenAddress } from '../../shared/addresses.js';
import { ValidationError } from '../../shared/errors.js';
import { sanitizeUntrustedText } from '../../shared/sanitize.js';
import type { BotContext } from '../context.js';

const labelSchema = z.string().trim().min(1).max(40);

/** /watch <address> [label] — idempotent; repeating returns the existing watch. */
export function watchCommand(): MiddlewareFn<BotContext> {
  return async (ctx) => {
    const account = ctx.account;
    if (!account) {
      await ctx.reply('Please open a private chat and send /start first.');
      return;
    }

    const args = (ctx.match ?? '').toString().trim().split(/\s+/).filter(Boolean);
    const rawAddress = args[0];
    if (!rawAddress) {
      await ctx.reply('Usage: /watch <address> [label]');
      return;
    }

    let address: `0x${string}`;
    try {
      address = normalizeAddress(rawAddress);
    } catch {
      await ctx.reply(
        'That does not look like a valid address. Send a 0x-prefixed 40-character address.',
      );
      return;
    }

    const rawLabel = args.slice(1).join(' ');
    let label: string | null = null;
    if (rawLabel) {
      const parsed = labelSchema.safeParse(rawLabel);
      if (!parsed.success) {
        await ctx.reply('Label must be between 1 and 40 characters.');
        return;
      }
      label = sanitizeUntrustedText(parsed.data, 40);
    }

    const { network, chain, db, env } = ctx.dependencies;
    if (!network || !chain) {
      await ctx.reply(
        'The chain is not configured yet, so activation blocks cannot be recorded. Set CHAIN_ID/RPC_HTTP_URL and run `pnpm verify:network`.',
      );
      return;
    }

    const activationBlock = await chain.getConfirmedHead();
    try {
      const result = await addWatch(db, {
        accountId: account.id,
        chainId: BigInt(network.chainId),
        address,
        label,
        alertStartBlock: activationBlock,
        maxWatches: env.MAX_WATCHES_PER_ACCOUNT,
      });
      if (result.created) {
        await ctx.reply(
          `Now watching ${shortenAddress(address)}${label ? ` (${label})` : ''}.\nAlerts start from block ${activationBlock}.`,
        );
      } else {
        await ctx.reply(`You are already watching ${shortenAddress(address)}.`);
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        await ctx.reply(error.message);
        return;
      }
      throw error;
    }
  };
}
