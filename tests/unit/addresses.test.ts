import { describe, expect, it } from 'vitest';
import {
  addressesEqual,
  isAddressLike,
  isValidAddress,
  normalizeAddress,
  shortenAddress,
  toChecksumAddress,
} from '../../src/shared/addresses.js';
import { ValidationError } from '../../src/shared/errors.js';

const LOWER = '0x1111111111111111111111111111111111111111';
const CHECKSUMMED = '0x52908400098527886E0F7030069857D2E4169EE7';

describe('address validation and normalization', () => {
  it('recognizes structurally valid addresses', () => {
    expect(isAddressLike(LOWER)).toBe(true);
    expect(isAddressLike('0x123')).toBe(false);
    expect(isAddressLike('1111111111111111111111111111111111111111')).toBe(false);
    expect(isAddressLike('0xZZ11111111111111111111111111111111111111')).toBe(false);
  });

  it('validates EIP-55 checksums when mixed case is used', () => {
    expect(isValidAddress(CHECKSUMMED)).toBe(true);
    expect(isValidAddress('0x52908400098527886e0f7030069857d2e4169ee7')).toBe(true);
    // Wrong checksum for mixed-case input must be rejected.
    expect(isValidAddress('0x52908400098527886E0F7030069857D2e4169EE7')).toBe(false);
  });

  it('normalizes to lowercase and trims whitespace', () => {
    expect(normalizeAddress(`  ${CHECKSUMMED}  `)).toBe(CHECKSUMMED.toLowerCase());
    expect(normalizeAddress(LOWER)).toBe(LOWER);
  });

  it('rejects invalid addresses with a ValidationError', () => {
    expect(() => normalizeAddress('not-an-address')).toThrow(ValidationError);
    expect(() => normalizeAddress('0x1234')).toThrow(ValidationError);
  });

  it('produces checksummed display form', () => {
    expect(toChecksumAddress(LOWER).toLowerCase()).toBe(LOWER);
    expect(toChecksumAddress(CHECKSUMMED)).toBe(CHECKSUMMED);
  });

  it('compares addresses case-insensitively', () => {
    expect(addressesEqual(CHECKSUMMED, CHECKSUMMED.toLowerCase())).toBe(true);
    expect(addressesEqual(LOWER, CHECKSUMMED)).toBe(false);
  });

  it('shortens addresses for display without losing the raw value elsewhere', () => {
    expect(shortenAddress(LOWER)).toBe('0x1111…1111');
    expect(shortenAddress('0x1234')).toBe('0x1234');
  });
});
