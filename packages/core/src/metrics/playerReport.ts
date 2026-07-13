import type { PositionAssessment } from '../engine/eligibility';
import { pvScoreCp, type Color, type PositionEval } from '../engine/types';
import type { NormalizedGame, TimeClass } from '../types';
import { gameAccuracy, type GameAccuracy } from './accuracy';
import { moveCentipawnLoss } from './cpl';
import { engineMatchRank } from './engineMatch';
import { clamp, mean, spearmanCorrelation, stddev, wilsonInterval } from './stats';
import { thinkStats, thinkTimesMs, type ThinkStats } from './time';

/**
 * Regan's "Larsen line": below ~120 eligible moves no conclusion is
 * statistically defensible, whatever the rates look like.
 */
export const MIN_ELIGIBLE_MOVES = 120;

export interface PlayerGameMetrics {
  gameId: string;
  url: string;
  color: Color;
  timeClass: TimeClass;
  endedAt: number;
  rating?: number;
  opponentRating?: number;
  /** eligible positions where this player moved */
  eligible: number;
  /** engine-match counts over eligible moves (cumulative: t2 includes t1) */
  t1: number;
  t2: number;
  t3: number;
  /** per-move centipawn losses on eligible moves (capped at CPL_CAP) */
  cpls: number[];
  /** our lichess-formula game accuracy over all moves */
  accuracy?: number;
  /** what the platform reported, when it did */
  platformAccuracy?: number;
  /** think times on this player's eligible moves */
  thinkMsEligible: number[];
  /**
   * (think time, decision difficulty) pairs on eligible moves; difficulty is
   * the PV1−PV2 gap in cp from the mover's POV — small gap = genuinely hard
   * choice. Humans think longer on hard choices; assistance doesn't.
   */
  timeDifficulty: { thinkMs: number; gapCp: number }[];
}

/**
 * Game accuracy for both players from our position evals.
 * cps[i] (eval after move i) = best line of the position before move i+1;
 * the final move has no successor eval and is skipped — same hole semantics
 * as lichess uses for mate scores.
 */
export function gameAccuracyFromPositionEvals(
  game: NormalizedGame,
  evals: (PositionEval | undefined)[],
): GameAccuracy {
  const cps = game.moves.map((_, ply) => {
    const next = evals[ply + 1];
    if (!next || next.pvs.length === 0) return undefined;
    return clamp(pvScoreCp(next.pvs[0]!, 'white'), -1000, 1000);
  });
  return gameAccuracy(cps);
}

export function computePlayerGameMetrics(
  game: NormalizedGame,
  evals: (PositionEval | undefined)[],
  assessments: PositionAssessment[],
  username: string,
): PlayerGameMetrics | undefined {
  const uname = username.toLowerCase();
  const color: Color | undefined =
    game.white.username.toLowerCase() === uname
      ? 'white'
      : game.black.username.toLowerCase() === uname
        ? 'black'
        : undefined;
  if (!color) return undefined;
  const opponent = color === 'white' ? 'black' : 'white';

  const times = thinkTimesMs(game);
  let eligible = 0;
  let t1 = 0;
  let t2 = 0;
  let t3 = 0;
  const cpls: number[] = [];
  const thinkMsEligible: number[] = [];
  const timeDifficulty: { thinkMs: number; gapCp: number }[] = [];

  for (const assessment of assessments) {
    if (assessment.moverColor !== color || !assessment.eligible) continue;
    eligible++;
    const rank = engineMatchRank(assessment.playedUci, evals[assessment.ply]);
    if (rank !== undefined) {
      if (rank <= 1) t1++;
      if (rank <= 2) t2++;
      if (rank <= 3) t3++;
    }
    const cpl = moveCentipawnLoss(
      assessment.playedUci,
      color,
      evals[assessment.ply],
      evals[assessment.ply + 1],
    );
    if (cpl !== undefined) cpls.push(cpl);
    const think = times[assessment.ply];
    if (think !== undefined) thinkMsEligible.push(think);
    const evalBefore = evals[assessment.ply];
    if (think !== undefined && evalBefore && evalBefore.pvs.length >= 2) {
      timeDifficulty.push({
        thinkMs: think,
        gapCp: pvScoreCp(evalBefore.pvs[0]!, color) - pvScoreCp(evalBefore.pvs[1]!, color),
      });
    }
  }

  return {
    gameId: game.id,
    url: game.url,
    color,
    timeClass: game.timeClass,
    endedAt: game.endedAt,
    rating: game[color].rating,
    opponentRating: game[opponent].rating,
    eligible,
    t1,
    t2,
    t3,
    cpls,
    accuracy: gameAccuracyFromPositionEvals(game, evals)[color],
    platformAccuracy: game[color].accuracy,
    thinkMsEligible,
    timeDifficulty,
  };
}

export interface RateWithCi {
  successes: number;
  n: number;
  rate: number;
  /** 95% Wilson interval */
  ci: [number, number];
}

export interface PlayerAggregate {
  games: number;
  eligible: number;
  t1: RateWithCi;
  t2: RateWithCi;
  t3: RateWithCi;
  acpl?: { mean: number; std: number; n: number };
  accuracyMean?: { mean: number; n: number };
  timing?: ThinkStats;
  /** spread of per-game accuracy — assistance is steadier game-to-game than humans */
  accuracyStd?: { value: number; n: number };
  /** Spearman corr(think time, decision difficulty gap): humans negative, assistance ≈ 0 */
  timeComplexityCorr?: { value: number; n: number };
  /** eligible >= MIN_ELIGIBLE_MOVES — below it, show no conclusions */
  sampleOk: boolean;
}

export function aggregatePlayerMetrics(perGame: PlayerGameMetrics[]): PlayerAggregate {
  const eligible = perGame.reduce((n, g) => n + g.eligible, 0);
  const rate = (successes: number): RateWithCi => ({
    successes,
    n: eligible,
    rate: eligible > 0 ? successes / eligible : 0,
    ci: wilsonInterval(successes, eligible),
  });
  const cpls = perGame.flatMap((g) => g.cpls);
  const accuracies = perGame.flatMap((g) => (g.accuracy !== undefined ? [g.accuracy] : []));
  const thinkTimes = perGame.flatMap((g) => g.thinkMsEligible);
  const pairs = perGame.flatMap((g) => g.timeDifficulty);
  const corr =
    pairs.length >= 30
      ? spearmanCorrelation(
          pairs.map((p) => p.thinkMs),
          pairs.map((p) => p.gapCp),
        )
      : undefined;
  const sampleOk = eligible >= MIN_ELIGIBLE_MOVES;

  return {
    games: perGame.length,
    eligible,
    t1: rate(perGame.reduce((n, g) => n + g.t1, 0)),
    t2: rate(perGame.reduce((n, g) => n + g.t2, 0)),
    t3: rate(perGame.reduce((n, g) => n + g.t3, 0)),
    // stat summaries are withheld under the sample gate — a tiny sample reads
    // as precision it doesn't have
    acpl:
      sampleOk && cpls.length > 0
        ? { mean: mean(cpls), std: stddev(cpls), n: cpls.length }
        : undefined,
    accuracyMean:
      sampleOk && accuracies.length > 0
        ? { mean: mean(accuracies), n: accuracies.length }
        : undefined,
    timing: sampleOk ? thinkStats(thinkTimes) : undefined,
    accuracyStd:
      sampleOk && accuracies.length >= 5
        ? { value: stddev(accuracies), n: accuracies.length }
        : undefined,
    timeComplexityCorr:
      sampleOk && corr !== undefined ? { value: corr, n: pairs.length } : undefined,
    sampleOk,
  };
}
