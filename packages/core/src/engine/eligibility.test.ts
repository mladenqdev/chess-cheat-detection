import { describe, expect, it } from 'vitest';
import type { NormalizedGame, NormalizedMove } from '../types';
import { assessPositions } from './eligibility';
import type { PositionEval, PvLine } from './types';

function move(ply: number, fenBefore?: string): NormalizedMove {
  const turn = ply % 2 === 0 ? 'w' : 'b';
  return { san: 'x', uci: 'a1a2', fenBefore: fenBefore ?? `board${ply} ${turn} - - 0 1` };
}

function game(moves: NormalizedMove[], openingPly?: number): NormalizedGame {
  return {
    platform: 'lichess',
    id: 'test',
    url: 'https://example.test',
    rated: true,
    timeClass: 'blitz',
    timeControl: { initialSec: 300, incrementSec: 0 },
    endedAt: 0,
    white: { username: 'w' },
    black: { username: 'b' },
    result: '1-0',
    termination: 'resign',
    openingPly,
    hasPlatformEvals: false,
    moves,
  };
}

/** eval with white-POV cp values, pvs ordered best-for-mover first */
function ev(...cps: number[]): PositionEval {
  const pvs: PvLine[] = cps.map((cp, i) => ({ moves: [`m${i}`], cp }));
  return { fen: 'x', depth: 12, pvs, requestedMultiPv: 3, source: 'local' };
}

const OPTS = { openingPlies: 2, decidedCp: 300, forcedGapCp: 200 };

describe('assessPositions', () => {
  it('classifies opening, decided, forced, no-eval and eligible positions', () => {
    const g = game([move(0), move(1), move(2), move(3), move(4), move(5), move(6), move(7)]);
    const evals: (PositionEval | undefined)[] = [
      ev(20, 10), // ply 0: opening anyway
      ev(20, 10), // ply 1: opening anyway
      ev(10, -5), // ply 2: white mover, gap 15 → eligible
      ev(10, 250), // ply 3: black mover, mover-pov gap = -10 - (-250) = 240 → forced
      ev(-350, -360), // ply 4: |best| > 300 → decided
      ev(50), // ply 5: single pv → forced
      undefined, // ply 6: no eval
      {
        ...ev(0, 0),
        pvs: [
          { moves: ['m'], mate: 5 },
          { moves: ['n'], cp: 200 },
        ],
      }, // ply 7: mate → decided
    ];
    const a = assessPositions(g, evals, OPTS);
    expect(a[0]!.exclusions).toContain('opening');
    expect(a[1]!.exclusions).toContain('opening');
    expect(a[2]).toMatchObject({ eligible: true, exclusions: [], moverColor: 'white' });
    expect(a[3]).toMatchObject({ eligible: false, exclusions: ['forced'], moverColor: 'black' });
    expect(a[4]!.exclusions).toEqual(['decided']);
    expect(a[5]!.exclusions).toEqual(['forced']);
    expect(a[6]!.exclusions).toEqual(['no-eval']);
    expect(a[7]!.exclusions).toContain('decided');
  });

  it('excludes repeated positions ignoring move counters', () => {
    const repeatedFen = 'same w - - 0 1';
    const laterSameBoard = 'same w - - 5 9'; // same board+turn+castling+ep, different counters
    const g = game([move(0, repeatedFen), move(1), move(2, laterSameBoard), move(3)]);
    const evals = [ev(0, 0), ev(0, 0), ev(0, 0), ev(0, 0)];
    const a = assessPositions(g, evals, { ...OPTS, openingPlies: 0 });
    expect(a[0]!.eligible).toBe(true);
    expect(a[2]!.exclusions).toEqual(['repetition']);
    expect(a[3]!.eligible).toBe(true);
  });

  it('raises the opening cutoff to the known openingPly', () => {
    const g = game([move(0), move(1), move(2), move(3), move(4)], 4);
    const evals = [ev(0, 0), ev(0, 0), ev(0, 0), ev(0, 0), ev(0, 0)];
    const a = assessPositions(g, evals, OPTS);
    expect(a[2]!.exclusions).toContain('opening');
    expect(a[3]!.exclusions).toContain('opening');
    expect(a[4]!.eligible).toBe(true);
  });
});
