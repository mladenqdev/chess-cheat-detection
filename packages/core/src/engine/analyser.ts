import type { KvCache, NormalizedGame } from '../types';
import type { CloudEvalSource } from './cloudEval';
import type { LocalEngine, PositionEval } from './types';

export interface GameAnalysisDeps {
  local: LocalEngine;
  cloud?: CloudEvalSource;
  cache?: KvCache;
}

export interface AnalyseOptions {
  depth?: number;
  multiPv?: number;
  /** only ask cloud-eval below this ply, hit rate is ~0 outside the opening */
  cloudPlyLimit?: number;
  onProgress?: (done: number, total: number) => void;
}

export const DEFAULT_ANALYSE: Required<Omit<AnalyseOptions, 'onProgress'>> = {
  depth: 12,
  multiPv: 3,
  cloudPlyLimit: 24,
};

// v2: dropped lichess cloud-eval from the live pipeline; bump so previously
// cached deeper cloud evals are re-computed at plain depth 12 for consistency
const CACHE_PREFIX = 'eval:v2:';

function isSufficient(evaluation: PositionEval, depth: number, multiPv: number): boolean {
  return (
    evaluation.depth >= depth &&
    (evaluation.pvs.length >= multiPv || (evaluation.requestedMultiPv ?? 0) >= multiPv)
  );
}

/**
 * Produces `evals[ply]` (the eval of each move's fenBefore) for a game.
 * Resolution order per position: eval cache → lichess cloud-eval (opening plies
 * only) → local engine. Identical positions within the game (repetitions,
 * transpositions) are evaluated once.
 */
export async function evaluateGamePositions(
  game: NormalizedGame,
  deps: GameAnalysisDeps,
  options: AnalyseOptions = {},
): Promise<(PositionEval | undefined)[]> {
  const { depth, multiPv, cloudPlyLimit } = { ...DEFAULT_ANALYSE, ...options };

  // dedupe by fen; remember the first ply for the cloud-eligibility check
  const plysByFen = new Map<string, number[]>();
  game.moves.forEach((move, ply) => {
    const plys = plysByFen.get(move.fenBefore) ?? [];
    plys.push(ply);
    plysByFen.set(move.fenBefore, plys);
  });

  const out: (PositionEval | undefined)[] = new Array<PositionEval | undefined>(
    game.moves.length,
  ).fill(undefined);
  let done = 0;
  const total = plysByFen.size;

  await Promise.all(
    [...plysByFen.entries()].map(async ([fen, plys]) => {
      const evaluation = await evaluatePosition(fen, plys[0]!, deps, {
        depth,
        multiPv,
        cloudPlyLimit,
      });
      for (const ply of plys) out[ply] = evaluation;
      options.onProgress?.(++done, total);
    }),
  );
  return out;
}

async function evaluatePosition(
  fen: string,
  firstPly: number,
  deps: GameAnalysisDeps,
  opts: { depth: number; multiPv: number; cloudPlyLimit: number },
): Promise<PositionEval | undefined> {
  const key = `${CACHE_PREFIX}${fen}`;
  const hit = await deps.cache?.get<PositionEval>(key);
  if (hit && isSufficient(hit, opts.depth, opts.multiPv)) return hit;

  if (deps.cloud && firstPly < opts.cloudPlyLimit) {
    const cloudEval = await deps.cloud.tryEvaluate(fen, opts.multiPv);
    if (cloudEval && isSufficient(cloudEval, opts.depth, opts.multiPv)) {
      await deps.cache?.set(key, cloudEval);
      return cloudEval;
    }
  }

  try {
    const localEval = await deps.local.evaluate(fen, { depth: opts.depth, multiPv: opts.multiPv });
    await deps.cache?.set(key, localEval);
    return localEval;
  } catch {
    // a dead worker or timeout must not sink the whole game analysis;
    // the position surfaces as 'no-eval' in the eligibility assessment
    return undefined;
  }
}
