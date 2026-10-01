import { createChainClient } from '../chain/client.js';
import { createExplorerHistoryProvider } from '../chain/explorer-history-provider.js';
import { createRpcBlockProvider } from '../chain/rpc-block-provider.js';
import { loadEnv, redactedEnvSummary } from '../config/env.js';
import { deriveNetworkConfig, type NetworkConfig } from '../config/network.js';
import { isAddressLike } from '../shared/addresses.js';
import type { Hash } from '../chain/types.js';
import { loadEnvFile } from '../shared/env-file.js';
import { ConfigError, ProviderError } from '../shared/errors.js';
import { createLogger, redactUrl } from '../shared/logger.js';

export type CheckStatus = 'ok' | 'unsupported' | 'failed' | 'skipped';

export interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
  evidence?: Record<string, unknown>;
}

export interface NetworkReport {
  generatedAt: string;
  network: { chainId: number; rpcRedacted: string; explorerApiBaseUrl: string | null };
  checks: CheckResult[];
  summary: {
    ok: number;
    unsupported: number;
    failed: number;
    skipped: number;
    chainIdMatches: boolean;
  };
}

function messageOf(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

/**
 * Read-only network verification. It performs NO writes and NO transactions.
 * Every provider claim is recorded with evidence (or explicitly marked
 * unsupported/skipped) so the report never overstates what was verified.
 */
export async function verifyNetwork(network: NetworkConfig): Promise<NetworkReport> {
  const client = createChainClient(network);
  const reader = createRpcBlockProvider(client, network);
  const checks: CheckResult[] = [];

  // 1. chainId
  let chainIdMatches = false;
  try {
    const reported = await client.getChainId();
    chainIdMatches = reported === network.chainId;
    checks.push({
      name: 'eth_chainId',
      status: chainIdMatches ? 'ok' : 'failed',
      detail: chainIdMatches
        ? `RPC reports chainId ${reported}, matching CHAIN_ID.`
        : `MISMATCH: RPC reports chainId ${reported} but CHAIN_ID is ${network.chainId}. Do not enable this configuration.`,
      evidence: { reportedChainId: reported, configuredChainId: network.chainId },
    });
  } catch (error) {
    checks.push({
      name: 'eth_chainId',
      status: 'failed',
      detail: `Could not read eth_chainId: ${messageOf(error)}`,
    });
  }

  // 2. latest block
  let latestBlockNumber: bigint | null = null;
  try {
    const latest = await client.getBlock({ blockTag: 'latest' });
    latestBlockNumber = latest.number ?? null;
    const timestamp = new Date(Number(latest.timestamp) * 1000).toISOString();
    checks.push({
      name: 'latest_block',
      status: 'ok',
      detail: `Latest block ${latest.number} at ${timestamp}.`,
      evidence: { number: latest.number?.toString() ?? null, hash: latest.hash, timestamp },
    });
  } catch (error) {
    checks.push({
      name: 'latest_block',
      status: 'failed',
      detail: `Could not read the latest block: ${messageOf(error)}`,
    });
  }

  // 3. safe / finalized tag support (acceptance != economic finality)
  for (const tag of ['safe', 'finalized'] as const) {
    try {
      const block = await client.getBlock({ blockTag: tag });
      checks.push({
        name: `block_tag_${tag}`,
        status: 'ok',
        detail: `Provider accepts the "${tag}" tag (block ${block.number}). NOTE: acceptance does not prove the chain's documented finality semantics — confirm against official documentation.`,
        evidence: { number: block.number?.toString() ?? null },
      });
    } catch (error) {
      checks.push({
        name: `block_tag_${tag}`,
        status: 'unsupported',
        detail: `Provider rejected the "${tag}" tag: ${messageOf(error)}. Choose FINALITY_MODE accordingly.`,
      });
    }
  }

  // 4. transaction + receipt retrieval
  const txHash = process.env.VERIFY_TX_HASH?.trim();
  if (txHash && /^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    try {
      const transaction = await client.getTransaction({ hash: txHash as Hash });
      const receipt = await reader.getReceipt(txHash as `0x${string}`);
      if (transaction.blockNumber !== null && transaction.blockNumber !== receipt.blockNumber) {
        throw new ProviderError('Transaction block does not match its receipt block');
      }
      checks.push({
        name: 'receipt_retrieval',
        status: 'ok',
        detail: `Fetched transaction and receipt for ${txHash}: status=${receipt.status}, block=${receipt.blockNumber}, logs=${receipt.logs.length}.`,
        evidence: {
          transactionHash: txHash,
          blockNumber: receipt.blockNumber.toString(),
          status: receipt.status,
          logCount: receipt.logs.length,
        },
      });
    } catch (error) {
      checks.push({
        name: 'receipt_retrieval',
        status: 'failed',
        detail: `Could not fetch receipt for VERIFY_TX_HASH: ${messageOf(error)}`,
      });
    }
  } else {
    checks.push({
      name: 'receipt_retrieval',
      status: 'skipped',
      detail: 'Set VERIFY_TX_HASH to a known transaction hash to verify receipt retrieval.',
    });
  }

  // 5. bounded eth_getLogs
  if (latestBlockNumber !== null) {
    const fromBlock = latestBlockNumber > 10n ? latestBlockNumber - 10n : 0n;
    try {
      const logs = await reader.getLogs({ fromBlock, toBlock: latestBlockNumber });
      checks.push({
        name: 'bounded_get_logs',
        status: 'ok',
        detail: `eth_getLogs over ${fromBlock}..${latestBlockNumber} returned ${logs.length} log(s); adaptive chunking is available on rejection.`,
        evidence: {
          fromBlock: fromBlock.toString(),
          toBlock: latestBlockNumber.toString(),
          logCount: logs.length,
        },
      });
    } catch (error) {
      checks.push({
        name: 'bounded_get_logs',
        status: 'failed',
        detail: `Bounded eth_getLogs failed: ${messageOf(error)}`,
      });
    }
  } else {
    checks.push({
      name: 'bounded_get_logs',
      status: 'skipped',
      detail: 'Latest block unknown; skipping log query.',
    });
  }

  // 6. historical address API pagination/limits
  const verifyAddress = process.env.VERIFY_ADDRESS?.trim();
  const explorerBase = network.explorerApiBaseUrl ?? network.explorerBaseUrl;
  if (!explorerBase) {
    checks.push({
      name: 'explorer_history',
      status: 'unsupported',
      detail:
        'No explorer API base URL configured; historical address coverage cannot be verified.',
    });
  } else if (!verifyAddress || !isAddressLike(verifyAddress)) {
    checks.push({
      name: 'explorer_history',
      status: 'skipped',
      detail: 'Set VERIFY_ADDRESS to a known address to probe historical pagination.',
    });
  } else {
    try {
      const provider = createExplorerHistoryProvider({
        apiBaseUrl: explorerBase,
        ...(network.explorerApiKey ? { apiKey: network.explorerApiKey } : {}),
        chainId: network.chainId,
      });
      const now = new Date();
      const query = {
        address: verifyAddress.toLowerCase() as `0x${string}`,
        fromTimestamp: new Date(now.getTime() - 72 * 3600 * 1000),
        toTimestamp: now,
        limit: 5,
      };
      const firstPage = await provider.getAddressHistory(query);
      let pagesChecked = 1;
      let page = firstPage;
      let continuationAccepted = false;
      if (firstPage.nextCursor) {
        page = await provider.getAddressHistory({ ...query, cursor: firstPage.nextCursor });
        pagesChecked += 1;
        continuationAccepted = true;
      }
      const candidates = firstPage.transactions.length + page.transactions.length;
      checks.push({
        name: 'explorer_history',
        status: continuationAccepted ? 'ok' : 'unsupported',
        detail: continuationAccepted
          ? 'Fetched ' +
            pagesChecked +
            ' history pages and ' +
            candidates +
            ' candidate(s); next-page cursor was accepted. Exhaustive pagination and token-only coverage still require provider-specific confirmation.'
          : 'Only one history page was available (' +
            candidates +
            ' candidate(s)); there was no continuation cursor to exercise pagination.',
        evidence: {
          pagesChecked,
          candidates,
          continuationAccepted,
          finalPageComplete: page.complete,
        },
      });
    } catch (error) {
      checks.push({
        name: 'explorer_history',
        status: 'failed',
        detail: `Address history probe failed: ${messageOf(error)}. Live historical coverage remains BLOCKED until this succeeds.`,
      });
    }
  }

  // 7. internal transactions — provider-specific; never assume coverage.
  checks.push({
    name: 'internal_transactions',
    status: 'unsupported',
    detail:
      'Whether internal (trace-derived) transactions are included is provider-specific and has NOT been verified. Do not assume coverage; record the provider rule in docs/NETWORK_VERIFICATION.md once confirmed.',
  });

  const summary = {
    ok: checks.filter((check) => check.status === 'ok').length,
    unsupported: checks.filter((check) => check.status === 'unsupported').length,
    failed: checks.filter((check) => check.status === 'failed').length,
    skipped: checks.filter((check) => check.status === 'skipped').length,
    chainIdMatches,
  };

  return {
    generatedAt: new Date().toISOString(),
    network: {
      chainId: network.chainId,
      rpcRedacted: '[redacted]',
      explorerApiBaseUrl: network.explorerApiBaseUrl ? redactUrl(network.explorerApiBaseUrl) : null,
    },
    checks,
    summary,
  };
}

async function main(): Promise<void> {
  loadEnvFile();
  const logger = createLogger({
    level: process.env.LOG_LEVEL ?? 'info',
    name: 'radar:verify-network',
  });

  let env;
  try {
    env = loadEnv({ role: 'verify' });
  } catch (error) {
    if (error instanceof ConfigError) {
      logger.error({ code: error.code, context: error.context }, error.message);
      logger.error(
        'Provide CHAIN_ID and RPC_HTTP_URL (read-only) to run network verification. This command never sends transactions.',
      );
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  const network = deriveNetworkConfig(env);
  if (!network) {
    logger.error('Chain configuration is incomplete.');
    process.exitCode = 2;
    return;
  }

  logger.info({ env: redactedEnvSummary(env) }, 'starting read-only network verification');
  const report = await verifyNetwork(network);

  for (const check of report.checks) {
    logger.info({ status: check.status, check: check.name }, check.detail);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (!report.summary.chainIdMatches || report.summary.failed > 0) {
    logger.error({ summary: report.summary }, 'network verification found blocking problems');
    process.exitCode = 1;
    return;
  }
  logger.info({ summary: report.summary }, 'network verification finished');
}

const entry = process.argv[1]?.replace(/\\/g, '/') ?? '';
if (
  entry.endsWith('entrypoints/verify-network.ts') ||
  entry.endsWith('entrypoints/verify-network.js')
) {
  await main();
}
