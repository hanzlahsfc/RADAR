import { and, count, eq, isNull } from 'drizzle-orm';
import { normalizeAddress, type Address } from '../../shared/addresses.js';
import { ValidationError } from '../../shared/errors.js';
import type { Database } from '../client.js';
import { watchedWallets, type WatchedWalletRow } from '../schema/index.js';
import { lockAccount } from './accounts.js';

export type WatchRecord = WatchedWalletRow;

export interface AddWatchInput {
  accountId: string;
  chainId: bigint;
  address: string;
  label?: string | null;
  alertStartBlock: bigint;
  maxWatches: number;
}

export interface AddWatchResult {
  watch: WatchRecord;
  created: boolean;
}

/**
 * Add a watch, enforcing the per-account limit TRANSACTIONALLY.
 *
 * A row lock on the account serializes concurrent requests so two simultaneous
 * `/watch` calls cannot both observe "4 of 5" and exceed the limit. Re-watching
 * an existing address reactivates it instead of creating a duplicate.
 */
export async function addWatch(db: Database, input: AddWatchInput): Promise<AddWatchResult> {
  const address = normalizeAddress(input.address);

  return db.transaction(async (tx) => {
    await lockAccount(tx as unknown as Database, input.accountId);

    const existing = await tx
      .select()
      .from(watchedWallets)
      .where(
        and(
          eq(watchedWallets.accountId, input.accountId),
          eq(watchedWallets.chainId, input.chainId),
          eq(watchedWallets.address, address),
        ),
      )
      .limit(1);

    const current = existing[0];
    if (current) {
      if (current.removedAt !== null || !current.active) {
        const [reactivated] = await tx
          .update(watchedWallets)
          .set({ active: true, removedAt: null })
          .where(eq(watchedWallets.id, current.id))
          .returning();
        return { watch: reactivated ?? current, created: false };
      }
      return { watch: current, created: false };
    }

    const watchCount = await countRetainedWatches(tx as unknown as Database, input.accountId);
    if (watchCount >= input.maxWatches) {
      throw new ValidationError(
        `Watch limit reached (${input.maxWatches}). Remove a watch before adding another.`,
        { accountId: input.accountId, limit: input.maxWatches },
      );
    }
    const [created] = await tx
      .insert(watchedWallets)
      .values({
        accountId: input.accountId,
        chainId: input.chainId,
        address,
        label: input.label ?? null,
        alertStartBlock: input.alertStartBlock,
      })
      .returning();
    if (!created) {
      throw new Error('Failed to create watch');
    }
    return { watch: created, created: true };
  });
}

/** Paused watches still occupy one of the account's five saved-watch slots. */
export async function countRetainedWatches(db: Database, accountId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(watchedWallets)
    .where(and(eq(watchedWallets.accountId, accountId), isNull(watchedWallets.removedAt)));
  return Number(row?.value ?? 0);
}
export async function countActiveWatches(db: Database, accountId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(watchedWallets)
    .where(
      and(
        eq(watchedWallets.accountId, accountId),
        eq(watchedWallets.active, true),
        isNull(watchedWallets.removedAt),
      ),
    );
  return Number(row?.value ?? 0);
}

export async function listWatches(db: Database, accountId: string): Promise<WatchRecord[]> {
  return db
    .select()
    .from(watchedWallets)
    .where(and(eq(watchedWallets.accountId, accountId), isNull(watchedWallets.removedAt)));
}

export async function findWatch(
  db: Database,
  accountId: string,
  watchId: string,
): Promise<WatchRecord | null> {
  const rows = await db
    .select()
    .from(watchedWallets)
    .where(and(eq(watchedWallets.id, watchId), eq(watchedWallets.accountId, accountId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Pause a watch: alerts stop, the row remains so it can be resumed. */
export async function setWatchActive(
  db: Database,
  accountId: string,
  watchId: string,
  active: boolean,
): Promise<WatchRecord | null> {
  const [row] = await db
    .update(watchedWallets)
    .set({ active })
    .where(and(eq(watchedWallets.id, watchId), eq(watchedWallets.accountId, accountId)))
    .returning();
  return row ?? null;
}

/** Remove a watch: marks it removed and inactive (rules/outbox cascade). */
export async function removeWatch(
  db: Database,
  accountId: string,
  watchId: string,
): Promise<WatchRecord | null> {
  const [row] = await db
    .update(watchedWallets)
    .set({ active: false, removedAt: new Date() })
    .where(and(eq(watchedWallets.id, watchId), eq(watchedWallets.accountId, accountId)))
    .returning();
  return row ?? null;
}

export function watchAddress(watch: WatchRecord): Address {
  return watch.address as Address;
}
