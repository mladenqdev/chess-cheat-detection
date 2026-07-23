import { describe, expect, it } from 'vitest';
import ndjson from '../platforms/__fixtures__/lichess-games.ndjson?raw';
import type { LichessGame } from '../platforms/lichess';
import { gameAccuracy, moveAccuracyFromWinPercents } from './accuracy';

const analysedRaw = JSON.parse(ndjson.split('\n')[1]!) as LichessGame;

describe('moveAccuracyFromWinPercents (mover POV)', () => {
  it('is 100 when the position did not get worse', () => {
    expect(moveAccuracyFromWinPercents(50, 50)).toBe(100);
    expect(moveAccuracyFromWinPercents(40, 55)).toBe(100);
  });

  it('decreases monotonically with the win% drop', () => {
    const drops = [1, 5, 10, 20, 40].map((d) => moveAccuracyFromWinPercents(60, 60 - d));
    for (let i = 1; i < drops.length; i++) expect(drops[i]!).toBeLessThan(drops[i - 1]!);
  });

  it('clamps to [0, 100]', () => {
    expect(moveAccuracyFromWinPercents(100, 0)).toBe(0);
    expect(moveAccuracyFromWinPercents(50, 49.999)).toBeLessThanOrEqual(100);
  });
});

describe('gameAccuracy', () => {
  it('reproduces the platform-reported accuracies from the platform evals (golden test)', () => {
    // the fixture game has lichess server analysis: white accuracy 75, black 81.
    // feed lichess's own per-move evals through our port, the numbers must agree.
    const cps = analysedRaw.analysis!.map((entry) =>
      entry.eval !== undefined ? entry.eval : undefined,
    );
    const result = gameAccuracy(cps);
    expect(result.white).toBeDefined();
    expect(result.black).toBeDefined();
    expect(Math.round(result.white!)).toBe(75);
    expect(Math.round(result.black!)).toBe(81);
  });

  it('rates a flawless drawish line near 100 for both sides', () => {
    const cps = Array.from({ length: 30 }, () => 10);
    const result = gameAccuracy(cps);
    expect(result.white!).toBeGreaterThan(95);
    expect(result.black!).toBeGreaterThan(95);
  });

  it('punishes the side that blunders', () => {
    // cps[i] is the eval after move i; even i = white's move. the crash at
    // i=6 (white's 4th move) makes it a white blunder.
    const cps = [20, 15, 20, 10, 15, 5, -800, -800, -790, -805, -795, -800, -800, -795];
    const result = gameAccuracy(cps);
    expect(result.white!).toBeLessThan(result.black! - 10);
  });

  it('returns undefined for empty games', () => {
    expect(gameAccuracy([])).toEqual({ white: undefined, black: undefined });
  });
});
