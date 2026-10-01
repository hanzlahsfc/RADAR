import type { Context } from 'grammy';
import type { Logger } from 'pino';
import type { NetworkConfig } from '../config/network.js';
import type { ContractsConfig } from '../config/contracts.js';
import type { Env } from '../config/env.js';
import type { ChainReader } from '../chain/types.js';
import type { Database } from '../db/client.js';
import type { AccountRecord } from '../db/repositories/accounts.js';
import type { FreshnessView } from './formatters/status.js';
import type { Clock } from '../shared/clock.js';

export interface BotDependencies {
  db: Database;
  env: Env;
  network: NetworkConfig | null;
  contracts: ContractsConfig;
  logger: Logger;
  clock: Clock;
  /** Read-only chain reader; absent when no chain is configured. */
  chain?: ChainReader;
  /** Freshness probe used by /status; absent in offline foundation mode. */
  freshness?: () => Promise<FreshnessView>;
}

/**
 * grammY context extended with the resolved account and injected dependencies.
 * `account` is populated by the account middleware for private chats.
 */
export interface BotContext extends Context {
  dependencies: BotDependencies;
  account: AccountRecord | null;
}

export function chatIdOf(ctx: BotContext): bigint | null {
  const id = ctx.chat?.id;
  if (id === undefined) return null;
  return BigInt(id);
}

export function userIdOf(ctx: BotContext): bigint | null {
  const id = ctx.from?.id;
  if (id === undefined) return null;
  return BigInt(id);
}
