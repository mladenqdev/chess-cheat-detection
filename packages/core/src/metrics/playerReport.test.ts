import { describe, expect, it } from 'vitest';
import { assessPositions } from '../engine/eligibility';
import type { PositionEval } from '../engine/types';
import ndjson from '../platforms/__fixtures__/lichess-games.ndjson?raw';
import { normalizeLichessGame, type LichessGame } from '../platforms/lichess';
import {
  aggregatePlayerMetrics,
  computePlayerGameMetrics,
  MIN_ELIGIBLE_MOVES,
  type PlayerGameMetrics,
} from './playerReport';

// fixture game 1: spasski76 (white) vs thibault (black), 42 plies, openingPly 6
const game = normalizeLichessGame(JSON.parse(ndjson.split('\n')[0]!) as LichessGame);

/** synthetic evals: pv1 = the actually played move on even plies (white),
 *  pv2 = the played move on odd plies (black); constant small cp everywhere */
const evals: PositionEval[] = game.moves.map((move, ply) => ({
  fen: move.fenBefore,
  depth: 12,
  source: 'local',
  requestedMultiPv: 3,
  pvs:
    ply % 2 === 0
      ? [
          { moves: [move.uci], cp: 20 },
          { moves: ['a7a6'], cp: 10 },
          { moves: ['h7h6'], cp: 0 },
        ]
      : [
          { moves: ['a2a3'], cp: 20 },
          { moves: [move.uci], cp: 10 },
          { moves: ['h2h3'], cp: 0 },
        ],
}));

describe('computePlayerGameMetrics', () => {
  const assessments = assessPositions(game, evals);

  it('identifies the player color case-insensitively and scopes to their eligible moves', () => {
    const metrics = computePlayerGameMetrics(game, evals, assessments, 'THIBAULT');
    expect(metrics).toBeDefined();
    expect(metrics!.color).toBe('black');
    // eligible plies start at 16 (cutoff); black's are the odd ones: 17,19,...,41 → 13
    expect(metrics!.eligible).toBe(13);
    // black's played move is always pv2 in the synthetic evals
    expect(metrics!.t1).toBe(0);
    expect(metrics!.t2).toBe(13);
    expect(metrics!.t3).toBe(13);
    expect(metrics!.thinkMsEligible.length).toBeGreaterThan(0);
  });

  it('scores the white player symmetrically', () => {
    const metrics = computePlayerGameMetrics(game, evals, assessments, 'spasski76');
    expect(metrics!.color).toBe('white');
    expect(metrics!.t1).toBe(metrics!.eligible); // white always played pv1
  });

  it('returns undefined for a user not in the game', () => {
    expect(computePlayerGameMetrics(game, evals, assessments, 'magnus')).toBeUndefined();
  });
});

describe('aggregatePlayerMetrics', () => {
  const gameMetrics = (over: Partial<PlayerGameMetrics>): PlayerGameMetrics => ({
    gameId: 'g',
    url: 'u',
    color: 'white',
    timeClass: 'blitz',
    endedAt: 0,
    eligible: 0,
    t1: 0,
    t2: 0,
    t3: 0,
    cpls: [],
    thinkMsEligible: [],
    ...over,
  });

  it('pools counts, computes wilson CIs and the sample gate', () => {
    const a = aggregatePlayerMetrics([
      gameMetrics({ eligible: 60, t1: 30, t2: 40, t3: 45, cpls: [0, 100], accuracy: 80 }),
      gameMetrics({ eligible: 70, t1: 40, t2: 50, t3: 60, cpls: [50], accuracy: 90 }),
    ]);
    expect(a.games).toBe(2);
    expect(a.eligible).toBe(130);
    expect(a.t1.rate).toBeCloseTo(70 / 130);
    expect(a.t1.ci[0]).toBeGreaterThan(0.4);
    expect(a.t1.ci[1]).toBeLessThan(0.63);
    expect(a.acpl!.mean).toBeCloseTo(50);
    expect(a.acpl!.n).toBe(3);
    expect(a.accuracyMean!.mean).toBeCloseTo(85);
    expect(a.sampleOk).toBe(true); // 130 >= 120
  });

  it('flags insufficient samples', () => {
    const a = aggregatePlayerMetrics([gameMetrics({ eligible: MIN_ELIGIBLE_MOVES - 1 })]);
    expect(a.sampleOk).toBe(false);
    expect(a.acpl).toBeUndefined();
  });
});
