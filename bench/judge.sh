#!/usr/bin/env bash
# judge.sh SUITE WORKDIR OUTJSON  (SUITE = visible | holdout)
# Runs a pristine suite against the app in WORKDIR. Exit 0 = all passed.
set -uo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"
SUITE="$1"; WORK="$2"; OUT="$3"
source "$KIT/bench/lib.sh"
free_port 3000
cd "$KIT/judge"
APP_DIR="$WORK" SUITE_DIR="./$SUITE" SEED_PATH="$KIT/template/seed/catalog.json" CI_JSON="$OUT" \
  with_timeout 900 npx playwright test >"$OUT.log" 2>&1
rc=$?
free_port 3000
exit $rc
