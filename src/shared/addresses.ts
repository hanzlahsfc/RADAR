import { getAddress, isAddress } from 'viem';
import { ValidationError } from './errors.js';

/** A lowercase, 0x-prefixed 20-byte address. */
export type Address = `0x${string}`;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Loose structural check: 0x + 40 hex chars. Does not validate checksum. */
export function isAddressLike(input: string): input is Address {
  return ADDRESS_RE.test(input);
}

/** Full validation, including EIP-55 checksum when the input is mixed-case. */
export function isValidAddress(input: string): input is Address {
  return (
    ADDRESS_RE.test(input) && (input.slice(2) === input.slice(2).toUpperCase() || isAddress(input))
  );
}

/**
 * Normalize an address to lowercase form for storage and comparison.
 * Throws ValidationError for anything that is not a valid address.
 */
export function normalizeAddress(input: string): Address {
  const trimmed = input.trim();
  if (!isValidAddress(trimmed)) {
    throw new ValidationError('Invalid address', { input });
  }
  return trimmed.toLowerCase() as Address;
}

/**
 * EIP-55 checksummed form for display. Falls back to the raw value if it
 * cannot be checksummed (never fabricates a checksummed address).
 */
export function toChecksumAddress(input: string): Address {
  const normalized = normalizeAddress(input);
  return getAddress(normalized) as Address;
}

/** Compare two addresses case-insensitively. */
export function addressesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Shorten an address for compact display: 0x1234…abcd.
 * The full value should remain available via an explorer link.
 */
export function shortenAddress(input: string, lead = 6, tail = 4): string {
  const trimmed = input.trim();
  if (trimmed.length <= lead + tail) {
    return trimmed;
  }
  return `${trimmed.slice(0, lead)}…${trimmed.slice(-tail)}`;
}
