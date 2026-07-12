import { describe, expect, it } from 'vitest';
import { harmonicMean, mean, median, stddev, weightedMean, wilsonInterval } from './stats';

describe('basic stats', () => {
  it('mean, median, stddev', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    // population stddev of [2, 4, 4, 4, 5, 5, 7, 9] is exactly 2
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 10);
    expect(stddev([5])).toBe(0);
  });

  it('weighted and harmonic means', () => {
    expect(weightedMean([10, 20], [1, 3])).toBeCloseTo(17.5);
    expect(harmonicMean([40, 60])).toBeCloseTo(48);
    expect(harmonicMean([100, 0])).toBe(0); // one zero dominates a harmonic mean
  });
});

describe('wilsonInterval', () => {
  it('matches known values at 95% confidence', () => {
    const [lo, hi] = wilsonInterval(50, 100);
    expect(lo).toBeCloseTo(0.4038, 3);
    expect(hi).toBeCloseTo(0.5962, 3);
  });

  it('stays inside [0,1] at the extremes', () => {
    const [lo, hi] = wilsonInterval(10, 10);
    expect(lo).toBeCloseTo(0.7225, 3);
    expect(hi).toBe(1);
    expect(wilsonInterval(0, 10)[0]).toBe(0);
  });

  it('handles n=0', () => {
    expect(wilsonInterval(0, 0)).toEqual([0, 1]);
  });
});
