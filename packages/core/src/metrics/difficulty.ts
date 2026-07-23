import { pvScoreCp, type Color, type PositionEval } from '../engine/types';
import { clamp } from './stats';

/**
 * Position difficulty à la Regan, the missing "how hard was this choice"
 * weight that lets a match in a sharp position count for more than a match on
 * an obvious recapture. Built from the MultiPV lines we already compute.
 *
 * Two ideas from Regan & Haworth (2011) / Regan (2012):
 *  1. Value differences are perceived LOGARITHMICALLY, not in raw centipawns,  *     a marginal centipawn matters far more near equality than when already
 *     winning. So drops are measured with G(x) = sign(x)·ln(1+|x|) (pawns).
 *  2. A simplified move-choice model turns those drops into a probability that
 *     a cohort-typical player picks each move. This yields two distinct facets:
 *       - hazard = Σ p_i·δ_i, the expected points a typical player loses here,  *         the natural yardstick for the ERROR side (ACPL): losing points where
 *         hazard is high is normal, losing none is impressive.
 *       - expectedTopMatch = p_0, the probability that player even finds the top
 *         move, the weight for the MATCH side. Comparing observed matches to
 *         Σ p_0 (Regan's MM_e) credits a hard top-move find far above an obvious
 *         one, without over-crediting positions with many equally-good moves.
 *
 * NOTE: s/c here are PROVISIONAL placeholders. Regan fits them against an
 * Elo-stratified corpus; we will fit them per rating band from our own 755-player
 * cohort during calibration. Until then this yields a *relative* difficulty
 * ordering (which is all the weighting needs), not a calibrated IPR.
 */

export interface DifficultyParams {
  /** sensitivity, smaller magnifies small value differences (stronger discrimination) */
  s: number;
  /** consistency, larger sharply suppresses clearly-worse moves */
  c: number;
}

export const DEFAULT_DIFFICULTY_PARAMS: DifficultyParams = { s: 0.1, c: 0.5 };

/** log-scaled value distance in "pawn" units; handles sign crossings and tames mates */
const scaledValue = (cp: number): number => {
  const pawns = clamp(cp, -2000, 2000) / 100;
  return Math.sign(pawns) * Math.log1p(Math.abs(pawns));
};

/** non-negative log-scaled drop of a move's value from the best move (both mover POV) */
export function scaledValueDrop(bestCp: number, moveCp: number): number {
  return Math.max(0, scaledValue(bestCp) - scaledValue(moveCp));
}

/**
 * Solve for p0 (the top move's probability) in Regan's reproducible transform
 * Σ_i p0^(1/y_i) = 1, where y_i = e^(−(δ_i/s)^c) is the i-th move's proxy.
 * The sum is strictly increasing in p0 on (0,1], so bisection converges.
 */
function solveTopProb(invY: number[]): number {
  let lo = 0;
  let hi = 1;
  for (let iter = 0; iter < 60; iter++) {
    const mid = (lo + hi) / 2;
    let sum = 0;
    for (const k of invY) sum += Math.pow(mid, k);
    if (sum > 1) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export interface PositionDifficulty {
  /** expected points loss over the move distribution (log-scaled pawns); 0 = trivial */
  hazard: number;
  /** p0, model probability a cohort-typical player finds the engine's top move */
  expectedTopMatch: number;
  /** how many candidate moves (PVs) were available to weigh */
  moveCount: number;
}

/**
 * Difficulty of the choice the mover faced, from the pre-move MultiPV eval.
 * Returns undefined when there is nothing to score (no eval / no lines).
 * A single legal line ⇒ hazard 0, expectedTopMatch 1 (forced, no real choice).
 */
export function positionDifficulty(
  evalBefore: PositionEval | undefined,
  mover: Color,
  params: DifficultyParams = DEFAULT_DIFFICULTY_PARAMS,
): PositionDifficulty | undefined {
  if (!evalBefore || evalBefore.pvs.length === 0) return undefined;
  const bestCp = pvScoreCp(evalBefore.pvs[0]!, mover);
  const deltas = evalBefore.pvs.map((pv) => scaledValueDrop(bestCp, pvScoreCp(pv, mover)));
  const ys = deltas.map((d) => Math.exp(-Math.pow(d / params.s, params.c)));
  const invY = ys.map((y) => 1 / Math.max(y, 1e-9));
  const p0 = solveTopProb(invY);
  const probs = invY.map((k) => Math.pow(p0, k));
  const total = probs.reduce((a, b) => a + b, 0) || 1;
  const norm = probs.map((p) => p / total);
  const hazard = norm.reduce((sum, p, i) => sum + p * deltas[i]!, 0);
  return { hazard, expectedTopMatch: norm[0]!, moveCount: evalBefore.pvs.length };
}
