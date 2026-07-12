import { describe, expect, it } from 'vitest';
import { parseInfoLine, UciEngineSession, type UciTransport } from './uci';

class ScriptedTransport implements UciTransport {
  sent: string[] = [];
  goResponse: string[] = [];
  private cb: ((line: string) => void) | undefined;

  listen(cb: (line: string) => void): void {
    this.cb = cb;
  }

  emit(...lines: string[]): void {
    for (const line of lines) this.cb?.(line);
  }

  post(command: string): void {
    this.sent.push(command);
    if (command === 'uci') queueMicrotask(() => this.emit('id name Fakefish', 'uciok'));
    else if (command === 'isready') queueMicrotask(() => this.emit('readyok'));
    else if (command.startsWith('go')) queueMicrotask(() => this.emit(...this.goResponse));
  }
}

const WHITE_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BLACK_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('parseInfoLine', () => {
  it('parses depth, multipv, score and pv', () => {
    expect(
      parseInfoLine('info depth 12 seldepth 18 multipv 2 score cp -31 nodes 5 pv e7e5 g1f3'),
    ).toEqual({ depth: 12, multiPv: 2, cp: -31, mate: undefined, moves: ['e7e5', 'g1f3'] });
  });

  it('ignores bound lines and lines without pv', () => {
    expect(parseInfoLine('info depth 12 score cp 40 lowerbound nodes 5 pv e2e4')).toBeUndefined();
    expect(parseInfoLine('info depth 12 currmove e2e4 currmovenumber 1')).toBeUndefined();
    expect(parseInfoLine('info string NNUE evaluation using nn.nnue')).toBeUndefined();
  });
});

describe('UciEngineSession', () => {
  it('initializes, configures multipv and keeps deepest info per pv rank', async () => {
    const transport = new ScriptedTransport();
    transport.goResponse = [
      'info depth 8 multipv 1 score cp 30 pv e2e4 e7e5',
      'info depth 8 multipv 2 score cp 11 pv d2d4 d7d5',
      'info depth 12 multipv 1 score cp 25 pv e2e4 c7c5',
      'info depth 12 multipv 2 score cp 9 pv d2d4 g8f6',
      'info depth 12 multipv 1 score cp 99 lowerbound pv e2e4',
      'bestmove e2e4',
    ];
    const session = new UciEngineSession(transport);
    const result = await session.evaluate(WHITE_FEN, { depth: 12, multiPv: 2 });

    expect(transport.sent).toContain('uci');
    expect(transport.sent).toContain('setoption name MultiPV value 2');
    expect(transport.sent).toContain(`position fen ${WHITE_FEN}`);
    expect(transport.sent).toContain('go depth 12');
    expect(result).toMatchObject({ depth: 12, source: 'local', requestedMultiPv: 2 });
    expect(result.pvs).toEqual([
      { moves: ['e2e4', 'c7c5'], cp: 25, mate: undefined },
      { moves: ['d2d4', 'g8f6'], cp: 9, mate: undefined },
    ]);
  });

  it('converts side-to-move scores to white pov for black to move', async () => {
    const transport = new ScriptedTransport();
    transport.goResponse = [
      'info depth 10 multipv 1 score cp 50 pv e7e5',
      'info depth 10 multipv 2 score mate 2 pv d7d5',
      'bestmove e7e5',
    ];
    const session = new UciEngineSession(transport);
    const result = await session.evaluate(BLACK_FEN, { depth: 10, multiPv: 2 });
    // black is the mover: +50 for the mover = -50 white POV, mate 2 = mate -2
    expect(result.pvs[0]).toMatchObject({ cp: -50 });
    expect(result.pvs[1]).toMatchObject({ mate: -2 });
  });

  it('serializes concurrent evaluations', async () => {
    const transport = new ScriptedTransport();
    transport.goResponse = ['info depth 10 multipv 1 score cp 0 pv e2e4', 'bestmove e2e4'];
    const session = new UciEngineSession(transport);
    const [a, b] = await Promise.all([
      session.evaluate(WHITE_FEN, { depth: 10, multiPv: 1 }),
      session.evaluate(WHITE_FEN, { depth: 10, multiPv: 1 }),
    ]);
    expect(a.pvs).toHaveLength(1);
    expect(b.pvs).toHaveLength(1);
    // both go commands must have completed (2 gos, 2 bestmoves consumed in order)
    expect(transport.sent.filter((c) => c.startsWith('go'))).toHaveLength(2);
  });
});
