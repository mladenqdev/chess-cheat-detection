import { pvScoreCp, type Color, type PositionEval } from '../engine/types';
import { clamp } from './stats';

/** PGN-Spy convention: a conceded forced mate counts as (at most) 1000cp lost. */
export const CPL_CAP = 1000;

/**
 * Centipawn loss of a played move from the mover's POV.
 *
 * Ground truth for the played move's value, in preference order:
 * 1. the played move IS the engine's top move → 0 by definition
 * 2. the eval of the resulting position (deeper search of the actual continuation)
 * 3. the matched multiPV line's score, when the next position was never evaluated
 * Otherwise undefined — the move can't be scored honestly.
 */
export function moveCentipawnLoss(
  playedUci: string,
  mover: Color,
  evalBefore: PositionEval | undefined,
  evalAfterMove: PositionEval | undefined,
): number | undefined {
  if (!evalBefore || evalBefore.pvs.length === 0) return undefined;
  const best = evalBefore.pvs[0]!;
  if (best.moves[0] === playedUci) return 0;
  const bestScore = pvScoreCp(best, mover);

  let playedScore: number | undefined;
  if (evalAfterMove && evalAfterMove.pvs.length > 0) {
    playedScore = pvScoreCp(evalAfterMove.pvs[0]!, mover);
  } else {
    const matched = evalBefore.pvs.find((pv) => pv.moves[0] === playedUci);
    if (matched) playedScore = pvScoreCp(matched, mover);
  }
  if (playedScore === undefined) return undefined;
  return clamp(bestScore - playedScore, 0, CPL_CAP);
}
