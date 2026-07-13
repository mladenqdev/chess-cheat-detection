#!/bin/sh
# Full calibration, idempotent and crash-resilient:
# - sampling is skipped when the players file already exists (delete
#   data/players-*-full.json to force a fresh sample)
# - calibrate steps auto-retry: the WASM engine can crash on very long runs,
#   and calibrate.ts resumes from data/metrics-v2.jsonl
# Env: PER_BAND (default 30), GAMES (default 10).
set -u

PER_BAND="${PER_BAND:-30}"
GAMES="${GAMES:-10}"

[ -f data/players-blitz-full.json ] || \
  tsx src/sample.ts --per-band "$PER_BAND" --out data/players-blitz-full.json || exit 1
[ -f data/players-rapid-full.json ] || \
  tsx src/sample.ts --time-class rapid --per-band "$PER_BAND" --out data/players-rapid-full.json || exit 1

retry() {
  attempt=1
  while [ "$attempt" -le 10 ]; do
    "$@" && return 0
    echo "attempt $attempt crashed — resuming in 5s (progress is saved)"
    attempt=$((attempt + 1))
    sleep 5
  done
  echo "giving up after 10 attempts" >&2
  return 1
}

retry tsx src/calibrate.ts --games "$GAMES" --in data/players-blitz-full.json --out data/metrics-v2.jsonl || exit 1
retry tsx src/calibrate.ts --games "$GAMES" --in data/players-rapid-full.json --out data/metrics-v2.jsonl || exit 1
tsx src/build-baselines.ts --pilot false --in data/metrics-v2.jsonl
