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
  reportTier,
  UserNotFoundError,
  type NormalizedGame,
  type NormalizedProfile,
  type Platform,
  type PlayerAggregate,
  type PlayerGameMetrics,
  type ReportTier,
} from '@ccm/core';
import { useCallback, useRef, useState } from 'react';
import { getSharedPool } from '../engine/stockfishPool';
import { idbCache } from '../lib/idbCache';

const cloudEval = new CloudEvalClient();

/** parses "#/u/lichess/thibault" style report permalinks */
export function parseReportHash(
  hash: string,
): { platform: Platform; username: string } | undefined {
  const match = /^#\/u\/(lichess|chesscom)\/([A-Za-z0-9_-]{1,40})$/.exec(hash);
  if (!match) return undefined;
  return { platform: match[1] as Platform, username: match[2]! };
}

export interface AnalyzedGame {
  game: NormalizedGame;
  metrics?: PlayerGameMetrics;
  avgDepth: number;
  cloudShare: number;
}

export interface ReportData {
  platform: Platform;
  profile: NormalizedProfile;
  tier: ReportTier;
  aggregate: PlayerAggregate;
  games: AnalyzedGame[];
  finishedAt: number;
}

export type ReportState =
  | { phase: 'idle' }
  | { phase: 'fetching'; username: string }
  | {
      phase: 'analyzing';
      profile: NormalizedProfile;
      gameIndex: number;
      gamesTotal: number;
      positionsDone: number;
      positionsTotal: number;
      currentGame: NormalizedGame;
    }
  | { phase: 'done'; data: ReportData }
  | { phase: 'error'; message: string };

export function useReport() {
  const [state, setState] = useState<ReportState>({ phase: 'idle' });
  const running = useRef(false);

  const run = useCallback(async (platform: Platform, username: string, maxGames: number) => {
    if (running.current) return;
    running.current = true;
    setState({ phase: 'fetching', username });
    try {
      const opts = { cache: idbCache };
      const [profile, games] =
        platform === 'lichess'
          ? await Promise.all([
              fetchLichessProfile(username, opts),
              fetchLichessGames(username, { max: maxGames }, opts),
            ])
          : await Promise.all([
              fetchChesscomProfile(username, opts),
              fetchChesscomGames(username, { max: maxGames }, opts),
            ]);

      const analyzed: AnalyzedGame[] = [];
      const perPlayer: PlayerGameMetrics[] = [];
      for (let i = 0; i < games.length; i++) {
        const game = games[i]!;
        const evals = await evaluateGamePositions(
          game,
          { local: getSharedPool(), cloud: cloudEval, cache: idbCache },
          {
            onProgress: (done, total) =>
              setState({
                phase: 'analyzing',
                profile,
                gameIndex: i,
                gamesTotal: games.length,
                positionsDone: done,
                positionsTotal: total,
                currentGame: game,
              }),
          },
        );
        const assessments = assessPositions(game, evals);
        const metrics = computePlayerGameMetrics(game, evals, assessments, profile.username);
        if (metrics) perPlayer.push(metrics);
        const depths = evals.flatMap((e) => (e ? [e.depth] : []));
        analyzed.push({
          game,
          metrics,
          avgDepth: depths.length ? depths.reduce((a, b) => a + b, 0) / depths.length : 0,
          cloudShare: evals.length
            ? evals.filter((e) => e?.source === 'cloud').length / evals.length
            : 0,
        });
      }

      const aggregate = aggregatePlayerMetrics(perPlayer);
      setState({
        phase: 'done',
        data: {
          platform,
          profile,
          tier: reportTier(profile, aggregate),
          aggregate,
          games: analyzed,
          finishedAt: Date.now(),
        },
      });
    } catch (err) {
      setState({
        phase: 'error',
        message:
          err instanceof UserNotFoundError
            ? `No ${platform === 'lichess' ? 'lichess' : 'chess.com'} account named "${username}".`
            : err instanceof Error
              ? err.message
              : String(err),
      });
    } finally {
      running.current = false;
    }
  }, []);

  return { state, run };
}
