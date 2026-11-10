#!/usr/bin/env bash
# view.sh ARM RUN_ID  e.g. bench/view.sh claude-opus calib   (TASK env, default petstore)
# Starts the app a run built, resets it to the seed catalog, and opens it in the browser.
# Ctrl-C stops it. Only one app can run at a time (they all use port 3000).
set -uo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"
source "$KIT/bench/lib.sh"
TASK="${TASK:-petstore}"
WORK="${WORK_ROOT:-$KIT/runs}/$TASK/$1-$2"
[ -d "$WORK" ] || { echo "no run at $WORK"; ls "${WORK_ROOT:-$KIT/runs}/$TASK" 2>/dev/null; exit 1; }

free_port 3000
cd "$WORK"
[ -d node_modules ] || npm install --no-audit --no-fund
npm start &
APP=$!
trap 'kill $APP 2>/dev/null; free_port 3000' EXIT INT TERM

for _ in $(seq 1 120); do
  curl -sf http://localhost:3000/api/health >/dev/null && break
  sleep 1
done
curl -sf -X POST http://localhost:3000/api/test/reset >/dev/null || echo "reset failed; data may include test leftovers"

echo "Serving $TASK $1-$2 at http://localhost:3000  (admin / admin123). Ctrl-C to stop."
if command -v open >/dev/null 2>&1; then open http://localhost:3000
elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:3000 >/dev/null 2>&1
fi
wait $APP
