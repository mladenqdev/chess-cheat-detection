/**
 * POV convention for the whole codebase: cp/mate values are WHITE's point of view,
 * matching lichess platform evals and the cloud-eval API (verified empirically:
 * a black-to-move mate-in-1 for black reports mate: -1). PVs are ordered
 * best-for-the-side-to-move first. Local UCI engines report side-to-move POV
 * and are converted at the UCI boundary.
 */

export interface PvLine {
  /** principal variation as UCI moves, engine's line for this rank */
  moves: string[];
  /** centipawns, white POV (absent when mate is set) */
  cp?: number;
  /** moves to mate, white POV sign (absent when cp is set) */
  mate?: number;
}

export interface PositionEval {
  fen: string;
  depth: number;
  /** best-for-mover first; may be shorter than requested when few legal moves exist */
  pvs: PvLine[];
  /** how many PVs were requested when this eval was produced (for cache validity) */
  requestedMultiPv?: number;
  source: 'cloud' | 'local';
}

export interface EvalOptions {
  depth: number;
  multiPv: number;
}

/** Anything that can evaluate a position locally (browser worker pool, Node engine). */
export interface LocalEngine {
  evaluate(fen: string, opts: EvalOptions): Promise<PositionEval>;
}

export type Color = 'white' | 'black';

export function sideToMove(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

/** Mate scores are mapped near this magnitude so they compare above any cp eval. */
export const MATE_CP = 10_000;

/** Comparable centipawn score of a PV line from the given POV (mates map near ±MATE_CP). */
export function pvScoreCp(pv: PvLine, pov: Color): number {
  let whiteCp: number;
  if (pv.cp !== undefined) whiteCp = pv.cp;
  else if (pv.mate !== undefined) whiteCp = pv.mate > 0 ? MATE_CP - pv.mate : -MATE_CP - pv.mate;
  else whiteCp = 0;
  return pov === 'white' ? whiteCp : -whiteCp;
}
