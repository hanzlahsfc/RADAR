import { isAddress } from 'viem';
import { decodeErc20Transfers, ERC20_TRANSFER_TOPIC } from '../chain/adapters/erc20-transfer.js';
import { decodeNativeTransfers } from '../chain/adapters/native-transfer.js';
import { decodePonsLaunches } from '../chain/adapters/pons-launch.js';
import { ERC20_FIXTURES, NATIVE_FIXTURES, PONS_FIXTURES } from '../../tests/fixtures/index.js';
import { createLogger } from '../shared/logger.js';

/**
 * Deterministic, offline check that the committed fixtures decode into the
 * expected normalized events. This does not touch the network and is safe for CI.
 */
export function runFixtureVerification(): { failures: string[]; checks: number } {
  const failures: string[] = [];
  let checks = 0;

  for (const fixture of NATIVE_FIXTURES) {
    checks += 1;
    const events = decodeNativeTransfers(fixture.block, fixture.chainId, {
      failedHashes: fixture.failedHashes,
    });
    const expected = fixture.expectedEvents;
    if (events.length !== expected.length) {
      failures.push(
        `${fixture.name}: expected ${expected.length} native events, decoded ${events.length}`,
      );
      continue;
    }
    for (const [index, event] of events.entries()) {
      const want = expected[index];
      if (!want) continue;
      if (event.transactionHash !== want.transactionHash) {
        failures.push(`${fixture.name}: transaction hash mismatch at index ${index}`);
      }
      if (event.amountRaw !== want.amountRaw) {
        failures.push(`${fixture.name}: amount mismatch at index ${index}`);
      }
      if (want.toAddress && event.toAddress !== want.toAddress) {
        failures.push(`${fixture.name}: toAddress mismatch at index ${index}`);
      }
    }
  }

  for (const fixture of ERC20_FIXTURES) {
    checks += 1;
    if (fixture.transferLog.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) {
      failures.push(`${fixture.name}: fixture log does not use the Transfer topic`);
      continue;
    }
    const events = decodeErc20Transfers(fixture.block, fixture.receipt, fixture.chainId, {
      tokenMetadata: new Map([
        [
          fixture.token.address.toLowerCase(),
          { decimals: fixture.token.decimals, symbol: fixture.token.symbol },
        ],
      ]),
    });
    if (events.length !== fixture.expectedEvents.length) {
      failures.push(
        `${fixture.name}: expected ${fixture.expectedEvents.length} token events, decoded ${events.length}`,
      );
    }
  }

  for (const fixture of PONS_FIXTURES) {
    checks += 1;
    const events = decodePonsLaunches({
      block: fixture.block,
      receipt: fixture.receipt,
      chainId: fixture.chainId,
      config: fixture.config,
    });
    const expectedCount = fixture.expectedEvents.length;
    if (events.length !== expectedCount) {
      failures.push(
        `${fixture.name}: expected ${expectedCount} launch events, decoded ${events.length}`,
      );
    }
  }

  // Structural sanity: every address we emit must be a valid EVM address.
  for (const fixture of ERC20_FIXTURES) {
    checks += 1;
    if (!isAddress(fixture.token.address)) {
      failures.push(`${fixture.name}: invalid token address`);
    }
  }

  return { failures, checks };
}

function main(): void {
  const logger = createLogger({ level: 'info', name: 'radar:verify-fixtures' });
  const { failures, checks } = runFixtureVerification();
  if (failures.length > 0) {
    logger.error({ failures }, `fixture verification failed (${failures.length}/${checks})`);
    process.exitCode = 1;
    return;
  }
  logger.info({ checks }, 'all fixtures decoded as expected');
}

const isDirectRun =
  process.argv[1]?.replace(/\\/g, '/').endsWith('verify-fixtures.ts') ||
  process.argv[1]?.replace(/\\/g, '/').endsWith('verify-fixtures.js');

if (isDirectRun) {
  main();
}
