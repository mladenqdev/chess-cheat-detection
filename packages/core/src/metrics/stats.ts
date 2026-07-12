export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** population standard deviation (matches lichess's scalalib Maths.standardDeviation) */
export function stddev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / xs.length);
}

export function weightedMean(xs: number[], weights: number[]): number {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return 0;
  return xs.reduce((acc, x, i) => acc + x * weights[i]!, 0) / totalWeight;
}

/** harmonic mean; any non-positive value collapses it to 0 */
export function harmonicMean(xs: number[]): number {
  if (xs.length === 0) return 0;
  if (xs.some((x) => x <= 0)) return 0;
  return xs.length / xs.reduce((acc, x) => acc + 1 / x, 0);
}

/**
 * Wilson score interval for a binomial proportion (default 95%).
 * Preferred over the normal approximation for the small/skewed samples
 * engine-match rates produce.
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}
