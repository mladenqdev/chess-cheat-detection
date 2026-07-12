import {
  aggregatePlayerMetrics,
  assessPositions,
  CloudEvalClient,
  computePlayerGameMetrics,
  evaluateGamePositions,
  fetchChesscomGames,
  fetchChesscomProfile,
  fetchLichessGames,
  fetchLichessProfile,
  mean,
  UserNotFoundError,
  type NormalizedGame,
  type NormalizedProfile,
  type Platform,
  type PlayerAggregate,
  type PlayerGameMetrics,
} from '@ccm/core';
import { useState, type FormEvent } from 'react';
import { getSharedPool } from './engine/stockfishPool';
import { idbCache } from './lib/idbCache';

const cloudEval = new CloudEvalClient();
const ANALYZE_GAMES = 3;

interface AnalysisRow {
  id: string;
  url: string;
  plies: number;
  eligible: number;
  exclusions: string;
  sources: string;
  avgDepth: string;
  /** the searched player's metrics in this game */
  player?: PlayerGameMetrics;
}

interface AnalysisState {
  running: boolean;
  label: string;
  rows: AnalysisRow[];
  aggregate?: PlayerAggregate;
}

/**
 * Dev harness for the data + engine layers (phases 2-3). Fetches a profile and
 * recent games, then runs the full eval pipeline (cache → cloud → local WASM)
 * on a few games — replaced by the real report UI in phase 5.
 */
