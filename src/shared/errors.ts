/**
 * Base error type for RADAR. Carries a stable machine-readable `code` and
 * optional structured context that is safe to log (see logger redaction).
 */
export class RadarError extends Error {
  readonly code: string;
  readonly context: Record<string, unknown> | undefined;

  constructor(
    code: string,
    message: string,
    options?: { cause?: unknown; context?: Record<string, unknown> },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.context = options?.context;
  }
}

/** Invalid or missing configuration. Startup should fail fast on these. */
export class ConfigError extends RadarError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('CONFIG_ERROR', message, context === undefined ? undefined : { context });
  }
}

/** Invalid user input or unparseable values. */
export class ValidationError extends RadarError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, context === undefined ? undefined : { context });
  }
}

/** Explicit marker for functionality scheduled for a later phase. */
export class NotImplementedError extends RadarError {
  constructor(message: string) {
    super('NOT_IMPLEMENTED', message);
  }
}

/**
 * A provider (RPC/explorer) failed. `retryable` guides the retry layer.
 */
export class ProviderError extends RadarError {
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { retryable?: boolean; cause?: unknown; context?: Record<string, unknown> } = {},
  ) {
    super('PROVIDER_ERROR', message, {
      ...(options.cause === undefined ? {} : { cause: options.cause }),
      ...(options.context === undefined ? {} : { context: options.context }),
    });
    this.retryable = options.retryable ?? false;
  }
}

/** Raised when a chain/network is required but not configured or not verified. */
export class ChainNotConfiguredError extends RadarError {
  constructor(message: string) {
    super('CHAIN_NOT_CONFIGURED', message);
  }
}

export function isRadarError(value: unknown): value is RadarError {
  return value instanceof RadarError;
}
