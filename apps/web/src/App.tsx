import {
  fetchChesscomGames,
  fetchChesscomProfile,
  fetchLichessGames,
  fetchLichessProfile,
  UserNotFoundError,
  type NormalizedGame,
  type NormalizedProfile,
  type Platform,
} from '@ccm/core';
import { useState, type FormEvent } from 'react';
import { idbCache } from './lib/idbCache';

/**
 * Dev harness for the data layer (phase 2). Fetches a profile plus recent games
 * and dumps a summary — replaced by the real report UI in phase 5.
 */
export default function App() {
  const [platform, setPlatform] = useState<Platform>('lichess');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [profile, setProfile] = useState<NormalizedProfile>();
  const [games, setGames] = useState<NormalizedGame[]>();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const name = username.trim();
    if (!name || loading) return;
    setLoading(true);
    setError(undefined);
    setProfile(undefined);
    setGames(undefined);
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

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto' }}>
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
