#!/usr/bin/env bash
# setup.sh [TASK...]  Builds a judge (pristine copy of both suites) for each task, default all,
# and warms the npm cache.
set -euo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"
TASKS=("$@")
[ ${#TASKS[@]} -gt 0 ] || TASKS=($(ls "$KIT/tasks"))

for T in "${TASKS[@]}"; do
  TD="$KIT/tasks/$T"; J="$KIT/judge/$T"
  [ -d "$TD/template" ] || { echo "no task $T" >&2; exit 2; }
  rm -rf "$J"; mkdir -p "$J"
  cp "$TD/template/acceptance/package.json" "$TD/template/acceptance/playwright.config.ts" \
     "$TD/template/acceptance/helpers.ts" "$J/"
  cp -r "$TD/template/acceptance/tests" "$J/visible"
  cp -r "$TD/holdout" "$J/holdout"
  ( cd "$J"
    npm install --no-audit --no-fund
    npx playwright install --with-deps chromium
    npx tsc --noEmit --strict --skipLibCheck --esModuleInterop --module commonjs --target es2022 \
      --types node playwright.config.ts helpers.ts visible/*.ts holdout/*.ts )
  echo "judge ready for $T at $J"
done

# Warm the cache with packages the agents will almost certainly use.
TMP="$(mktemp -d)"; cd "$TMP"; npm init -y >/dev/null
npm install --no-audit --no-fund react react-dom vite @vitejs/plugin-react typescript \
  fastify express better-sqlite3 tsx @types/node @types/react @types/react-dom >/dev/null
rm -rf "$TMP"
