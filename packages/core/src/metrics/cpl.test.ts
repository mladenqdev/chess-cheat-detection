import { describe, expect, it } from 'vitest';
import type { PositionEval } from '../engine/types';
import { moveCentipawnLoss } from './cpl';

function pos(cp: number, ...more: [string, number][]): PositionEval {
  return {
    fen: 'x',
    depth: 12,
    source: 'local',
    pvs: [{ moves: ['best1', 'reply'], cp }, ...more.map(([m, c]) => ({ moves: [m], cp: c }))],
  };
}

describe('moveCentipawnLoss', () => {
  it('is 0 when the played move is the engine top move', () => {
    expect(moveCentipawnLoss('best1', 'white', pos(40), undefined)).toBe(0);
  });

  it('uses the next position eval as ground truth (white mover)', () => {
    // best was +50; after the played move the position is -30 → 80cp lost
    expect(moveCentipawnLoss('other', 'white', pos(50), pos(-30))).toBe(80);
  });

  it('converts POV for black movers', () => {
    // white-pov: best for black is -40; after black's move it is +10 → black lost 50cp
    expect(moveCentipawnLoss('other', 'black', pos(-40), pos(10))).toBe(50);
  });

  it('never goes negative when the deeper search likes the played move more', () => {
    expect(moveCentipawnLoss('other', 'white', pos(50), pos(90))).toBe(0);
  });

  it('caps a conceded forced mate at 1000', () => {
    const after: PositionEval = {
      fen: 'x',
      depth: 12,
      source: 'local',
      pvs: [{ moves: ['m'], mate: -3 }],
    };
    expect(moveCentipawnLoss('other', 'white', pos(50), after)).toBe(1000);
  });

  it('falls back to the matched pv score when the next eval is missing', () => {
    // played the second pv, whose score is +10 vs best +50 → 40 lost
    expect(moveCentipawnLoss('alt', 'white', pos(50, ['alt', 10]), undefined)).toBe(40);
  });

  it('is undefined when nothing can ground the played move', () => {
    expect(moveCentipawnLoss('other', 'white', pos(50), undefined)).toBeUndefined();
    expect(moveCentipawnLoss('other', 'white', undefined, pos(0))).toBeUndefined();
  });
});
