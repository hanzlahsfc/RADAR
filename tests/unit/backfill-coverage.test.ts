import { describe, expect, it } from 'vitest';
import { computeCoverageGaps, isFullyCovered } from '../../src/indexer/backfill.js';

const H = (hour: number): Date =>
  new Date(`2026-01-01T${String(hour).padStart(2, '0')}:00:00.000Z`);

const requested = { start: H(0), end: H(10) };

describe('coverage gap computation', () => {
  it('reports the whole window as a gap when nothing is covered', () => {
    const gaps = computeCoverageGaps(requested, []);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.start).toEqual(H(0));
    expect(gaps[0]?.end).toEqual(H(10));
  });

  it('reports no gaps when the window is fully covered', () => {
    expect(computeCoverageGaps(requested, [{ start: H(0), end: H(10) }])).toHaveLength(0);
    expect(
      isFullyCovered(requested, [{ start: new Date('2025-12-31T23:00:00.000Z'), end: H(10) }]),
    ).toBe(true);
  });

  it('reports the two uncovered edges when only the middle is covered', () => {
    const gaps = computeCoverageGaps(requested, [{ start: H(3), end: H(6) }]);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]?.start).toEqual(H(0));
    expect(gaps[0]?.end).toEqual(H(3));
    expect(gaps[1]?.start).toEqual(H(6));
    expect(gaps[1]?.end).toEqual(H(10));
  });

  it('handles multiple and overlapping ranges', () => {
    const gaps = computeCoverageGaps(requested, [
      { start: H(0), end: H(2) },
      { start: H(1), end: H(4) },
      { start: H(7), end: H(10) },
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.start).toEqual(H(4));
    expect(gaps[0]?.end).toEqual(H(7));
  });

  it('ignores coverage entirely outside the requested window', () => {
    const gaps = computeCoverageGaps(requested, [{ start: H(20), end: H(22) }]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.start).toEqual(H(0));
    expect(gaps[0]?.end).toEqual(H(10));
  });
});
