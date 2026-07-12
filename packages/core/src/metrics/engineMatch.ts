import type { PositionEval } from '../engine/types';

/**
 * 1-based rank of the played move among the engine's PV first-moves
 * (1 = top move → T1; ≤2 → T2; ≤3 → T3), or undefined when unranked.
 */
export function engineMatchRank(
  playedUci: string,
  evalBefore: PositionEval | undefined,
): number | undefined {
  if (!evalBefore) return undefined;
  const index = evalBefore.pvs.findIndex((pv) => pv.moves[0] === playedUci);
  return index === -1 ? undefined : index + 1;
}
