import { mean, type RateWithCi } from '@ccm/core';
import type { AnalyzedGame, ReportData } from './useReport';

function TierBanner({ data }: { data: ReportData }) {
  const { tier, profile, aggregate } = data;
  if (tier === 'flagged-by-platform') {
    return (
      <section className="tier tier-flagged" role="status">
        <h2>Already banned by {profile.platform === 'chesscom' ? 'chess.com' : 'lichess'}</h2>
        <p>
          {profile.platform === 'chesscom'
            ? `chess.com closed this account${profile.banReason === 'fair_play' ? ' for cheating (their words: fair-play violations)' : ''}.`
            : 'lichess marked this account for breaking its rules.'}{' '}
          That's the platform's own public flag — everything below is our independent measurement.
        </p>
      </section>
    );
  }
  if (tier === 'insufficient-sample') {
    return (
      <section className="tier tier-insufficient" role="status">
        <h2>Not enough games to say anything</h2>
        <p>
          We could only score {aggregate.eligible} real decisions — we need at least 120 before the
          numbers mean anything. Lucky streaks look spectacular in small samples. Try analyzing more
          games.
        </p>
      </section>
    );
  }

  const comparison = data.comparison;
  if (comparison && (tier === 'normal' || tier === 'unusual' || tier === 'extreme')) {
    const { band, composite, provisional } = comparison;
    const group = `real ${band.timeClass} players rated ${band.minRating}–${band.maxRating} that we measured with the same engine`;
    const score = composite.toFixed(1);
    // a very new, barely-played account already at a high rating: its rating IS
    // its own (possibly assisted) play, so "normal for the rating" proves little
    const freshHighProfile =
      profile.createdAt !== undefined &&
      data.finishedAt - profile.createdAt < FRESH_ACCOUNT_DAYS * 86_400_000 &&
      (profile.totalGames ?? Number.MAX_SAFE_INTEGER) < FEW_GAMES &&
      Math.max(0, ...Object.values(profile.ratings)) >= HIGH_RATING;
    const content = {
      normal: {
        className: 'tier-neutral',
        title: `Looks like a normal ${band.minRating}–${band.maxRating} ${band.timeClass} player`,
        body:
          `We compared this account to ${group}. Its engine agreement, mistake rate and move timing all sit inside the ordinary range — unusualness score ${score}, where 0 is dead average and anything under 2 is unremarkable.` +
          (freshHighProfile
            ? ' Important: this account is brand new and already plays at a high level — for such accounts, move quality cannot distinguish a strong player on a fresh account from assistance playing in proportion to its rating. This result is NOT an all-clear; weigh the context below heavily.'
            : ''),
      },
      unusual: {
        className: 'tier-insufficient',
        title: `Plays better than most ${band.minRating}–${band.maxRating} ${band.timeClass} players`,
        body: `Compared to ${group}, some of this account's numbers sit above the ordinary range — unusualness score ${score} (under 2 is normal, 2+ is uncommon, 3.5+ almost never happens naturally). Worth attention, not an accusation: good form, opening prep, or a strong player on a new account can look like this. More games sharpen the picture.`,
      },
      extreme: {
        className: 'tier-flagged',
        title: `Very far from normal ${band.minRating}–${band.maxRating} ${band.timeClass} play`,
        body: `Compared to ${group}, several of this account's numbers are far outside what honest players produce — unusualness score ${score}, and honest play almost never scores above 3.5. This is strong statistical evidence, not proof; if it matches your suspicion, report the account through the platform's own channels.`,
      },
    }[tier];
    return (
      <section className={`tier ${content.className}`} role="status">
        <h2>{content.title}</h2>
        <p>{content.body}</p>
        {provisional && (
          <p className="small muted">
            Heads up: our comparison group for this rating is still small ({band.nPlayers} players),
            so treat the score as an early read — it firms up as we measure more players.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="tier tier-neutral" role="status">
      <h2>We measured the play, but can't grade it yet</h2>
      <p>
        {aggregate.eligible} decisions across {aggregate.games} games are scored below. We haven't
        measured enough real players at this rating and time control to know what's normal there —
        so rather than guess, we show the raw numbers with their uncertainty ranges.
      </p>
    </section>
  );
}

function CiBar({ rate }: { rate: RateWithCi }) {
  const [lo, hi] = rate.ci;
  return (
    <svg viewBox="0 0 100 8" className="ci-bar" aria-hidden="true">
      <rect x="0" y="3" width="100" height="2" className="ci-track" />
      <rect x={lo * 100} y="1.5" width={(hi - lo) * 100} height="5" className="ci-band" rx="1" />
      <rect x={rate.rate * 100 - 0.75} y="0" width="1.5" height="8" className="ci-marker" />
    </svg>
  );
}

function RateCard({
  label,
  rate,
  hint,
  cohort,
}: {
  label: string;
  rate: RateWithCi;
  hint: string;
  cohort?: string;
}) {
  return (
    <div className="card metric">
      <h3>{label}</h3>
      <p className="value">
        {(rate.rate * 100).toFixed(1)}%
        <span className="ci muted">
          {' '}
          [{(rate.ci[0] * 100).toFixed(0)}–{(rate.ci[1] * 100).toFixed(0)}]
        </span>
      </p>
      <CiBar rate={rate} />
      <p className="muted small">{hint}</p>
      {cohort && <p className="muted small cohort-line">typical here: {cohort}</p>}
    </div>
  );
}

function ValueCard({
  label,
  value,
  hint,
  cohort,
}: {
  label: string;
  value: string;
  hint: string;
  cohort?: string;
}) {
  return (
    <div className="card metric">
      <h3>{label}</h3>
      <p className="value">{value}</p>
      <p className="muted small">{hint}</p>
      {cohort && <p className="muted small cohort-line">typical here: {cohort}</p>}
    </div>
  );
}

function AccountContext({ data }: { data: ReportData }) {
  const { profile } = data;
  const ratings = Object.entries(profile.ratings)
    .map(([timeClass, rating]) => `${timeClass} ${rating}`)
    .join(' · ');
  return (
    <p className="muted account-line">
      {profile.title && <strong>{profile.title} </strong>}
      joined{' '}
      {profile.createdAt
        ? new Date(profile.createdAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
          })
        : 'unknown'}
      {profile.totalGames !== undefined && <> · {profile.totalGames.toLocaleString()} games</>}
      {ratings && <> · {ratings}</>}
    </p>
  );
}

const FRESH_ACCOUNT_DAYS = 90;
const FEW_GAMES = 300;
const HIGH_RATING = 2200;

/**
 * Non-statistical context flags: facts that amplify the metrics but never
 * convict alone (plan metric #8 — legit smurfs exist). A weeks-old account
 * already playing at a high rating is the classic pattern worth surfacing.
 */
function ContextFlags({ data }: { data: ReportData }) {
  const { profile, finishedAt } = data;
  const flags: string[] = [];
  if (profile.createdAt !== undefined) {
    const ageDays = Math.max(0, Math.round((finishedAt - profile.createdAt) / 86_400_000));
    if (ageDays < FRESH_ACCOUNT_DAYS) flags.push(`account is ${ageDays} days old`);
  }
  if (profile.totalGames !== undefined && profile.totalGames < FEW_GAMES) {
    flags.push(`only ${profile.totalGames} games ever played`);
  }
  if (profile.disabled) {
    flags.push('the account has since been closed by its owner');
  }
  const peak = Math.max(0, ...Object.values(profile.ratings));
  if (flags.length > 0 && peak >= HIGH_RATING) {
    flags.push(`already rated ${peak}`);
  }
  if (flags.length === 0) return null;
  return (
    <p className="context-flags">
      <span className="flag-label">context:</span> {flags.join(' · ')} — worth weighing alongside
      the metrics; new accounts can be honest smurfs or returning players.
    </p>
  );
}

function GamesTable({ games }: { games: AnalyzedGame[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th align="left">game</th>
            <th align="left">opponent</th>
            <th>result</th>
            <th>decisions</th>
            <th>top-move %</th>
            <th>acpl</th>
            <th>accuracy</th>
            <th>depth</th>
          </tr>
        </thead>
        <tbody>
          {games.map(({ game, metrics, avgDepth }) => {
            const opponent = metrics?.color === 'white' ? game.black : game.white;
            const won =
              (metrics?.color === 'white' && game.result === '1-0') ||
              (metrics?.color === 'black' && game.result === '0-1');
            return (
              <tr key={game.id}>
                <td>
                  <a href={game.url} target="_blank" rel="noreferrer">
                    {new Date(game.endedAt).toLocaleDateString()} {game.timeClass}
                  </a>
                </td>
                <td>
                  {opponent.username} ({opponent.rating ?? '?'})
                </td>
                <td align="center">
                  {game.result === '1/2-1/2' ? '½' : won ? 'W' : game.result === '*' ? '—' : 'L'}
                </td>
                <td align="center">{metrics?.eligible ?? '—'}</td>
                <td align="center">
                  {metrics && metrics.eligible > 0
                    ? `${((metrics.t1 / metrics.eligible) * 100).toFixed(0)}%`
                    : '—'}
                </td>
                <td align="center">
                  {metrics && metrics.cpls.length > 0 ? mean(metrics.cpls).toFixed(0) : '—'}
                </td>
                <td align="center">
                  {metrics?.accuracy !== undefined ? metrics.accuracy.toFixed(1) : '—'}
                  {metrics?.platformAccuracy !== undefined && (
                    <span className="muted small"> ({metrics.platformAccuracy})</span>
                  )}
                </td>
                <td align="center" className="muted">
                  {avgDepth ? avgDepth.toFixed(0) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ReportView({ data }: { data: ReportData }) {
  const { profile, aggregate } = data;
  const band = data.comparison?.band;
  return (
    <article className="report">
      <header className="report-header">
        <h2>
          {profile.username}
          <span className="muted">
            {' '}
            · {profile.platform === 'lichess' ? 'lichess' : 'chess.com'}
          </span>
        </h2>
        <AccountContext data={data} />
      </header>

      <TierBanner data={data} />
      <ContextFlags data={data} />

      <section className="metric-grid">
        <RateCard
          label="Top engine move"
          rate={aggregate.t1}
          hint="How often the played move was Stockfish's #1 choice, in positions with a real decision to make."
          cohort={
            band && `${(band.t1Rate.mean * 100).toFixed(1)}±${(band.t1Rate.std * 100).toFixed(1)}%`
          }
        />
        <RateCard
          label="Top-2 moves"
          rate={aggregate.t2}
          hint="Played one of the engine's two best moves."
          cohort={
            band && `${(band.t2Rate.mean * 100).toFixed(1)}±${(band.t2Rate.std * 100).toFixed(1)}%`
          }
        />
        <RateCard
          label="Top-3 moves"
          rate={aggregate.t3}
          hint="Played one of the engine's three best moves."
          cohort={
            band && `${(band.t3Rate.mean * 100).toFixed(1)}±${(band.t3Rate.std * 100).toFixed(1)}%`
          }
        />
        {aggregate.acpl && (
          <ValueCard
            label="Centipawn loss"
            value={`${aggregate.acpl.mean.toFixed(0)} ± ${aggregate.acpl.std.toFixed(0)}`}
            hint={`Average quality drop per decision (n=${aggregate.acpl.n}). Lower = stronger play.`}
            cohort={band && `${band.acpl.mean.toFixed(0)}±${band.acpl.std.toFixed(0)}`}
          />
        )}
        {aggregate.accuracyMean && (
          <ValueCard
            label="Accuracy"
            value={aggregate.accuracyMean.mean.toFixed(1)}
            hint="Game accuracy (lichess formula), averaged over analyzed games."
            cohort={band && `${band.accuracy.mean.toFixed(1)}±${band.accuracy.std.toFixed(1)}`}
          />
        )}
        {aggregate.timing && (
          <ValueCard
            label="Move timing"
            value={`${(aggregate.timing.medianMs / 1000).toFixed(1)}s median`}
            hint={`Timing spread ${aggregate.timing.coefficientOfVariation.toFixed(2)} (low = suspiciously flat) · ${(
              aggregate.timing.instantRate * 100
            ).toFixed(0)}% instant replies in real decisions.`}
          />
        )}
        {aggregate.accuracyStd && (
          <ValueCard
            label="Consistency across games"
            value={`± ${aggregate.accuracyStd.value.toFixed(1)}`}
            hint="How much game accuracy swings between games. Humans swing — form, tilt, time trouble; assistance is steady. An unusually LOW number is the red flag."
            cohort={
              band?.accuracyStd &&
              `± ${band.accuracyStd.mean.toFixed(1)}±${band.accuracyStd.std.toFixed(1)}`
            }
          />
        )}
        {aggregate.timeComplexityCorr && (
          <ValueCard
            label="Time follows difficulty"
            value={aggregate.timeComplexityCorr.value.toFixed(2)}
            hint="Whether thinking time tracks how hard each decision was. Humans think longer on hard moves (clearly negative number); assistance plays at its own pace regardless (near zero)."
            cohort={
              band?.timeComplexityCorr &&
              `${band.timeComplexityCorr.mean.toFixed(2)}±${band.timeComplexityCorr.std.toFixed(2)}`
            }
          />
        )}
      </section>

      <section>
        <h3 className="section-title">Analyzed games</h3>
        <GamesTable games={data.games} />
      </section>

      <footer className="disclaimer">
        <p>
          This report is statistical evidence, not an accusation. High engine agreement has innocent
          explanations (forcing styles, prepared lines, strong play); low numbers don't prove
          innocence either. Only the platforms, with data no outsider has, can make fair-play
          decisions. <a href="#/methodology">Methodology</a>.
        </p>
      </footer>
    </article>
  );
}
