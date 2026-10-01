import { systemClock, type Clock } from './clock.js';

export interface RetryOptions {
  /** Maximum number of attempts after the first try. */
  retries: number;
  /** Base delay in ms for exponential backoff. */
  baseDelayMs: number;
  /** Upper bound for a single delay in ms. */
  maxDelayMs: number;
  /** Fraction (0..1) of random jitter applied to each delay. */
  jitter?: number;
  /** Decide whether a thrown error is retryable. Defaults to always-retry. */
  isRetryable?: (error: unknown) => boolean;
  /** Invoked before each sleep, primarily for observability. */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
  clock?: Clock;
  /** Override the sleep primitive (tests inject a no-op). */
  sleep?: (ms: number) => Promise<void>;
}

export interface BackoffInput {
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: number;
  /** Injectable randomness in [0, 1) for deterministic tests. */
  random?: () => number;
}

/**
 * Exponential backoff with optional jitter. `attempt` is 1-based.
 * Pure function → deterministic and unit-testable.
 */
export function computeBackoff(input: BackoffInput): number {
  const { attempt, baseDelayMs, maxDelayMs, jitter } = input;
  const random = input.random ?? Math.random;
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const exponential = baseDelayMs * 2 ** (safeAttempt - 1);
  const capped = Math.min(exponential, maxDelayMs);
  if (jitter <= 0) {
    return Math.floor(capped);
  }
  const boundedRandom = Math.min(Math.max(random(), 0), 0.999999);
  const spread = capped * jitter;
  const offset = (boundedRandom * 2 - 1) * spread;
  return Math.max(0, Math.floor(capped + offset));
}

export function defaultSleep(ms: number, clock: Clock = systemClock): Promise<void> {
  // clock is accepted for symmetry; real sleep uses timers.
  void clock;
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Run `fn`, retrying retryable failures with bounded exponential backoff + jitter.
 * Timeout-after-send style ambiguity is intentionally the caller's concern.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const {
    retries,
    baseDelayMs,
    maxDelayMs,
    jitter = 0.2,
    isRetryable = () => true,
    onRetry,
    sleep = defaultSleep,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const attemptsExhausted = attempt > retries;
      if (attemptsExhausted || !isRetryable(error)) {
        throw error;
      }
      const delayMs = computeBackoff({ attempt, baseDelayMs, maxDelayMs, jitter });
      onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
  // Unreachable, but keeps the type checker satisfied.
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
