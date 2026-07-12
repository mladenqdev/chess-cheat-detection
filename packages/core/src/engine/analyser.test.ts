import { describe, expect, it } from 'vitest';
import ndjson from '../platforms/__fixtures__/lichess-games.ndjson?raw';
import { normalizeLichessGame, type LichessGame } from '../platforms/lichess';
import type { KvCache } from '../types';
import { evaluateGamePositions } from './analyser';
import type { CloudEvalSource } from './cloudEval';
import type { EvalOptions, LocalEngine, PositionEval } from './types';

const fixtureGame = normalizeLichessGame(JSON.parse(ndjson.split('\n')[0]!) as LichessGame); // 42 plies

class FakeLocal implements LocalEngine {
  calls = new Map<string, number>();
  failOn?: string;
  async evaluate(fen: string, opts: EvalOptions): Promise<PositionEval> {
    this.calls.set(fen, (this.calls.get(fen) ?? 0) + 1);
    if (fen === this.failOn) throw new Error('worker died');
    return {
      fen,
      depth: opts.depth,
      pvs: [
        { moves: ['e2e4'], cp: 12 },
        { moves: ['d2d4'], cp: 5 },
        { moves: ['g1f3'], cp: 1 },
      ],
      requestedMultiPv: opts.multiPv,
      source: 'local',
    };
  }
}

class FakeCloud implements CloudEvalSource {
  calls = 0;
  async tryEvaluate(fen: string, multiPv: number): Promise<PositionEval | undefined> {
    this.calls++;
    return {
      fen,
      depth: 30,
      pvs: [
        { moves: ['e2e4'], cp: 20 },
        { moves: ['c2c4'], cp: 10 },
        { moves: ['g1f3'], cp: 5 },
      ],
      requestedMultiPv: multiPv,
      source: 'cloud',
    };
  }
}

class MapCache implements KvCache {
  store = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }
}

describe('evaluateGamePositions', () => {
  it('uses cloud for opening plies and the local engine beyond', async () => {
    const local = new FakeLocal();
    const cloud = new FakeCloud();
    const evals = await evaluateGamePositions(fixtureGame, { local, cloud });
    expect(evals).toHaveLength(42);
    expect(evals.every((e) => e !== undefined)).toBe(true);
    expect(evals[0]!.source).toBe('cloud');
    expect(evals[41]!.source).toBe('local');
    // default cloudPlyLimit 24: plies 0..23 from cloud, 24..41 local
    expect(cloud.calls).toBe(24);
    expect([...local.calls.values()].reduce((a, b) => a + b, 0)).toBe(18);
  });

  it('reports progress per unique position', async () => {
    const seen: [number, number][] = [];
    await evaluateGamePositions(
      fixtureGame,
      { local: new FakeLocal() },
      { onProgress: (done, total) => seen.push([done, total]) },
    );
    expect(seen).toHaveLength(42);
    expect(seen.at(-1)).toEqual([42, 42]);
  });

  it('serves repeat runs from the cache without touching engines', async () => {
    const cache = new MapCache();
    const first = new FakeLocal();
    await evaluateGamePositions(fixtureGame, { local: first, cache });
    const second = new FakeLocal();
    const cloud = new FakeCloud();
    const evals = await evaluateGamePositions(fixtureGame, { local: second, cloud, cache });
    expect(evals.every((e) => e !== undefined)).toBe(true);
    expect(second.calls.size).toBe(0);
    expect(cloud.calls).toBe(0);
  });

  it('re-evaluates cached entries that are too shallow', async () => {
    const cache = new MapCache();
    const local = new FakeLocal();
    await evaluateGamePositions(fixtureGame, { local, cache }, { depth: 6 });
    const deeper = new FakeLocal();
    await evaluateGamePositions(fixtureGame, { local: deeper, cache }, { depth: 12 });
    expect(deeper.calls.size).toBe(42);
  });

  it('leaves positions undefined when the local engine fails, without throwing', async () => {
    const local = new FakeLocal();
    local.failOn = fixtureGame.moves[30]!.fenBefore;
    const evals = await evaluateGamePositions(fixtureGame, { local });
    expect(evals[30]).toBeUndefined();
    expect(evals[31]).toBeDefined();
  });
});
