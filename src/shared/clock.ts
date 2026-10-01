/**
 * Injectable time source so time-dependent behavior is deterministic in tests.
 */
export interface Clock {
  /** Current time as a Date. */
  now(): Date;
  /** Current time in epoch milliseconds. */
  nowMs(): number;
}

export const systemClock: Clock = {
  now: () => new Date(),
  nowMs: () => Date.now(),
};

/** A clock frozen at a specific instant. Useful in tests. */
export function fixedClock(instant: Date | string | number): Clock {
  const at = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  if (Number.isNaN(at)) {
    throw new TypeError(`fixedClock received an invalid instant: ${String(instant)}`);
  }
  return {
    now: () => new Date(at),
    nowMs: () => at,
  };
}

export function hoursToMs(hours: number): number {
  return hours * 60 * 60 * 1000;
}

export function subtractHours(from: Date, hours: number): Date {
  return new Date(from.getTime() - hoursToMs(hours));
}
