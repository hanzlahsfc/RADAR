import { describe, expect, it } from 'vitest';
import {
  compareRaw,
  formatUnits,
  formatUnitsTrimmed,
  meetsThreshold,
  parseUnits,
  rawFromString,
} from '../../src/shared/amounts.js';
import { ValidationError } from '../../src/shared/errors.js';

describe('exact integer amount arithmetic', () => {
  it('parses decimal strings into base units without floating point', () => {
    expect(parseUnits('0.4', 18)).toBe(400000000000000000n);
    expect(parseUnits('1', 18)).toBe(1000000000000000000n);
    expect(parseUnits('0.000000000000000001', 18)).toBe(1n);
    expect(parseUnits('123.456', 6)).toBe(123456000n);
    expect(parseUnits('0', 18)).toBe(0n);
  });

  it('parses values larger than Number.MAX_SAFE_INTEGER exactly', () => {
    const huge = '100000000000000000000000000000';
    expect(parseUnits(huge, 18)).toBe(100000000000000000000000000000000000000000000000n);
  });

  it('rejects more decimal places than the token supports', () => {
    expect(() => parseUnits('0.1234567', 6)).toThrow(ValidationError);
  });

  it('rejects non-numeric input', () => {
    expect(() => parseUnits('1e18', 18)).toThrow(ValidationError);
    expect(() => parseUnits('abc', 18)).toThrow(ValidationError);
    expect(() => parseUnits('-1', 18)).toThrow(ValidationError);
  });

  it('formats base units back to a decimal string', () => {
    expect(formatUnits(400000000000000000n, 18)).toBe('0.4');
    expect(formatUnits(1000000000000000000n, 18)).toBe('1');
    expect(formatUnits(1n, 18)).toBe('0.000000000000000001');
    expect(formatUnits(123456000n, 6)).toBe('123.456');
    expect(formatUnits(0n, 18)).toBe('0');
  });

  it('round-trips values', () => {
    for (const value of ['0', '1', '0.5', '123.456789', '1000000.000001']) {
      const raw = parseUnits(value, 18);
      expect(formatUnits(raw, 18)).toBe(value.replace(/\.?0+$/, '') || '0');
    }
  });

  it('trims long fractional parts for display without rounding', () => {
    expect(formatUnitsTrimmed(1234567890123456789n, 18, 6)).toBe('1.234567');
    expect(formatUnitsTrimmed(1000000000000000000n, 18, 6)).toBe('1');
  });

  it('compares and thresholds inclusively', () => {
    expect(compareRaw(1n, 2n)).toBe(-1);
    expect(compareRaw(2n, 2n)).toBe(0);
    expect(compareRaw(3n, 2n)).toBe(1);

    expect(meetsThreshold(400000000000000000n, 400000000000000000n)).toBe(true);
    expect(meetsThreshold(399999999999999999n, 400000000000000000n)).toBe(false);
  });

  it('parses raw integer strings safely', () => {
    expect(rawFromString('400000000000000000')).toBe(400000000000000000n);
    expect(() => rawFromString('1.5')).toThrow(ValidationError);
  });
});
