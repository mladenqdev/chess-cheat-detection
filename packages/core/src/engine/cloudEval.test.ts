import { describe, expect, it } from 'vitest';
import type { FetchLike } from '../http';
import { CloudEvalClient } from './cloudEval';

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('CloudEvalClient', () => {
  it('maps a hit to a white-pov PositionEval with uci arrays', async () => {
    const fetchFn: FetchLike = async () =>
      new Response(
        JSON.stringify({
          fen: FEN,
          knodes: 13000,
          depth: 36,
          pvs: [
            { moves: 'e2e4 e7e5 g1f3', cp: 19 },
            { moves: 'd2d4 d7d5', cp: 15 },
          ],
        }),
        { status: 200 },
      );
    const client = new CloudEvalClient({ fetchFn });
    expect(await client.tryEvaluate(FEN, 2)).toEqual({
      fen: FEN,
      depth: 36,
      requestedMultiPv: 2,
      source: 'cloud',
      pvs: [
        { moves: ['e2e4', 'e7e5', 'g1f3'], cp: 19, mate: undefined },
        { moves: ['d2d4', 'd7d5'], cp: 15, mate: undefined },
      ],
    });
  });

  it('returns undefined on cache miss (404) and network errors', async () => {
    const miss: FetchLike = async () => new Response('', { status: 404 });
    expect(await new CloudEvalClient({ fetchFn: miss }).tryEvaluate(FEN, 2)).toBeUndefined();
    const broken: FetchLike = async () => {
      throw new Error('offline');
    };
    expect(await new CloudEvalClient({ fetchFn: broken }).tryEvaluate(FEN, 2)).toBeUndefined();
  });

  it('disables itself for a while after a 429', async () => {
    let calls = 0;
    let nowMs = 0;
    const fetchFn: FetchLike = async () => {
      calls++;
      return new Response('', { status: 429 });
    };
    const client = new CloudEvalClient({ fetchFn }, () => nowMs);
    expect(await client.tryEvaluate(FEN, 2)).toBeUndefined();
    expect(await client.tryEvaluate(FEN, 2)).toBeUndefined(); // still disabled
    expect(calls).toBe(1);
    nowMs = 3 * 60_000; // past the disable window
    expect(await client.tryEvaluate(FEN, 2)).toBeUndefined();
    expect(calls).toBe(2);
  });
});
