import { SerialQueue, type HttpOpts } from '../http';
import type { PositionEval } from './types';

interface CloudEvalResponse {
  fen: string;
  depth: number;
  pvs: { moves: string; cp?: number; mate?: number }[];
}

const DISABLE_ON_429_MS = 2 * 60_000;

/** What the analyser needs from a cloud-eval source (interface so tests can fake it). */
export interface CloudEvalSource {
  tryEvaluate(fen: string, multiPv: number): Promise<PositionEval | undefined>;
}

/**
 * Client for lichess cloud-eval: community-cached Stockfish evals, mostly for
 * common (opening-ish) positions. cp/mate are already white POV (verified).
 *
 * Design: never throws, never sleeps. A miss (404), rate limit (429) or network
 * error returns undefined and the caller falls back to the local engine. On 429
 * the client disables itself for a while — analysis must not hammer lichess.
 * Requests are serialized to stay polite.
 */
export class CloudEvalClient implements CloudEvalSource {
  private queue = new SerialQueue();
  private disabledUntil = 0;

  constructor(
    private opts: HttpOpts = {},
    private now: () => number = Date.now,
  ) {}

  async tryEvaluate(fen: string, multiPv: number): Promise<PositionEval | undefined> {
    if (this.now() < this.disabledUntil) return undefined;
    return this.queue.add(async () => {
      if (this.now() < this.disabledUntil) return undefined;
      const fetchFn = this.opts.fetchFn ?? fetch;
      const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`;
      let res: Response;
      try {
        res = await fetchFn(url, { headers: { Accept: 'application/json' } });
      } catch {
        return undefined;
      }
      if (res.status === 429) {
        this.disabledUntil = this.now() + DISABLE_ON_429_MS;
        return undefined;
      }
      if (!res.ok) return undefined; // 404 = position not in the cloud cache
      const json = (await res.json()) as CloudEvalResponse;
      return {
        fen,
        depth: json.depth,
        pvs: json.pvs.map((pv) => ({ moves: pv.moves.split(' '), cp: pv.cp, mate: pv.mate })),
        requestedMultiPv: multiPv,
        source: 'cloud' as const,
      };
    });
  }
}
