#!/usr/bin/env bash
# schedule.sh N ARM...   e.g. schedule.sh 3 claude-opus opencode-flash opencode-opus
# Runs N rounds. Each round runs every arm once, rotating the order so no arm
# always goes first or always lands in the same time of day.
set -uo pipefail
N="$1"; shift; ARMS=("$@")
DIR="$(cd "$(dirname "$0")" && pwd)"
for ((r = 1; r <= N; r++)); do
  k=${#ARMS[@]}
  for ((i = 0; i < k; i++)); do
    arm="${ARMS[$(( (i + r - 1) % k ))]}"
    echo "=== round $r: $arm ($(TZ=America/New_York date '+%a %H:%M ET')) ==="
    "$DIR/run.sh" "$arm" "r$r"
  done
done
node "$DIR/summarize.mjs"
