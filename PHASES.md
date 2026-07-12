# phases log

Running record of implementation phases. Each entry is written when the phase is done: what
was built, which decisions were made and why, and what future phases (or future us) should know.
The full plan lives outside the repo; the short version: data layer → engine layer → metrics
engine → report UI → calibration → deploy.

## phase 1 — scaffold (done 2026-07-12)

### what was done

- pnpm monorepo: `apps/web` (React 19 + Vite 8 + TS), `packages/core` (pure TS metrics lib,
  no DOM), `tools/calibrate` (local Node scripts, tsx runner).
- Tooling: ESLint 10 flat config + typescript-eslint, Prettier, Vitest (in core).
- `packages/core` seeded with the lichess Win% formula (`winPercentFromCentipawns`) plus real
  unit tests, so the test pipeline was proven on product code, not a placeholder.
- Pushed to git@github.com:mladenqdev/chess-cheat-metrics.git.

### decisions

- **Core is consumed as TypeScript source** (`exports: "./src/index.ts"`): Vite compiles it as
  part of the web build; `tsc` in core is typecheck-only (`noEmit`). No build artifacts, no
  publishing overhead — everything is private workspace code.
- **TypeScript pinned to ^5.9 at the root**: typescript-eslint 8.x crashes against TypeScript 7
  (the native compiler) — it requires the 5.x/6.x JS API. Revisit when typescript-eslint
  supports TS7.
- **`.claude/` is gitignored**: the repo is public; local assistant/tooling config stays out.
- **`allowBuilds: esbuild: true`** in pnpm-workspace.yaml: pnpm 11 blocks postinstall scripts
  by default; esbuild (vite dependency) needs its binary install approved.

### notes for future

- Unpin TypeScript when typescript-eslint supports TS7.
- If we switch to multithreaded Stockfish WASM later, the site must be served with
  COOP/COEP headers (Cloudflare Pages `_headers` file) — single-threaded lite build needs nothing.
- Commit style: lowercase, clear, no co-author trailers.
