// Manual smoke test of the data layer against the live APIs:
//   pnpm --filter @ccm/calibrate exec tsx src/smoke.ts [lichessUser] [chesscomUser]
import {
  fetchChesscomGames,
  fetchChesscomProfile,
  fetchLichessGames,
  fetchLichessProfile,
  type NormalizedGame,
  type NormalizedProfile,
} from '@ccm/core';

const lichessUser = process.argv[2] ?? 'thibault';
const chesscomUser = process.argv[3] ?? 'hikaru';

function describe(profile: NormalizedProfile, games: NormalizedGame[]): void {
  const withEvals = games.filter((g) => g.hasPlatformEvals).length;
  const withClocks = games.filter((g) => g.moves.some((m) => m.clockAfterMs !== undefined)).length;
  const withAccuracy = games.filter(
    (g) => g.white.accuracy !== undefined || g.black.accuracy !== undefined,
  ).length;
  console.log(
    `${profile.platform}/${profile.username}: banned=${profile.banned}` +
      ` games=${profile.totalGames} ratings=${JSON.stringify(profile.ratings)}`,
  );
  console.log(
    `  fetched ${games.length} games | evals ${withEvals} | clocks ${withClocks} | accuracy ${withAccuracy}`,
  );
  const sample = games[0];
  if (sample) {
    console.log(
      `  sample: ${sample.url} ${sample.timeClass} plies=${sample.moves.length}` +
        ` firstMove=${sample.moves[0]?.uci} lastClockMs=${sample.moves.at(-1)?.clockAfterMs}`,
    );
  }
}

const lichessProfile = await fetchLichessProfile(lichessUser);
const lichessGames = await fetchLichessGames(lichessUser, { max: 5 });
describe(lichessProfile, lichessGames);

const chesscomProfile = await fetchChesscomProfile(chesscomUser);
const chesscomGames = await fetchChesscomGames(chesscomUser, { max: 5 });
describe(chesscomProfile, chesscomGames);

console.log('smoke ok');