export default function App() {
  const [platform, setPlatform] = useState<Platform>('lichess');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [profile, setProfile] = useState<NormalizedProfile>();
  const [games, setGames] = useState<NormalizedGame[]>();
  const [analysis, setAnalysis] = useState<AnalysisState>();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const name = username.trim();
    if (!name || loading) return;
    setLoading(true);
    setError(undefined);
    setProfile(undefined);
    setGames(undefined);
    setAnalysis(undefined);
    try {
      const opts = { cache: idbCache };
      const [nextProfile, nextGames] =
        platform === 'lichess'
          ? await Promise.all([
              fetchLichessProfile(name, opts),
              fetchLichessGames(name, { max: 20 }, opts),
            ])
          : await Promise.all([
              fetchChesscomProfile(name, opts),
              fetchChesscomGames(name, { max: 20 }, opts),
            ]);
      setProfile(nextProfile);
      setGames(nextGames);
    } catch (err) {
      setError(
        err instanceof UserNotFoundError
          ? `no ${platform} account named "${name}"`
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onAnalyze() {
    if (!games || !profile || analysis?.running) return;
    const targets = games.slice(0, ANALYZE_GAMES);
    const rows: AnalysisRow[] = [];
    const playerMetrics: PlayerGameMetrics[] = [];
    setAnalysis({ running: true, label: 'starting engine…', rows });
    try {
      for (let i = 0; i < targets.length; i++) {
        const game = targets[i]!;
        const evals = await evaluateGamePositions(
          game,
          { local: getSharedPool(), cloud: cloudEval, cache: idbCache },
          {
            onProgress: (done, total) =>
              setAnalysis({
                running: true,
                label: `game ${i + 1}/${targets.length} — ${done}/${total} positions`,
                rows: [...rows],
              }),
          },
        );
        const assessments = assessPositions(game, evals);
        const exclusionCounts = new Map<string, number>();
        for (const a of assessments) {
          for (const reason of a.exclusions) {
            exclusionCounts.set(reason, (exclusionCounts.get(reason) ?? 0) + 1);
          }
        }
        const sourceCounts = new Map<string, number>();
        for (const e of evals) {
          const source = e?.source ?? 'none';
          sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
        }
        const depths = evals.flatMap((e) => (e ? [e.depth] : []));
        const player = computePlayerGameMetrics(game, evals, assessments, profile.username);
        if (player) playerMetrics.push(player);
        rows.push({
          id: game.id,
          url: game.url,
          plies: game.moves.length,
          eligible: assessments.filter((a) => a.eligible).length,
          exclusions: [...exclusionCounts].map(([k, v]) => `${k}:${v}`).join(' ') || '—',
          sources: [...sourceCounts].map(([k, v]) => `${k}:${v}`).join(' '),
          avgDepth: depths.length
            ? (depths.reduce((a, b) => a + b, 0) / depths.length).toFixed(1)
            : '—',
          player,
        });
      }
      setAnalysis({
        running: false,
        label: 'done',
        rows,
        aggregate: aggregatePlayerMetrics(playerMetrics),
      });
    } catch (err) {
      setAnalysis({ running: false, label: `failed: ${String(err)}`, rows });
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 860, margin: '2rem auto' }}>
      <h1>chess cheat metrics</h1>
      <p>Statistical anomaly reports for chess.com and lichess accounts.</p>

      <form onSubmit={onSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
        <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
          <option value="lichess">lichess</option>
          <option value="chesscom">chess.com</option>
        </select>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          aria-label="username"
        />
        <button type="submit" disabled={loading}>
          {loading ? 'fetching…' : 'fetch'}
        </button>
      </form>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {profile && (
        <section>
          <h2>
            {profile.title ? `${profile.title} ` : ''}
            {profile.username}
            {profile.banned && (
              <span style={{ color: 'crimson' }}> — closed by platform ({profile.banReason})</span>
            )}
          </h2>
          <p>
            joined: {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '?'} ·
            games: {profile.totalGames ?? '?'} · ratings:{' '}
            {Object.entries(profile.ratings)
              .map(([timeClass, rating]) => `${timeClass} ${rating}`)
              .join(', ') || 'none'}
          </p>
        </section>
      )}

      {games && (
        <section>
          <h3>
            {games.length} recent games · {games.filter((g) => g.hasPlatformEvals).length} with
            platform evals ·{' '}
            {games.filter((g) => g.moves.some((m) => m.clockAfterMs !== undefined)).length} with
            move clocks
          </h3>
          <p>
            <button onClick={onAnalyze} disabled={analysis?.running}>
              {analysis?.running
                ? 'analyzing…'
                : `analyze first ${Math.min(ANALYZE_GAMES, games.length)} games (engine)`}
            </button>{' '}
            {analysis && <em>{analysis.label}</em>}
          </p>
          {analysis?.aggregate && (
            <section>
              <h4>
                aggregate for {profile?.username} — {analysis.aggregate.eligible} eligible moves in{' '}
                {analysis.aggregate.games} games
                {!analysis.aggregate.sampleOk && (
                  <span style={{ color: 'darkorange' }}>
                    {' '}
                    (below the 120-move minimum — numbers not conclusive)
                  </span>
                )}
              </h4>
              <p>
                T1 {(analysis.aggregate.t1.rate * 100).toFixed(1)}% [
                {(analysis.aggregate.t1.ci[0] * 100).toFixed(0)}–
                {(analysis.aggregate.t1.ci[1] * 100).toFixed(0)}] · T2{' '}
                {(analysis.aggregate.t2.rate * 100).toFixed(1)}% · T3{' '}
                {(analysis.aggregate.t3.rate * 100).toFixed(1)}%
                {analysis.aggregate.acpl &&
                  ` · acpl ${analysis.aggregate.acpl.mean.toFixed(0)}±${analysis.aggregate.acpl.std.toFixed(0)} (n=${analysis.aggregate.acpl.n})`}
                {analysis.aggregate.accuracyMean &&
                  ` · accuracy ${analysis.aggregate.accuracyMean.mean.toFixed(1)}`}
                {analysis.aggregate.timing &&
                  ` · think median ${(analysis.aggregate.timing.medianMs / 1000).toFixed(1)}s, cv ${analysis.aggregate.timing.coefficientOfVariation.toFixed(2)}, instant ${(analysis.aggregate.timing.instantRate * 100).toFixed(0)}%`}
              </p>
            </section>
          )}
          {analysis && analysis.rows.length > 0 && (
            <table cellPadding={4}>
              <thead>
                <tr>
                  <th align="left">game</th>
                  <th>plies</th>
                  <th>eligible</th>
                  <th align="left">exclusions</th>
                  <th align="left">eval sources</th>
                  <th>avg depth</th>
                  <th>T1/T2/T3</th>
                  <th>acpl</th>
                  <th>accuracy (ours/platform)</th>
                </tr>
              </thead>
              <tbody>
                {analysis.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <a href={row.url} target="_blank" rel="noreferrer">
                        {row.id}
                      </a>
                    </td>
                    <td align="center">{row.plies}</td>
                    <td align="center">{row.eligible}</td>
                    <td>{row.exclusions}</td>
                    <td>{row.sources}</td>
                    <td align="center">{row.avgDepth}</td>
                    <td align="center">
                      {row.player ? `${row.player.t1}/${row.player.t2}/${row.player.t3}` : '—'}
                    </td>
                    <td align="center">
                      {row.player && row.player.cpls.length > 0
                        ? mean(row.player.cpls).toFixed(0)
                        : '—'}
                    </td>
                    <td align="center">
                      {row.player?.accuracy?.toFixed(1) ?? '—'} /{' '}
                      {row.player?.platformAccuracy ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <table cellPadding={4}>
            <thead>
              <tr>
                <th align="left">ended</th>
                <th align="left">class</th>
                <th align="left">white</th>
                <th align="left">black</th>
                <th>result</th>
                <th>plies</th>
                <th>accuracy w/b</th>
              </tr>
            </thead>
            <tbody>
              {games.map((game) => (
                <tr key={game.id}>
                  <td>{new Date(game.endedAt).toLocaleDateString()}</td>
                  <td>{game.timeClass}</td>
                  <td>
                    {game.white.username} ({game.white.rating ?? '?'})
                  </td>
                  <td>
                    {game.black.username} ({game.black.rating ?? '?'})
                  </td>
                  <td align="center">{game.result}</td>
                  <td align="center">{game.moves.length}</td>
                  <td align="center">
                    {game.white.accuracy ?? '–'} / {game.black.accuracy ?? '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
