import {
  aggregatePlayerMetrics,
  assessPositions,
  computePlayerGameMetrics,
  evaluateGamePositions,
  mean,
  spearmanCorrelation,
  stddev,
  thinkStats,
  type KvCache,
  type LocalEngine,
  type NormalizedGame,
  type PlayerAggregate,
  type PlayerGameMetrics,
} from '@ccm/core';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const USER_AGENT = 'chess-cheat-detection.com calibration (mladenqdev@gmail.com)';

/** identical to what the website runs, calibration must match production */
export const ANALYSIS = { depth: 12, multiPv: 3 } as const;

export class MemCache implements KvCache {
  private store = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }
}

/**
 * Disk-backed eval cache: the raw Stockfish output is the expensive, formula-
 * independent part, so we persist it once and recompute any metric from it in
 * minutes instead of re-running the engine (hours). One {k,v} JSON per line,
 * loaded into memory on start and appended on each new eval, crash-safe and
 * resumable. A FEN is written once (evals are immutable at fixed depth/multiPv),
 * so positions shared across games and players cache-hit for free.
 */
export class DiskCache implements KvCache {
  private store = new Map<string, unknown>();
  constructor(private readonly path: string) {
    if (existsSync(path)) {
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const { k, v } = JSON.parse(line) as { k: string; v: unknown };
          this.store.set(k, v);
        } catch {
          // tolerate a torn final line from an interrupted run
        }
      }
    } else {
      mkdirSync(dirname(path), { recursive: true });
    }
  }
  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    if (this.store.has(key)) return;
    this.store.set(key, value);
    appendFileSync(this.path, JSON.stringify({ k: key, v: value }) + '\n');
  }
  get size(): number {
    return this.store.size;
  }
}

/** one player-level datapoint of the calibration sample */
export interface PlayerDatapoint {
  username: string;
  rating: number;
  timeClass: string;
  bandMin: number;
  bandMax: number;
  games: number;
  eligible: number;
  t1Rate: number;
  t2Rate: number;
  t3Rate: number;
  /** pooled per-move mean; null when no eligible move was scoreable */
  acplMean: number | null;
  acplStd: number | null;
  accuracyMean: number | null;
  instantRate: number | null;
  thinkCv: number | null;
  /** spread of per-game accuracy within this player (v2 runs) */
  accuracyStdDev?: number | null;
  /** Spearman corr(think time, PV gap) pooled over eligible moves (v2 runs) */
  timeComplexityCorr?: number | null;
  /** Regan self-referential match signal, pooled over this player's scored moves (v3 runs) */
  matchScored?: number;
  observedT1?: number;
  expectedT1?: number;
  expectedT1Var?: number;
  /** per-player z = (observed − expected)/√var; positive = more top-matches than the model predicts */
  matchZ?: number | null;
}

/**
 * Raw (ungated) player metrics for calibration: unlike the product aggregate,
 * the sample gate must NOT withhold values here, small per-player samples are
 * fine because the population statistics live at the band level.
 */
export function rawDatapoint(
  perGame: PlayerGameMetrics[],
  base: Pick<PlayerDatapoint, 'username' | 'rating' | 'timeClass' | 'bandMin' | 'bandMax'>,
): PlayerDatapoint {
  const eligible = perGame.reduce((n, g) => n + g.eligible, 0);
  const cpls = perGame.flatMap((g) => g.cpls);
  const accuracies = perGame.flatMap((g) => (g.accuracy !== undefined ? [g.accuracy] : []));
  const times = perGame.flatMap((g) => g.thinkMsEligible);
  const timing = thinkStats(times);
  const matchScored = perGame.reduce((n, g) => n + g.matchScored, 0);
  const observedT1 = perGame.reduce((n, g) => n + g.observedT1OnScored, 0);
  const expectedT1 = perGame.reduce((s, g) => s + g.expectedT1, 0);
  const expectedT1Var = perGame.reduce((s, g) => s + g.expectedT1Var, 0);
  const pairs = perGame.flatMap((g) => g.timeDifficulty);
  const corr =
    pairs.length >= 30
      ? spearmanCorrelation(
          pairs.map((p) => p.thinkMs),
          pairs.map((p) => p.gapCp),
        )
      : undefined;
  return {
    ...base,
    games: perGame.length,
    eligible,
    t1Rate: eligible > 0 ? perGame.reduce((n, g) => n + g.t1, 0) / eligible : 0,
    t2Rate: eligible > 0 ? perGame.reduce((n, g) => n + g.t2, 0) / eligible : 0,
    t3Rate: eligible > 0 ? perGame.reduce((n, g) => n + g.t3, 0) / eligible : 0,
    acplMean: cpls.length > 0 ? mean(cpls) : null,
    acplStd: cpls.length > 0 ? stddev(cpls) : null,
    accuracyMean: accuracies.length > 0 ? mean(accuracies) : null,
    instantRate: timing?.instantRate ?? null,
    thinkCv: timing?.coefficientOfVariation ?? null,
    accuracyStdDev: accuracies.length >= 5 ? stddev(accuracies) : null,
    timeComplexityCorr: corr ?? null,
    matchScored,
    observedT1,
    expectedT1,
    expectedT1Var,
    matchZ: expectedT1Var > 0 ? (observedT1 - expectedT1) / Math.sqrt(expectedT1Var) : null,
  };
}

export interface AnalyzedPlayer {
  perGame: PlayerGameMetrics[];
  aggregate: PlayerAggregate;
}

/** run the full engine pipeline over a player's games (shared by calibrate + validate) */
export async function analyzePlayerGames(
  games: NormalizedGame[],
  username: string,
  local: LocalEngine,
  cache: KvCache,
  onGame?: (index: number, total: number) => void,
): Promise<AnalyzedPlayer> {
  const perGame: PlayerGameMetrics[] = [];
  for (let i = 0; i < games.length; i++) {
    const game = games[i]!;
    const evals = await evaluateGamePositions(game, { local, cache }, ANALYSIS);
    const metrics = computePlayerGameMetrics(game, evals, assessPositions(game, evals), username);
    if (metrics) perGame.push(metrics);
    onGame?.(i + 1, games.length);
  }
  return { perGame, aggregate: aggregatePlayerMetrics(perGame) };
}
