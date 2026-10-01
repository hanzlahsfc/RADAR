import { parseAbi } from 'viem';
import type { Address } from '../shared/addresses.js';
import { sanitizeUntrustedText } from '../shared/sanitize.js';
import type { PublicClient } from './client.js';

export const ERC20_METADATA_ABI = parseAbi([
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
]);

export interface TokenMetadataResult {
  address: Address;
  /** Sanitized symbol/name for display, or absent when unavailable. */
  symbol?: string;
  name?: string;
  rawSymbol?: string;
  rawName?: string;
  decimals?: number;
  /** ok = all fields; partial = some missing; missing = nothing usable. */
  status: 'ok' | 'partial' | 'missing';
}

/**
 * Read ERC-20 metadata defensively. Decimals are essential for formatting;
 * symbol/name are optional and treated as untrusted. Missing decimals must be
 * surfaced as a limitation rather than guessed.
 */
export async function fetchTokenMetadata(
  client: PublicClient,
  token: Address,
): Promise<TokenMetadataResult> {
  const [decimals, symbol, name] = await Promise.all([
    readUint8(client, token, 'decimals'),
    readString(client, token, 'symbol'),
    readString(client, token, 'name'),
  ]);

  const result: TokenMetadataResult = { address: token, status: 'missing' };
  if (decimals !== undefined) {
    result.decimals = decimals;
  }
  if (symbol !== undefined) {
    result.rawSymbol = symbol;
    result.symbol = sanitizeUntrustedText(symbol, 32);
  }
  if (name !== undefined) {
    result.rawName = name;
    result.name = sanitizeUntrustedText(name, 64);
  }

  if (decimals !== undefined && (symbol !== undefined || name !== undefined)) {
    result.status = 'ok';
  } else if (decimals !== undefined || symbol !== undefined || name !== undefined) {
    result.status = 'partial';
  } else {
    result.status = 'missing';
  }
  return result;
}

async function readUint8(
  client: PublicClient,
  token: Address,
  functionName: 'decimals',
): Promise<number | undefined> {
  try {
    const value = await client.readContract({
      address: token,
      abi: ERC20_METADATA_ABI,
      functionName,
    });
    return typeof value === 'number' ? value : Number(value);
  } catch {
    return undefined;
  }
}

async function readString(
  client: PublicClient,
  token: Address,
  functionName: 'symbol' | 'name',
): Promise<string | undefined> {
  try {
    const value = await client.readContract({
      address: token,
      abi: ERC20_METADATA_ABI,
      functionName,
    });
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}
