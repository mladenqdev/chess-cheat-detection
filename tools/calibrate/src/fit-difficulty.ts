// Fits the difficulty model's sensitivity `s` so its projected top-move match
// rate matches what honest players actually do, per rating band (Regan-style).
// Phase A: for a sample of cohort players, dump every scored position's candidate
//   move values + whether they played the top move (uses the disk eval cache).
// Phase B: sweep `s` per band to make projected ≈ observed match rate.
//   pnpm --filter @ccm/calibrate exec tsx src/fit-difficulty.ts [--players 60] [--c 0.5]
import {
  assessPositions,
  engineMatchRank,
  evaluateGamePositions,
  fetchLichessGames,
  positionDifficulty,
  pvScoreCp,
  type Color,
  type PositionEval,
} from '@ccm/core';
import { appendFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { createNodeEngine } from './nodeEngine';
import { ANALYSIS, DiskCache, USER_AGENT, type PlayerDatapoint } from './shared';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? (process.argv[i + 1] ?? fallback) : fallback;
}
const nPlayers = Number(arg('players', '60'));
const c = Number(arg('c', '0.5'));
const POS = 'data/fit-positions.jsonl';

interface Pos {
  rating: number;
  tc: string;
  cps: number[];
  obs: 0 | 1;
}

// ---- Phase A: dump scored positions (skipped if already present) ----
if (!existsSync(POS) || statSync(POS).size === 0) {
  const rows = readFileSync('data/metrics-v3.jsonl', 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as PlayerDatapoint)
    .filter((r) => r.eligible >= 100)
    .sort((a, b) => a.rating - b.rating);
  const stride = Math.max(1, Math.floor(rows.length / nPlayers));
  const sample = rows.filter((_, i) => i % stride === 0).slice(0, nPlayers);
  console.log(`Phase A: dumping positions from ${sample.length} players`);

  const cache = new DiskCache('data/evals.jsonl');
  let engine = await createNodeEngine();
  let done = 0;
  for (const p of sample) {
    if (done > 0 && done % 20 === 0) {
      engine.terminate();
      engine = await createNodeEngine();
    }
    try {
      const games = await fetchLichessGames(
        p.username,
        { max: 10, timeClasses: [p.timeClass as 'blitz' | 'rapid'], rated: true },
        { userAgent: USER_AGENT },
      );
      const uname = p.username.toLowerCase();
      for (const game of games) {
        const color: Color | undefined =
          game.white.username.toLowerCase() === uname
            ? 'white'
            : game.black.username.toLowerCase() === uname
              ? 'black'
              : undefined;
        if (!color) continue;
        const evals = await evaluateGamePositions(game, { local: engine.session, cache }, ANALYSIS);
        for (const a of assessPositions(game, evals)) {
          if (a.moverColor !== color || !a.eligible) continue;
          const ev = evals[a.ply];
          if (!ev || ev.pvs.length === 0) continue;
          const cps = ev.pvs.map((pv) => pvScoreCp(pv, color));
          const rank = engineMatchRank(a.playedUci, ev);
          appendFileSync(
            POS,
            JSON.stringify({ rating: p.rating, tc: p.timeClass, cps, obs: rank === 1 ? 1 : 0 }) +
              '\n',
          );
        }
      }
    } catch (err) {
      console.error(`${p.username}: ${err instanceof Error ? err.message : err}`);
    }
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${sample.length} players`);
  }
  engine.terminate();
}

// ---- Phase B: sweep s per band ----
const positions = readFileSync(POS, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as Pos);
console.log(`\nPhase B: fitting s (c=${c}) over ${positions.length} scored positions`);

const evalOf = (cps: number[]): PositionEval => ({
  fen: 'x',
  depth: 12,
  source: 'local',
  pvs: cps.map((cp) => ({ moves: ['x'], cp })),
});
// projected top-move probability for a position under (s,c)
const p0 = (cps: number[], s: number) =>
  positionDifficulty(evalOf(cps), 'white', { s, c })?.expectedTopMatch ?? 0;

const BANDS: [number, number][] = [
  [400, 1200],
  [1200, 1600],
  [1600, 2000],
  [2000, 2400],
  [2400, 3000],
];
const S_GRID = Array.from({ length: 80 }, (_, i) => 0.05 + i * 0.05); // 0.05..4.00

console.log('band            n     observed   best s   projected');
for (const [lo, hi] of BANDS) {
  const band = positions.filter((p) => p.rating >= lo && p.rating < hi);
  if (band.length < 50) {
    console.log(`${lo}-${hi}: too few positions (${band.length})`);
    continue;
  }
  const observed = band.reduce((n, p) => n + p.obs, 0) / band.length;
  let bestS = S_GRID[0]!;
  let bestGap = Infinity;
  let bestProj = 0;
  for (const s of S_GRID) {
    const proj = band.reduce((sum, p) => sum + p0(p.cps, s), 0) / band.length;
    const gap = Math.abs(proj - observed);
    if (gap < bestGap) {
      bestGap = gap;
      bestS = s;
      bestProj = proj;
    }
  }
  console.log(
    `${`${lo}-${hi}`.padEnd(14)} ${String(band.length).padEnd(6)} ${(observed * 100).toFixed(1)}%      ${bestS.toFixed(2)}     ${(bestProj * 100).toFixed(1)}%`,
  );
}
