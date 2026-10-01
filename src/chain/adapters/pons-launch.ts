import type { Hex } from 'viem';
import type { Address } from '../../shared/addresses.js';
import { NotImplementedError } from '../../shared/errors.js';
import type { ChainEvent, NormalizedBlock, NormalizedReceipt } from '../types.js';

/**
 * A verified launch-factory entry. `launchEventTopic` and the topic/data
 * positions may ONLY be filled in after the deployment, ABI, and a real launch
 * transaction have been verified on the target network (Phase 5).
 */
export interface PonsFactoryEntry {
  address: Address;
  version: string;
  launchEventTopic: Hex;
  /** Indexed topic position of the creator address (1-based, after topic0). */
  creatorTopicIndex: number;
  /** Indexed topic position of the launched token, if indexed. */
  tokenTopicIndex?: number;
  /** Byte offset (in 32-byte words) of the launched token in data, if not indexed. */
  tokenDataWordIndex?: number;
}

export interface PonsLaunchConfig {
  factories: PonsFactoryEntry[];
  supportedVersions: string[];
}

export interface PonsDecodeInput {
  block: NormalizedBlock;
  receipt: NormalizedReceipt;
  chainId: number;
  config: PonsLaunchConfig;
}

export const EMPTY_PONS_CONFIG: PonsLaunchConfig = { factories: [], supportedVersions: [] };

/**
 * Decode verified Pons launch events. This adapter is deliberately strict:
 *  - the log must come from an allowlisted factory,
 *  - the event signature (topic0) must be a known, verified signature,
 *  - the transaction must not have reverted,
 *  - the factory version must be supported,
 *  - a launch is NEVER inferred from a token transfer or the transaction sender.
 *
 * With an empty allowlist (the Phase 0 default) it emits nothing, so launch
 * alerts stay disabled until verification completes.
 */
export function decodePonsLaunches(input: PonsDecodeInput): ChainEvent[] {
  const { block, receipt, chainId, config } = input;
  if (receipt.status !== 'success') return [];
  if (config.factories.length === 0) return [];

  const events: ChainEvent[] = [];
  for (const log of receipt.logs) {
    if (log.removed) continue;
    const factory = config.factories.find((entry) => entry.address === log.address.toLowerCase());
    if (!factory) continue; // non-allowlisted factory → reject
    if (!config.supportedVersions.includes(factory.version)) continue; // unsupported version → reject

    const topic0 = log.topics[0]?.toLowerCase();
    if (!topic0 || topic0 !== factory.launchEventTopic.toLowerCase()) continue; // unknown signature → reject

    const creator = topicAddress(log.topics[factory.creatorTopicIndex]);
    if (!creator) continue;

    const launchedToken =
      factory.tokenTopicIndex !== undefined
        ? topicAddress(log.topics[factory.tokenTopicIndex])
        : dataWordAddress(log.data, factory.tokenDataWordIndex ?? 0);
    if (!launchedToken) continue;

    events.push({
      chainId,
      blockNumber: block.number,
      blockHash: block.hash,
      transactionHash: receipt.transactionHash,
      eventKey: `log:${log.logIndex}:token_launch`,
      kind: 'token_launch',
      timestamp: block.timestamp,
      creatorAddress: creator,
      factoryAddress: factory.address,
      launchedTokenAddress: launchedToken,
      canonical: true,
      confirmationStatus: 'confirmed',
    });
  }
  return events;
}

/** Guard for callers: throws while launch monitoring is unconfigured. */
export function assertPonsConfigured(config: PonsLaunchConfig): void {
  if (config.factories.length === 0) {
    throw new NotImplementedError(
      'Pons launch monitoring is disabled: no verified factory deployment. See docs/NETWORK_VERIFICATION.md.',
    );
  }
}

function topicAddress(topic: Hex | undefined): Address | undefined {
  if (!topic) return undefined;
  const hex = topic.toLowerCase();
  if (hex.length !== 66) return undefined;
  const address = hex.slice(26);
  if (/^0+$/.test(address)) return undefined;
  return `0x${address}` as Address;
}

function dataWordAddress(data: Hex, wordIndex: number): Address | undefined {
  const hex = data.toLowerCase().replace(/^0x/, '');
  const start = wordIndex * 64;
  const end = start + 64;
  if (hex.length < end) return undefined;
  const word = hex.slice(start, end);
  const address = word.slice(24);
  if (/^0+$/.test(address)) return undefined;
  return `0x${address}` as Address;
}
