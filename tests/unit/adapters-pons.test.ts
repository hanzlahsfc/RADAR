import { describe, expect, it } from 'vitest';
import {
  assertPonsConfigured,
  decodePonsLaunches,
  EMPTY_PONS_CONFIG,
} from '../../src/chain/adapters/pons-launch.js';
import { NotImplementedError } from '../../src/shared/errors.js';
import { ADDRESSES, PONS_CONFIG, PONS_FIXTURES } from '../fixtures/index.js';

describe('Pons launch decoding (strict)', () => {
  it('decodes an allowlisted, known-signature launch', () => {
    const fixture = PONS_FIXTURES[0]!;
    const events = decodePonsLaunches({
      block: fixture.block,
      receipt: fixture.receipt,
      chainId: fixture.chainId,
      config: fixture.config,
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('token_launch');
    expect(events[0]?.creatorAddress).toBe(ADDRESSES.watched);
    expect(events[0]?.launchedTokenAddress).toBe(ADDRESSES.launchedToken);
    expect(events[0]?.factoryAddress).toBe(ADDRESSES.factory);
  });

  it('rejects non-allowlisted factories, unknown signatures, reverted txs, and empty allowlists', () => {
    for (const fixture of PONS_FIXTURES.slice(1)) {
      const events = decodePonsLaunches({
        block: fixture.block,
        receipt: fixture.receipt,
        chainId: fixture.chainId,
        config: fixture.config,
      });
      expect(events, fixture.name).toHaveLength(0);
    }
  });

  it('never infers a launch from a token transfer alone', () => {
    // A Transfer log from the allowlisted factory address is still not a launch.
    const fixture = PONS_FIXTURES[2]!;
    expect(
      decodePonsLaunches({
        block: fixture.block,
        receipt: fixture.receipt,
        chainId: fixture.chainId,
        config: fixture.config,
      }),
    ).toHaveLength(0);
  });

  it('reports launch monitoring as disabled while the allowlist is empty', () => {
    expect(() => assertPonsConfigured(EMPTY_PONS_CONFIG)).toThrow(NotImplementedError);
    expect(() => assertPonsConfigured(PONS_CONFIG)).not.toThrow();
  });
});
