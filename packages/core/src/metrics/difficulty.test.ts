import { describe, expect, it } from 'vitest';
import type { PositionEval } from '../engine/types';
import { positionDifficulty, scaledValueDrop } from './difficulty';

/** position with the given white-POV cp scores, best line first */
function pos(...cps: number[]): PositionEval {
  return {
    fen: 'x',
    depth: 12,
    source: 'local',
    pvs: cps.map((cp, i) => ({ moves: [`m${i}`], cp })),
  };
}

describe('scaledValueDrop', () => {
  it('is 0 for the best move and grows with the gap', () => {
    expect(scaledValueDrop(50, 50)).toBe(0);
    expect(scaledValueDrop(50, -200)).toBeGreaterThan(scaledValueDrop(50, 0));
  });

  it('compresses a marginal centipawn more when already winning (log scaling)', () => {
    // a 100cp drop near equality hurts more than the same drop when already +900
    const nearEqual = scaledValueDrop(100, 0);
    const winning = scaledValueDrop(1000, 900);
    expect(nearEqual).toBeGreaterThan(winning);
  });
});

describe('positionDifficulty', () => {
  it('returns undefined without an eval or lines', () => {
    expect(positionDifficulty(undefined, 'white')).toBeUndefined();
    expect(
      positionDifficulty({ fen: 'x', depth: 12, source: 'local', pvs: [] }, 'white'),
    ).toBeUndefined();
  });

  it('treats a single legal line as forced: no hazard, certain match', () => {
    const d = positionDifficulty(pos(30), 'white')!;
    expect(d.hazard).toBe(0);
    expect(d.expectedTopMatch).toBe(1);
    expect(d.moveCount).toBe(1);
  });

  it('a wider gap makes the top move easier to find (higher expectedTopMatch)', () => {
    const obvious = positionDifficulty(pos(50, -300), 'white')!;
    const sharp = positionDifficulty(pos(30, 20), 'white')!;
    expect(obvious.expectedTopMatch).toBeGreaterThan(sharp.expectedTopMatch);
  });

  it('expectedTopMatch rises monotonically with the gap', () => {
    const close = positionDifficulty(pos(30, 25), 'white')!;
    const wide = positionDifficulty(pos(30, -200), 'white')!;
    expect(wide.expectedTopMatch).toBeGreaterThan(close.expectedTopMatch);
  });

  it('hazard is expected points loss: ~0 when forced or all moves are equal, positive when a blunder is available', () => {
    expect(positionDifficulty(pos(30), 'white')!.hazard).toBe(0);
    expect(positionDifficulty(pos(0, 0, 0), 'white')!.hazard).toBeCloseTo(0, 6);
    expect(positionDifficulty(pos(30, -150), 'white')!.hazard).toBeGreaterThan(0);
  });

  it('many equally-good moves: the specific top move is not obvious (p0 ≈ 1/3)', () => {
    const d = positionDifficulty(pos(0, 0, 0), 'white')!;
    expect(d.expectedTopMatch).toBeCloseTo(1 / 3, 2);
  });

  it('keeps hazard non-negative and probability in range for a black mover', () => {
    const d = positionDifficulty(pos(-40, -60, -300), 'black')!;
    expect(d.hazard).toBeGreaterThanOrEqual(0);
    expect(d.expectedTopMatch).toBeGreaterThan(0);
    expect(d.expectedTopMatch).toBeLessThanOrEqual(1);
  });
});
