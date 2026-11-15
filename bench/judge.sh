#!/usr/bin/env bash
# judge.sh SUITE WORKDIR OUTJSON  (SUITE = visible | holdout; TASK env, default petstore)
# Runs a pristine suite against the app in WORKDIR. Exit 0 = all passed.
set -uo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"
SUITE="$1"; WORK="$2"; OUT="$3"
TASK="${TASK:-petstore}"
source "$KIT/bench/lib.sh"
HIDDEN="$KIT/judge/$TASK/hidden"
if [ "$SUITE" = "holdout" ] && [ -d "$HIDDEN" ]; then
  mkdir -p "$WORK/seed/variants"
  cp -R "$HIDDEN/." "$WORK/seed/variants/"
fi
free_port 3000
cd "$KIT/judge/$TASK"
APP_DIR="$WORK" SUITE_DIR="./$SUITE" SEED_PATH="$KIT/tasks/$TASK/template/seed/catalog.json" HIDDEN_SEED_DIR="$HIDDEN" CI_JSON="$OUT" \
  with_timeout 900 npx playwright test >"$OUT.log" 2>&1
rc=$?
free_port 3000
exit $rc
