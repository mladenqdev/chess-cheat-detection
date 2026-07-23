import { SerialQueue } from '../http';
import {
  sideToMove,
  type EvalOptions,
  type LocalEngine,
  type PositionEval,
  type PvLine,
} from './types';

/**
 * Transport to a UCI engine process/worker. The web app wraps a Web Worker,
 * Node tools can wrap the stockfish npm package, the session logic is shared.
 */
export interface UciTransport {
  post(command: string): void;
  /** register the single line listener; implementations deliver one line per call */
  listen(callback: (line: string) => void): void;
}

interface ParsedInfo {
  depth: number;
  multiPv: number;
  cp?: number;
  mate?: number;
  moves: string[];
}

/** Parses a UCI `info ... pv ...` line; returns undefined for lines we ignore. */
export function parseInfoLine(line: string): ParsedInfo | undefined {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return undefined;
  // bound lines are transient search artifacts, not real scores
  if (line.includes(' lowerbound') || line.includes(' upperbound')) return undefined;
  const depth = /\bdepth (\d+)/.exec(line);
  const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
  const pv = /\bpv (.+)$/.exec(line);
  if (!depth || !score || !pv) return undefined;
  const multiPv = /\bmultipv (\d+)/.exec(line);
  return {
    depth: Number(depth[1]),
    multiPv: multiPv ? Number(multiPv[1]) : 1,
    cp: score[1] === 'cp' ? Number(score[2]) : undefined,
    mate: score[1] === 'mate' ? Number(score[2]) : undefined,
    moves: pv[1]!.trim().split(/\s+/),
  };
}

const EVAL_TIMEOUT_MS = 60_000;

/**
 * Drives one UCI engine over a transport. Evaluations are serialized,  * a UCI engine runs one search at a time; use several sessions for parallelism.
 * Scores are converted from the engine's side-to-move POV to white POV.
 */
export class UciEngineSession implements LocalEngine {
  private queue = new SerialQueue();
  private handler: ((line: string) => void) | undefined;
  private initPromise: Promise<void> | undefined;

  constructor(private transport: UciTransport) {
    transport.listen((raw) => {
      const line = raw.trim();
      if (line) this.handler?.(line);
    });
  }

  private ensureInit(): Promise<void> {
    this.initPromise ??= (async () => {
      this.transport.post('uci');
      await this.waitFor((line) => line === 'uciok');
      this.transport.post('isready');
      await this.waitFor((line) => line === 'readyok');
    })().catch((err: unknown) => {
      // a failed init (e.g. timeout) must not poison every later evaluate
      this.initPromise = undefined;
      throw err;
    });
    return this.initPromise;
  }

  private waitFor(
    predicate: (line: string) => boolean,
    onLine?: (line: string) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.handler = undefined;
        reject(new Error('uci engine timed out'));
      }, EVAL_TIMEOUT_MS);
      this.handler = (line) => {
        onLine?.(line);
        if (predicate(line)) {
          clearTimeout(timer);
          this.handler = undefined;
          resolve();
        }
      };
    });
  }

  async evaluate(fen: string, opts: EvalOptions): Promise<PositionEval> {
    await this.ensureInit();
    return this.queue.add(async () => {
      const byRank = new Map<number, ParsedInfo>();
      let maxDepth = 0;
      this.transport.post(`setoption name MultiPV value ${opts.multiPv}`);
      this.transport.post(`position fen ${fen}`);
      this.transport.post(`go depth ${opts.depth}`);
      await this.waitFor(
        (line) => line.startsWith('bestmove'),
        (line) => {
          const info = parseInfoLine(line);
          if (!info) return;
          byRank.set(info.multiPv, info);
          maxDepth = Math.max(maxDepth, info.depth);
        },
      );

      const negate = sideToMove(fen) === 'black';
      const pvs: PvLine[] = [...byRank.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, info]) => ({
          moves: info.moves,
          cp: info.cp !== undefined ? (negate ? -info.cp : info.cp) : undefined,
          mate: info.mate !== undefined ? (negate ? -info.mate : info.mate) : undefined,
        }));
      return {
        fen,
        depth: maxDepth,
        pvs,
        requestedMultiPv: opts.multiPv,
        source: 'local' as const,
      };
    });
  }
}
