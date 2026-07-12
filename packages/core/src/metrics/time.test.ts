import { describe, expect, it } from 'vitest';
import gameJson from '../platforms/__fixtures__/chesscom-game.json?raw';
import ndjson from '../platforms/__fixtures__/lichess-games.ndjson?raw';
import { normalizeChesscomGame, type ChesscomGame } from '../platforms/chesscom';
import { normalizeLichessGame, type LichessGame } from '../platforms/lichess';
import { thinkTimesMs } from './time';

const chesscomGame = normalizeChesscomGame(JSON.parse(gameJson) as ChesscomGame);
const lichessGame = normalizeLichessGame(JSON.parse(ndjson.split('\n')[0]!) as LichessGame);

describe('thinkTimesMs', () => {
  it('derives per-move think time from remaining clocks (no increment)', () => {
    const times = thinkTimesMs(chesscomGame);
    // 3+0: white starts at 180000ms; after 1.c4 the clock still shows 0:03:00
    expect(times[0]).toBe(0);
    // 2.Nf3 left 0:02:58.8 → 1200ms thought
    expect(times[2]).toBe(1200);
    // black 1...e6 left 0:03:00 → 0ms; 2...d5 left 0:02:59.9 → 100ms
    expect(times[1]).toBe(0);
    expect(times[3]).toBe(100);
  });

  it('adds the increment back (lichess 300+3)', () => {
    const times = thinkTimesMs(lichessGame);
    // white's first move: 300000 → 300030 remaining, +3000 increment → 2970ms
    expect(times[0]).toBe(2970);
    expect(times.length).toBe(lichessGame.moves.length);
  });

  it('never returns negative times and handles missing clocks', () => {
    const times = thinkTimesMs(lichessGame);
    expect(times.every((t) => t === undefined || t >= 0)).toBe(true);
    const noClocks = {
      ...chesscomGame,
      moves: chesscomGame.moves.map((m) => ({ ...m, clockAfterMs: undefined })),
    };
    expect(thinkTimesMs(noClocks).every((t) => t === undefined)).toBe(true);
    const noTc = { ...chesscomGame, timeControl: null };
    expect(thinkTimesMs(noTc).every((t) => t === undefined)).toBe(true);
  });
});
