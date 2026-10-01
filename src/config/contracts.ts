import { z } from 'zod';
import { normalizeAddress, type Address } from '../shared/addresses.js';
import { ConfigError } from '../shared/errors.js';

/**
 * Allowlisted launch factories (e.g. Pons). Empty by default and MUST stay
 * empty until a factory deployment has been verified on the target network
 * (see docs/NETWORK_VERIFICATION.md and Phase 5).
 */
export interface FactoryConfig {
  address: Address;
  version: string;
  /** Human-readable source of the verified deployment. */
  source: string;
}

export interface TokenConfig {
  address: Address;
  symbol: string;
  decimals: number;
}

export interface ContractsConfig {
  launchFactories: FactoryConfig[];
  /** Tokens eligible for token-transfer alerts. */
  supportedTokens: TokenConfig[];
}

const tokenConfigSchema = z.object({
  address: z.string(),
  symbol: z.string().min(1),
  decimals: z.number().int().min(0).max(78),
});

const factoryConfigSchema = z.object({
  address: z.string(),
  version: z.string().min(1),
  source: z.string().min(1),
});

const contractsFileSchema = z.object({
  launchFactories: z.array(factoryConfigSchema).default([]),
  supportedTokens: z.array(tokenConfigSchema).default([]),
});

export const EMPTY_CONTRACTS: ContractsConfig = { launchFactories: [], supportedTokens: [] };

/**
 * Load optional contract configuration from the CONTRACTS_CONFIG env var
 * (a JSON string) or from an in-memory object. Addresses are normalized.
 * Invalid configuration fails fast rather than silently disabling alerts.
 */
export function loadContractsConfig(raw?: string | ContractsConfig): ContractsConfig {
  if (raw === undefined) {
    return EMPTY_CONTRACTS;
  }
  let parsedInput: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '') return EMPTY_CONTRACTS;
    try {
      parsedInput = JSON.parse(trimmed);
    } catch (error) {
      throw new ConfigError('CONTRACTS_CONFIG is not valid JSON', { cause: String(error) });
    }
  }
  const parsed = contractsFileSchema.safeParse(parsedInput);
  if (!parsed.success) {
    throw new ConfigError('Invalid contracts configuration', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return {
    launchFactories: parsed.data.launchFactories.map((factory) => ({
      address: normalizeAddress(factory.address),
      version: factory.version,
      source: factory.source,
    })),
    supportedTokens: parsed.data.supportedTokens.map((token) => ({
      address: normalizeAddress(token.address),
      symbol: token.symbol,
      decimals: token.decimals,
    })),
  };
}

export function isFactoryAllowlisted(config: ContractsConfig, address: string): boolean {
  const normalized = address.trim().toLowerCase();
  return config.launchFactories.some((factory) => factory.address === normalized);
}

export function findSupportedToken(
  config: ContractsConfig,
  address: string,
): TokenConfig | undefined {
  const normalized = address.trim().toLowerCase();
  return config.supportedTokens.find((token) => token.address === normalized);
}
