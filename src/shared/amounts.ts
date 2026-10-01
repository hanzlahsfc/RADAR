import { ValidationError } from './errors.js';

/** Maximum decimals supported by the ERC-20/UI path (uint256 is 78 decimal digits). */
export const MAX_UINT256_DECIMALS = 78;

const DECIMAL_RE = /^\d+(\.\d+)?$/;

/**
 * Parse a human decimal string into the token's smallest unit (base units),
 * using exact integer arithmetic. Never uses floating point.
 *
 * Example: parseUnits('0.4', 18) === 400000000000000000n
 */
export function parseUnits(value: string, decimals: number): bigint {
  assertDecimals(decimals);
  const trimmed = value.trim();
  if (!DECIMAL_RE.test(trimmed)) {
    throw new ValidationError('Amount must be a non-negative decimal string', { value });
  }
  const [intPart = '0', fracPart = ''] = trimmed.split('.');
  if (fracPart.length > decimals) {
    throw new ValidationError('Amount has more decimal places than the token supports', {
      value,
      decimals,
    });
  }
  const padded = fracPart.padEnd(decimals, '0');
  const scale = 10n ** BigInt(decimals);
  const whole = BigInt(intPart);
  const fraction = padded === '' ? 0n : BigInt(padded);
  return whole * scale + fraction;
}

/**
 * Format base units back into a human decimal string with exact integer math.
 * Trailing fractional zeros are removed; integral values omit the decimal point.
 */
export function formatUnits(raw: bigint, decimals: number): string {
  assertDecimals(decimals);
  const negative = raw < 0n;
  const magnitude = negative ? -raw : raw;
  const scale = 10n ** BigInt(decimals);
  const whole = magnitude / scale;
  let fraction = (magnitude % scale).toString().padStart(decimals, '0');
  fraction = fraction.replace(/0+$/, '');
  const sign = negative ? '-' : '';
  return fraction === '' ? `${sign}${whole.toString()}` : `${sign}${whole.toString()}.${fraction}`;
}

/** Compact display for large/small values while staying exact about the count. */
export function formatUnitsTrimmed(raw: bigint, decimals: number, maxFractionDigits = 6): string {
  const formatted = formatUnits(raw, decimals);
  if (!formatted.includes('.')) {
    return formatted;
  }
  const [whole, fraction = ''] = formatted.split('.');
  if (fraction.length <= maxFractionDigits) {
    return formatted;
  }
  const cut = fraction.slice(0, maxFractionDigits).replace(/0+$/, '');
  return cut === '' ? (whole ?? '0') : `${whole}.${cut}`;
}

export type Comparison = -1 | 0 | 1;

/** Exact integer comparison of two base-unit amounts. */
export function compareRaw(a: bigint, b: bigint): Comparison {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Inclusive threshold check: amount >= threshold. */
export function meetsThreshold(amountRaw: bigint, thresholdRaw: bigint): boolean {
  return amountRaw >= thresholdRaw;
}

/** Parse a base-unit amount from its decimal-string representation safely. */
export function rawFromString(value: string): bigint {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new ValidationError('Raw amount must be an integer string', { value });
  }
  return BigInt(trimmed);
}

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_UINT256_DECIMALS) {
    throw new ValidationError('Invalid token decimals', { decimals });
  }
}
