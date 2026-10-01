import type { Logger } from 'pino';

export interface SchedulerOptions {
  name: string;
  intervalMs: number;
  tick: (signal: AbortSignal) => Promise<void>;
  logger: Logger;
  /** Fraction of the interval used as +/- jitter (0..1). */
  jitterRatio?: number;
  onError?: (error: unknown) => void;
  runImmediately?: boolean;
  /** Injectable randomness for deterministic tests. */
  random?: () => number;
}

export function jitteredDelay(baseMs: number, ratio: number, random: () => number): number {
  if (ratio <= 0) return baseMs;
  const bounded = Math.min(Math.max(random(), 0), 0.999999);
  const offset = (bounded * 2 - 1) * baseMs * ratio;
  return Math.max(1, Math.round(baseMs + offset));
}

/**
 * A minimal polling loop: run `tick` on an interval with jitter, stop promptly
 * on abort, and never let one failed tick kill the loop. Errors are reported
 * via `onError`/logger so the worker stays alive.
 */
export class Scheduler {
  private readonly options: SchedulerOptions;
  private controller: AbortController | null = null;
  private loop: Promise<void> | null = null;

  constructor(options: SchedulerOptions) {
    this.options = options;
  }

  get running(): boolean {
    return this.loop !== null;
  }

  start(): void {
    if (this.loop) return;
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.loop = this.run(signal).finally(() => {
      this.loop = null;
      this.controller = null;
    });
  }

  async stop(): Promise<void> {
    this.controller?.abort();
    await this.loop;
  }

  async runOnce(): Promise<void> {
    const controller = this.controller ?? new AbortController();
    await this.safeTick(controller.signal);
  }

  private async run(signal: AbortSignal): Promise<void> {
    const {
      intervalMs,
      jitterRatio = 0.1,
      runImmediately = true,
      random = Math.random,
    } = this.options;
    if (runImmediately) {
      await this.safeTick(signal);
    }
    while (!signal.aborted) {
      const delay = jitteredDelay(intervalMs, jitterRatio, random);
      if (await this.sleep(delay, signal)) {
        return;
      }
      if (signal.aborted) return;
      await this.safeTick(signal);
    }
  }

  private async safeTick(signal: AbortSignal): Promise<void> {
    try {
      await this.options.tick(signal);
    } catch (error) {
      this.options.logger.error(
        { err: error, scheduler: this.options.name },
        'scheduled tick failed',
      );
      this.options.onError?.(error);
    }
  }

  /** Resolves true when aborted. */
  private sleep(ms: number, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve(false);
      }, ms);
      const onAbort = (): void => {
        clearTimeout(timer);
        resolve(true);
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
