# Design brief: chess cheat metrics

You are designing the complete visual identity and UI for **chess cheat metrics**
(chesscheatmetrics.com) — a free web tool that answers a question every online chess player
has had: _"was that player cheating?"_

## What the product does

The user enters a chess.com or lichess username. The site downloads that player's recent
games from the platforms' public APIs, replays every move through the Stockfish chess
engine **directly in the visitor's browser** (takes 1–3 minutes, with live progress), and
compares the player's numbers against what is statistically normal for their rating. The
output is an evidence report, never a verdict:

- a composite tier: **normal / unusual / extremely unusual** for their rating cohort
- engine-agreement rates (how often they play the computer's top moves in hard positions),
  with confidence intervals, e.g. `T1 56.3% [42–69]`
- mistake profile: average centipawn loss `25 ± 31`, accuracy `91.7%`
- move-time forensics: median think time `1.2s`, timing flatness, % of instant replies in
  critical positions
- account context: account age, rating trajectory, official platform ban flags
- per-game breakdown table (each game linked, with its own mini-metrics)
- sample-size gates: below 120 analyzed decisions the report visibly refuses to conclude
  anything ("not enough evidence yet — analyze more games")

There is also a **methodology page** explaining every metric in plain language, and heavy
disclaimer framing throughout.

## Who visits, and why design decides whether they trust it

Visitors arrive mid-argument: from a Reddit thread, a Twitter spat, a Discord server,
usually emotionally invested in proving someone guilty or innocent. Reports will be
screenshotted and pasted into those arguments — **the report view is the product's
marketing**. It must look authoritative and calm in a screenshot.

The single most important design job: **credibility**. This site publishes suspicion
evidence about real, named accounts. If it looks like a meme generator or an accusation
machine, it dies. If it looks like a lab report — measured, precise, slightly
understated — it gets cited. Think "medical test results" or "seismology dashboard," not
"gamer stats overlay."

## Design principles

1. **Scientific calm.** Neutral, precise, generous whitespace. The drama is in the data;
   the chrome stays quiet.
2. **Evidence, not verdict.** The tier indicator must read as a measurement, not a
   conviction. Never the word "cheater" in UI copy. Prefer "consistent with rating" /
   "anomalous relative to rating cohort."
3. **Simple on the surface, deep on demand.** The landing page is one input and one
   button. The report leads with the tier + three headline numbers; everything else
   (distributions, per-game tables, CI explanations) unfolds below or behind expanders.
4. **The wait is a feature.** The 1–3 minute browser analysis needs a progress experience
   that builds trust: games ticking through, positions counted, maybe a small board
   showing the position currently being analyzed. Users must feel real computation
   happening — because it is.
5. **Chess flavor with restraint.** No wood textures, no giant knight silhouettes.
   Subtle allowed: board-grid motifs in backgrounds, piece glyphs as icons, algebraic
   notation as typographic texture.
6. **Colorblind-safe verdicts.** The green/amber/red tier must also differ by shape,
   label and position — never color alone. All data viz colorblind-safe.
7. **Screenshot-ready.** The report header (username, platform, tier, headline metrics,
   site wordmark + URL) should compose beautifully at social-media crop sizes.
8. **Room to monetize later.** Design should anticipate a future paid "deep report"
   (more games, deeper engine, PDF export) — e.g. a tasteful locked-section pattern or
   an upgrade card. Not pushy; the free report must feel complete.

## Screens to design

1. **Landing** — hero with one-line promise, platform toggle (lichess/chess.com),
   username input, "analyze" CTA; below: how-it-works in 3 steps, honest limitations
   note, methodology link.
2. **Analysis in progress** — the live progress experience described above.
3. **The report** — the core screen: tier banner, headline metric cards (value + CI +
   "vs your rating cohort" context), accuracy/rating timeline, move-time scatter,
   per-game table, account context flags, disclaimer footer.
4. **Insufficient-sample variant** of the report (the "not enough evidence" state).
5. **Methodology page** — long-form readable text with inline diagrams.

## Technical constraints

- React + TypeScript SPA (Vite), fully static — design must work without server-side
  rendering tricks.
- Light **and** dark theme (dark will be the majority preference for chess audiences).
- Responsive: report must survive mobile viewing well, since links get opened from chat
  apps; but optimize the screenshot composition for desktop width.
- Charts will be custom-drawn (SVG/canvas) — specify colors, weights, axis and label
  treatment rather than assuming a chart library's defaults.
- No external fonts/CDNs at runtime preferred; self-hosted webfonts are fine.

## Deliverables

1. **Design system**: color tokens (light+dark), type scale and font choices, spacing,
   radii, elevation; the three tier styles; chart palette (categorical + the
   normal/unusual/extreme encoding), all with contrast-checked values.
2. **High-fidelity mockups** of the five screens (desktop + mobile for landing and
   report). HTML/CSS mockups preferred over static images so spacing and hover states
   are concrete.
3. **Component specs**: metric card (with CI visualization), tier banner, progress view,
   per-game table row, locked/upgrade section, disclaimer block.
4. **Copy tone guide**: 10–15 example strings (button labels, tier wording, empty states,
   the disclaimer) in the product's voice — plain, precise, non-accusatory.

## What to avoid

Detective/police/crime iconography (magnifying glasses, handcuffs, sirens); aggressive
red "CHEATER DETECTED" energy; gamer-dashboard neon; fake-precision (no decimals the
math can't support); dark patterns around the future paid tier; wood-texture chess kitsch.
