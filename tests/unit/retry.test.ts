import { describe, expect, it, vi } from 'vitest';
import { computeBackoff, withRetry } from '../../src/shared/retry.js';

describe('retry with bounded exponential backoff', () => {
  it('computes deterministic backoff with injected randomness', () => {
    const base = { baseDelayMs: 100, maxDelayMs: 1000, jitter: 0 };
    expect(computeBackoff({ ...base, attempt: 1 })).toBe(100);
    expect(computeBackoff({ ...base, attempt: 2 })).toBe(200);
    expect(computeBackoff({ ...base, attempt: 3 })).toBe(400);
    // Capped at maxDelayMs.
    expect(computeBackoff({ ...base, attempt: 10 })).toBe(1000);
  });

  it('applies jitter within the expected bounds', () => {
    const jittered = computeBackoff({
      attempt: 2,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      jitter: 0.2,
      random: () => 1,
    });
    expect(jittered).toBeLessThanOrEqual(240);
    expect(jittered).toBeGreaterThan(0);
  });

  it('retries retryable failures and eventually succeeds', async () => {
    let attempts = 0;
    const sleep = vi.fn(async () => undefined);
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('transient');
        return 'ok';
      },
      { retries: 5, baseDelayMs: 1, maxDelayMs: 10, jitter: 0, sleep },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('stops after the retry budget is exhausted', async () => {
    const sleep = vi.fn(async () => undefined);
    await expect(
      withRetry(
        async () => {
          throw new Error('always');
        },
        { retries: 2, baseDelayMs: 1, maxDelayMs: 5, jitter: 0, sleep },
      ),
    ).rejects.toThrow('always');
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable failures', async () => {
    const sleep = vi.fn(async () => undefined);
    await expect(
      withRetry(
        async () => {
          throw new Error('permanent');
        },
        { retries: 5, baseDelayMs: 1, maxDelayMs: 5, isRetryable: () => false, sleep },
      ),
    ).rejects.toThrow('permanent');
    expect(sleep).not.toHaveBeenCalled();
  });
});
