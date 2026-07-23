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
 *  pv2 = the played move on odd plies (black). PVs are ordered best-for-the-mover
 *  first (the real engine convention), so white plies descend in white-POV cp
 *  and black plies ascend. */
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
          { moves: ['a2a3'], cp: 0 },
          { moves: [move.uci], cp: 10 },
          { moves: ['h2h3'], cp: 20 },
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
    // every eligible move with a clock and ≥2 PVs yields a (time, difficulty) pair
    expect(metrics!.timeDifficulty.length).toBe(metrics!.thinkMsEligible.length);
    expect(metrics!.timeDifficulty[0]!.gapCp).toBe(10); // synthetic evals: pv1 20cp, pv2 10cp
  });

  it('scores the white player symmetrically', () => {
    const metrics = computePlayerGameMetrics(game, evals, assessments, 'spasski76');
    expect(metrics!.color).toBe('white');
    expect(metrics!.t1).toBe(metrics!.eligible); // white always played pv1
    // every eligible white move had a usable eval and top-matched
    expect(metrics!.matchScored).toBe(metrics!.eligible);
    expect(metrics!.observedT1OnScored).toBe(metrics!.eligible);
    // the model never fully expects the top move (pvs 20/10/0), so observed > expected
    expect(metrics!.expectedT1).toBeLessThan(metrics!.eligible);
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
    matchScored: 0,
    observedT1OnScored: 0,
    expectedT1: 0,
    expectedT1Var: 0,
    cpls: [],
    thinkMsEligible: [],
    timeDifficulty: [],
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

  it('derives consistency and time-difficulty correlation from pooled games', () => {
    // 5 games, human-like: harder decisions (small gap) get more time
    const games = Array.from({ length: 5 }, (_, i) =>
      gameMetrics({
        eligible: 30,
        accuracy: 75 + i * 4, // swinging accuracies → healthy spread
        timeDifficulty: Array.from({ length: 8 }, (_, j) => ({
          thinkMs: 12_000 - j * 1200 + i * 100,
          gapCp: j * 25,
        })),
      }),
    );
    const a = aggregatePlayerMetrics(games);
    expect(a.accuracyStd!.value).toBeGreaterThan(4);
    expect(a.timeComplexityCorr!.n).toBe(40);
    expect(a.timeComplexityCorr!.value).toBeLessThan(-0.8); // strongly human
  });

  it('flags insufficient samples', () => {
    const a = aggregatePlayerMetrics([gameMetrics({ eligible: MIN_ELIGIBLE_MOVES - 1 })]);
    expect(a.sampleOk).toBe(false);
    expect(a.acpl).toBeUndefined();
  });

  it('z-scores observed vs model-expected top matches (self-referential, no cohort)', () => {
    // model expects half the top moves found: expected 65, variance 0.25·130 = 32.5
    const asExpected = aggregatePlayerMetrics([
      gameMetrics({
        eligible: 130,
        matchScored: 130,
        observedT1OnScored: 65,
        expectedT1: 65,
        expectedT1Var: 32.5,
      }),
    ]);
    expect(asExpected.matchVsExpected!.z).toBeCloseTo(0, 6);
    expect(asExpected.matchVsExpected!.n).toBe(130);

    // far more matches than the model predicts → strongly positive (engine-like)
    const overMatch = aggregatePlayerMetrics([
      gameMetrics({
        eligible: 130,
        matchScored: 130,
        observedT1OnScored: 110,
        expectedT1: 65,
        expectedT1Var: 32.5,
      }),
    ]);
    expect(overMatch.matchVsExpected!.z).toBeGreaterThan(5);

    // withheld under the sample gate
    const tiny = aggregatePlayerMetrics([
      gameMetrics({
        eligible: 10,
        matchScored: 10,
        observedT1OnScored: 9,
        expectedT1: 5,
        expectedT1Var: 2.5,
      }),
    ]);
    expect(tiny.matchVsExpected).toBeUndefined();
  });
});
