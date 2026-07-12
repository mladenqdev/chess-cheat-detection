import { winPercentFromCentipawns } from '../winPercent';
import { clamp, harmonicMean, stddev, weightedMean } from './stats';

/**
 * Port of lichess's AccuracyPercent.scala so our numbers agree with what
 * players see on lichess:
 * https://github.com/lichess-org/lila/blob/master/modules/analyse/src/main/AccuracyPercent.scala
 */

/** lichess's Cp.initial: baseline eval of the starting position */
const INITIAL_CP = 15;

/** Accuracy of one move given win% before and after, both from the mover's POV. */
export function moveAccuracyFromWinPercents(before: number, after: number): number {
  if (after >= before) return 100;
  const winDiff = before - after;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * winDiff) - 3.166924740191411;
  return clamp(raw + 1 /* uncertainty bonus (imperfect analysis) */, 0, 100);
}

export interface GameAccuracy {
  white?: number;
  black?: number;
}

/**
 * Game accuracy for both players from the per-move evals (white POV cp after
 * each move, starting with white's first move; undefined = no eval, e.g. mate
 * scores lichess drops). Mean of the volatility-weighted mean and the harmonic
 * mean of per-move accuracies, with window-stddev weights — faithful to lila.
 */
export function gameAccuracy(cpsAfterEachMove: (number | undefined)[]): GameAccuracy {
  const allWin: (number | undefined)[] = [INITIAL_CP, ...cpsAfterEachMove].map((cp) =>
    cp === undefined ? undefined : winPercentFromCentipawns(cp),
  );
  const windowSize = clamp(Math.floor(cpsAfterEachMove.length / 10), 2, 8);

  // (windowSize - 2) copies of the head window, then all sliding windows —
  // this lines the weight list up 1:1 with the move pairs below
  const windows: (number | undefined)[][] = [];
  for (let i = 0; i < Math.min(windowSize, allWin.length) - 2; i++) {
    windows.push(allWin.slice(0, windowSize));
  }
  if (allWin.length <= windowSize) windows.push([...allWin]);
  else
    for (let i = 0; i + windowSize <= allWin.length; i++)
      windows.push(allWin.slice(i, i + windowSize));

  const weights = windows.map((window) =>
    window.every((x) => x !== undefined) ? clamp(stddev(window as number[]), 0.5, 12) : undefined,
  );

  const accuracies = { white: [] as number[], black: [] as number[] };
  const accWeights = { white: [] as number[], black: [] as number[] };
  for (let i = 0; i + 1 < allWin.length; i++) {
    const prev = allWin[i];
    const next = allWin[i + 1];
    const weight = weights[i];
    if (prev === undefined || next === undefined || weight === undefined) continue;
    const color = i % 2 === 0 ? 'white' : 'black';
    // for black, swapping before/after equals mirroring both to black's POV
    const accuracy =
      color === 'white'
        ? moveAccuracyFromWinPercents(prev, next)
        : moveAccuracyFromWinPercents(next, prev);
    accuracies[color].push(accuracy);
    accWeights[color].push(weight);
  }

  const finalFor = (color: 'white' | 'black') =>
    accuracies[color].length === 0
      ? undefined
      : (weightedMean(accuracies[color], accWeights[color]) + harmonicMean(accuracies[color])) / 2;
  return { white: finalFor('white'), black: finalFor('black') };
}
