// Builds a rating-conditioned baseline GRID from calibration datapoints and
// writes it into core. For each time class and each rating grid point (every
// STEP), we compute the mean/std of each metric over players within ±WINDOW of
// that rating, so a player is compared to their actual neighborhood, not a wide
// fixed band. compareToCohort() interpolates this grid at the player's exact
// rating, which removes the "top of a 400-band looks suspicious" edge effect.
//   pnpm --filter @ccm/calibrate exec tsx src/build-baselines.ts \
//     [--in data/metrics.jsonl] [--pilot true] [--min-eligible 40] \
//     [--window 200] [--step 50]
import { mean, stddev } from '@ccm/core';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PlayerDatapoint } from './shared';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const inPath = arg('in', 'data/metrics.jsonl');
const pilot = arg('pilot', 'true') !== 'false';
const minEligible = Number(arg('min-eligible', '40'));
const window = Number(arg('window', '200'));
const step = Number(arg('step', '50'));
const outPath = fileURLToPath(
  new URL('../../../packages/core/src/metrics/baselines.generated.json', import.meta.url),
);

const rows = readFileSync(inPath, 'utf8')
  .split('\n')
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line) as PlayerDatapoint)
  .filter((row) => row.eligible >= minEligible);

const metric = (values: (number | null | undefined)[]) => {
  const present = values.filter((v): v is number => typeof v === 'number');
  return { mean: mean(present), std: stddev(present) };
};
/** for metrics some datapoints lack, omit rather than emit a fake zero-std */
const maybeMetric = (values: (number | null | undefined)[]) => {
  const present = values.filter((v): v is number => typeof v === 'number');
  return present.length >= 2 ? { mean: mean(present), std: stddev(present) } : undefined;
};

const byClass = new Map<string, PlayerDatapoint[]>();
for (const row of rows) {
  byClass.set(row.timeClass, [...(byClass.get(row.timeClass) ?? []), row]);
}

function gridFor(players: PlayerDatapoint[]) {
  const ratings = players.map((p) => p.rating);
  const lo = Math.floor(Math.min(...ratings) / step) * step;
  const hi = Math.ceil(Math.max(...ratings) / step) * step;
  const points = [];
  for (let r = lo; r <= hi; r += step) {
    const win = players.filter((p) => Math.abs(p.rating - r) <= window);
    if (win.length < 2) continue; // need at least a couple to have a std
    points.push({
      rating: r,
      nPlayers: win.length,
      t1Rate: metric(win.map((p) => p.t1Rate)),
      t2Rate: metric(win.map((p) => p.t2Rate)),
      t3Rate: metric(win.map((p) => p.t3Rate)),
      acpl: metric(win.map((p) => p.acplMean)),
      accuracy: metric(win.map((p) => p.accuracyMean)),
      instantRate: metric(win.map((p) => p.instantRate)),
      thinkCv: metric(win.map((p) => p.thinkCv)),
      accuracyStd: maybeMetric(win.map((p) => p.accuracyStdDev)),
      timeComplexityCorr: maybeMetric(win.map((p) => p.timeComplexityCorr)),
    });
  }
  return points;
}

const grid: Record<string, ReturnType<typeof gridFor>> = {};
for (const [timeClass, players] of byClass) grid[timeClass] = gridFor(players);

const table = {
  meta: {
    engine: 'stockfish 18 lite wasm single-threaded',
    depth: 12,
    multiPv: 3,
    generatedAt: new Date().toISOString(),
    pilot,
    window,
    step,
  },
  grid,
};

writeFileSync(outPath, JSON.stringify(table, null, 2) + '\n');
for (const [timeClass, points] of Object.entries(grid)) {
  const mid = points[Math.floor(points.length / 2)];
  console.log(
    `${timeClass}: ${points.length} grid points ${points[0]?.rating}-${points[points.length - 1]?.rating}` +
      (mid
        ? ` | @${mid.rating} (n=${mid.nPlayers}): t1 ${(mid.t1Rate.mean * 100).toFixed(1)}±${(mid.t1Rate.std * 100).toFixed(1)}% acpl ${mid.acpl.mean.toFixed(0)}`
        : ''),
  );
}
console.log(
  `wrote ${outPath} (pilot=${pilot}, window ±${window}, step ${step}, players ${rows.length})`,
);
