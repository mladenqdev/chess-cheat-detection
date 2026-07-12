import { describe, expect, it } from 'vitest';
import type { PositionEval } from '../engine/types';
import { engineMatchRank } from './engineMatch';

const evalWithPvs = (...firstMoves: string[]): PositionEval => ({
  fen: 'x',
  depth: 12,
  source: 'local',
  pvs: firstMoves.map((m, i) => ({ moves: [m, 'reply'], cp: 50 - i * 10 })),
});

describe('engineMatchRank', () => {
  it('returns the 1-based rank of the played move among pv first-moves', () => {
    const ev = evalWithPvs('e2e4', 'd2d4', 'g1f3');
    expect(engineMatchRank('e2e4', ev)).toBe(1);
    expect(engineMatchRank('d2d4', ev)).toBe(2);
    expect(engineMatchRank('g1f3', ev)).toBe(3);
  });

  it('returns undefined for non-matching moves or missing evals', () => {
    expect(engineMatchRank('a2a3', evalWithPvs('e2e4', 'd2d4'))).toBeUndefined();
    expect(engineMatchRank('e2e4', undefined)).toBeUndefined();
  });
});
