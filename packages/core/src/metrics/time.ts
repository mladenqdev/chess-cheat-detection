import type { NormalizedGame } from '../types';
import { mean, median, stddev } from './stats';

/**
 * Think time per move in ms: own remaining clock before the move, minus after,
 * plus the increment (which was added on completing the move). Clamped at 0 —
 * lag compensation can make the raw delta slightly negative.
 * undefined where clocks or the time control are missing (e.g. correspondence).
 */
export function thinkTimesMs(game: NormalizedGame): (number | undefined)[] {
  const tc = game.timeControl;
  return game.moves.map((move, ply) => {
    if (!tc || move.clockAfterMs === undefined) return undefined;
    const before = ply >= 2 ? game.moves[ply - 2]!.clockAfterMs : tc.initialSec * 1000;
    if (before === undefined) return undefined;
    return Math.max(0, before - move.clockAfterMs + tc.incrementSec * 1000);
  });
}

/** Moves faster than this in a non-trivial position count as "instant". */
export const INSTANT_MOVE_MS = 1000;

export interface ThinkStats {
  n: number;
  meanMs: number;
  medianMs: number;
  stdMs: number;
  /** std/mean — low values mean suspiciously flat timing */
  coefficientOfVariation: number;
  /** share of moves under INSTANT_MOVE_MS */
  instantRate: number;
}

export function thinkStats(timesMs: number[]): ThinkStats | undefined {
  if (timesMs.length === 0) return undefined;
  const m = mean(timesMs);
  const sd = stddev(timesMs);
  return {
    n: timesMs.length,
    meanMs: m,
    medianMs: median(timesMs),
    stdMs: sd,
    coefficientOfVariation: m > 0 ? sd / m : 0,
    instantRate: timesMs.filter((t) => t < INSTANT_MOVE_MS).length / timesMs.length,
  };
}
