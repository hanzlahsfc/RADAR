import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteAccount } from '../../src/db/repositories/accounts.js';
import {
  addWatch,
  countActiveWatches,
  listWatches,
  removeWatch,
  setWatchActive,
} from '../../src/db/repositories/watched-wallets.js';
import { ValidationError } from '../../src/shared/errors.js';
import { connectTestDatabase, createTestAccount, TEST_CHAIN_ID, truncateAll } from './harness.js';
import type { DatabaseHandle } from '../../src/db/client.js';

let handle: DatabaseHandle;

beforeAll(async () => {
  handle = await connectTestDatabase();
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await truncateAll(handle);
});

function address(index: number): string {
  return `0x${index.toString(16).padStart(40, '0')}`;
}

const baseInput = (accountId: string, index: number) => ({
  accountId,
  chainId: TEST_CHAIN_ID,
  address: address(index),
  alertStartBlock: 100n,
  maxWatches: 5,
});

describe('watch limit enforcement', () => {
  it('allows up to five watches and rejects the sixth', async () => {
    const account = await createTestAccount(handle, 1001n);
    for (let index = 1; index <= 5; index += 1) {
      await addWatch(handle.db, baseInput(account.id, index));
    }
    expect(await countActiveWatches(handle.db, account.id)).toBe(5);
    await expect(addWatch(handle.db, baseInput(account.id, 6))).rejects.toThrow(ValidationError);
    expect(await countActiveWatches(handle.db, account.id)).toBe(5);
  });

  it('counts paused watches toward the five-address account limit', async () => {
    const account = await createTestAccount(handle, 1501n);
    const watches = [];
    for (let index = 1; index <= 5; index += 1) {
      watches.push(await addWatch(handle.db, baseInput(account.id, index)));
    }
    await setWatchActive(handle.db, account.id, watches[0]!.watch.id, false);
    expect(await countActiveWatches(handle.db, account.id)).toBe(4);
    await expect(addWatch(handle.db, baseInput(account.id, 6))).rejects.toThrow(ValidationError);
    expect(await listWatches(handle.db, account.id)).toHaveLength(5);
  });
  it('never exceeds the limit under concurrent requests', async () => {
    const account = await createTestAccount(handle, 2002n);
    const attempts = Array.from({ length: 10 }, (_, index) =>
      addWatch(handle.db, baseInput(account.id, index + 1)),
    );
    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((result) => result.status === 'fulfilled').length;
    const rejected = results.filter((result) => result.status === 'rejected').length;

    expect(fulfilled).toBe(5);
    expect(rejected).toBe(5);
    expect(await countActiveWatches(handle.db, account.id)).toBe(5);

    // Every rejection must be the watch-limit error, not a random failure.
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(ValidationError);
      }
    }
  });

  it('is idempotent for a repeated address and reactivates removed watches', async () => {
    const account = await createTestAccount(handle, 3003n);
    const first = await addWatch(handle.db, baseInput(account.id, 1));
    const again = await addWatch(handle.db, baseInput(account.id, 1));
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.watch.id).toBe(first.watch.id);

    await removeWatch(handle.db, account.id, first.watch.id);
    expect(await countActiveWatches(handle.db, account.id)).toBe(0);

    const revived = await addWatch(handle.db, baseInput(account.id, 1));
    expect(revived.watch.id).toBe(first.watch.id);
    expect(revived.watch.removedAt).toBeNull();
    expect(revived.watch.active).toBe(true);
  });

  it('normalizes addresses so case cannot create duplicates', async () => {
    const account = await createTestAccount(handle, 4004n);
    const upper = `0x${'AB'.repeat(20)}`;
    await addWatch(handle.db, { ...baseInput(account.id, 0), address: upper });
    const again = await addWatch(handle.db, {
      ...baseInput(account.id, 0),
      address: upper.toLowerCase(),
    });
    expect(again.created).toBe(false);
    expect(await countActiveWatches(handle.db, account.id)).toBe(1);
  });
});

describe('account isolation', () => {
  it('keeps watch limits and listings per account', async () => {
    const accountA = await createTestAccount(handle, 5005n);
    const accountB = await createTestAccount(handle, 6006n);

    for (let index = 1; index <= 5; index += 1) {
      await addWatch(handle.db, baseInput(accountA.id, index));
    }
    await addWatch(handle.db, baseInput(accountB.id, 1));

    expect(await listWatches(handle.db, accountA.id)).toHaveLength(5);
    expect(await listWatches(handle.db, accountB.id)).toHaveLength(1);

    // Account B must not be able to touch account A's watch.
    const accountAWatches = await listWatches(handle.db, accountA.id);
    const target = accountAWatches[0]!;
    expect(await setWatchActive(handle.db, accountB.id, target.id, false)).toBeNull();
    expect(await removeWatch(handle.db, accountB.id, target.id)).toBeNull();
    expect(await countActiveWatches(handle.db, accountA.id)).toBe(5);
  });

  it('gives the same address independent watches for different accounts', async () => {
    const accountA = await createTestAccount(handle, 7007n);
    const accountB = await createTestAccount(handle, 8008n);
    await addWatch(handle.db, baseInput(accountA.id, 1));
    const second = await addWatch(handle.db, baseInput(accountB.id, 1));
    expect(second.created).toBe(true);
  });
});

describe('account deletion', () => {
  it('cascades to watches and returns a clean slate', async () => {
    const account = await createTestAccount(handle, 9009n);
    for (let index = 1; index <= 3; index += 1) {
      await addWatch(handle.db, baseInput(account.id, index));
    }
    expect(await countActiveWatches(handle.db, account.id)).toBe(3);

    await deleteAccount(handle.db, account.id);

    expect(await listWatches(handle.db, account.id)).toHaveLength(0);
    expect(await countActiveWatches(handle.db, account.id)).toBe(0);
  });
});
