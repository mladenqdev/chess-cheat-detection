export function MethodologyPage() {
  return (
    <article className="methodology">
      <h1>Methodology</h1>
      <p className="muted">
        What this site measures, how, and — just as important — what it cannot know.
      </p>

      <h2>Where the data comes from</h2>
      <p>
        Games and profiles come from the public APIs of lichess and chess.com: the moves, the clock
        time remaining after every move, ratings, account age, and the platforms' own public account
        flags (chess.com's <code>closed:fair_play_violations</code>, lichess's terms-of-service
        mark). Nothing is scraped, and nothing about your search is uploaded anywhere — the analysis
        below runs entirely in your browser.
      </p>

      <h2>Engine analysis</h2>
      <p>
        Every position is evaluated by Stockfish (WebAssembly build) running on your machine, asking
        for the three best moves. Common opening positions reuse deeper, cached community
        evaluations from the lichess cloud-eval database.
      </p>

      <h2>Which moves count</h2>
      <p>
        Raw engine-agreement numbers are meaningless: everyone plays perfect recaptures, and
        memorized openings prove preparation, not cheating. Following the approach used by PGN-Spy
        and by Kenneth Regan's fair-play work, a move only counts as a <strong>decision</strong>{' '}
        when:
      </p>
      <ul>
        <li>it is out of book (past the known opening theory of that game),</li>
        <li>the position is not already decided (within ±3 pawns of equal),</li>
        <li>
          there was a real choice (the engine's best move is not overwhelmingly better than the
          second best),
        </li>
        <li>the position is not part of a repetition shuffle.</li>
      </ul>

      <h2>The metrics</h2>
      <p>
        <strong>Engine agreement (top-1/2/3).</strong> How often the played move matches Stockfish's
        best, top-two, or top-three moves across counted decisions. Reported with 95% confidence
        intervals — a 60% match over 20 moves means almost nothing; over 300 moves it means a lot.
      </p>
      <p>
        <strong>Centipawn loss.</strong> How much each decision lost versus the engine's best move,
        in hundredths of a pawn. Average loss tracks playing strength closely (published research
        puts the correlation with rating near 0.98), which is what makes an implausibly low value
        informative. Conceding a forced mate is capped at 1000.
      </p>
      <p>
        <strong>Accuracy.</strong> A faithful port of lichess's accuracy formula (our implementation
        reproduces lichess's reported numbers exactly on games lichess has analyzed), so the values
        here mean the same thing they mean on lichess.
      </p>
      <p>
        <strong>Move timing.</strong> Derived from the per-move clocks both platforms publish:
        median think time, how flat the timing distribution is, and how often hard positions get
        instant replies. Humans think long on hard moves and move fast on obvious ones; assistance
        tends to flatten that pattern.
      </p>

      <h2>The 120-decision rule</h2>
      <p>
        Below roughly 120 counted decisions, chance produces spectacular-looking numbers routinely.
        Following Regan's practice, this report refuses to summarize statistics below that threshold
        and tells you to analyze more games instead.
      </p>

      <h2>What this site cannot know</h2>
      <ul>
        <li>
          Platform-internal signals: mouse movement, browser focus, view-of-analysis detection,
          device fingerprints. The platforms' own systems see these; we never will.
        </li>
        <li>
          Whether anomalies have innocent causes: prepared lines, a forcing style, a strong player
          on a new account, or plain good form.
        </li>
        <li>
          Cohort calibration is in progress: until measured baselines per rating band ship, the
          report shows raw values with confidence intervals and no normal/unusual verdict tier.
        </li>
      </ul>

      <h2>Our position</h2>
      <p>
        This report is evidence for a conversation, not a conviction. Use it to decide whether
        something is worth reporting through the platforms' official channels — they are the only
        parties with the data and the standing to act.
      </p>

      <p>
        <a href="#/">← back to the analyzer</a>
      </p>
    </article>
  );
}
