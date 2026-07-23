import type { NormalizedGame } from '../types';
import { pvScoreCp, type Color, type PositionEval } from './types';

/**
 * The eligible-position filter, the methodological core shared by PGN-Spy and
 * Ken Regan's work. Engine-correlation and centipawn-loss metrics are only
 * meaningful over positions where the player had a real, undecided choice:
 *
 * - opening:    book/memorized moves prove preparation, not engine use
 * - decided:    once a side is completely winning/lost, any move quality is noise
 * - forced:     recaptures and only-moves are found by everyone
 * - repetition: repetition shuffling inflates match rates (Regan excludes these)
 */

export interface EligibilityOptions {
  /** plies excluded as opening theory (raised to the game's openingPly when known) */
  openingPlies?: number;
  /** |best eval| above this (white POV, cp) marks the position as decided */
  decidedCp?: number;
  /** PV1−PV2 gap (mover POV, cp) above this marks the move as forced */
  forcedGapCp?: number;
}

export const DEFAULT_ELIGIBILITY: Required<EligibilityOptions> = {
  openingPlies: 16,
  decidedCp: 300,
  forcedGapCp: 200,
};

export type ExclusionReason = 'opening' | 'decided' | 'forced' | 'repetition' | 'no-eval';

export interface PositionAssessment {
  /** 0-based index into game.moves */
  ply: number;
  moverColor: Color;
  fenBefore: string;
  playedUci: string;
  eligible: boolean;
  exclusions: ExclusionReason[];
}

/** Board + turn + castling + en passant; move counters must not distinguish repetitions. */
function repetitionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

/**
 * Assesses every position of a game for metric eligibility.
 * `evals[ply]` must be the (multiPV) eval of `game.moves[ply].fenBefore`.
 */
export function assessPositions(
  game: NormalizedGame,
  evals: (PositionEval | undefined)[],
  options: EligibilityOptions = {},
): PositionAssessment[] {
  const opts = { ...DEFAULT_ELIGIBILITY, ...options };
  const openingCutoff = Math.max(opts.openingPlies, game.openingPly ?? 0);
  const seen = new Set<string>();

  return game.moves.map((move, ply) => {
    const exclusions: ExclusionReason[] = [];
    const moverColor: Color = ply % 2 === 0 ? 'white' : 'black';

    if (ply < openingCutoff) exclusions.push('opening');

    const key = repetitionKey(move.fenBefore);
    if (seen.has(key)) exclusions.push('repetition');
    seen.add(key);

    const evalBefore = evals[ply];
    if (!evalBefore || evalBefore.pvs.length === 0) {
      exclusions.push('no-eval');
    } else {
      const best = evalBefore.pvs[0]!;
      if (Math.abs(pvScoreCp(best, 'white')) > opts.decidedCp) exclusions.push('decided');
      if (evalBefore.pvs.length === 1) {
        // engine returns fewer PVs than requested only when fewer moves exist
        exclusions.push('forced');
      } else {
        const gap =
          pvScoreCp(evalBefore.pvs[0]!, moverColor) - pvScoreCp(evalBefore.pvs[1]!, moverColor);
        if (gap > opts.forcedGapCp) exclusions.push('forced');
      }
    }

    return {
      ply,
      moverColor,
      fenBefore: move.fenBefore,
      playedUci: move.uci,
      eligible: exclusions.length === 0,
      exclusions,
    };
  });
}
