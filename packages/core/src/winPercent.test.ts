import { describe, expect, it } from 'vitest';
import { winPercentFromCentipawns } from './winPercent';

describe('winPercentFromCentipawns', () => {
  it('maps an equal position to 50%', () => {
    expect(winPercentFromCentipawns(0)).toBe(50);
  });

  it('is symmetric around 50%', () => {
    expect(winPercentFromCentipawns(120) + winPercentFromCentipawns(-120)).toBeCloseTo(100);
  });

  it('maps a large advantage close to 100%', () => {
    expect(winPercentFromCentipawns(1000)).toBeGreaterThan(95);
    expect(winPercentFromCentipawns(1000)).toBeLessThanOrEqual(100);
  });
});
