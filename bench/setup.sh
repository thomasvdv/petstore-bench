#!/usr/bin/env bash
# One-time setup: builds the judge (pristine copy of both suites) and warms the npm cache.
set -euo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"
J="$KIT/judge"
rm -rf "$J"; mkdir -p "$J"
cp "$KIT/template/acceptance/package.json" "$KIT/template/acceptance/playwright.config.ts" \
   "$KIT/template/acceptance/helpers.ts" "$J/"
cp -r "$KIT/template/acceptance/tests" "$J/visible"
cp -r "$KIT/holdout" "$J/holdout"
cd "$J"
npm install --no-audit --no-fund
npx playwright install --with-deps chromium
npx tsc --noEmit --strict --skipLibCheck --esModuleInterop --module commonjs --target es2022 \
  --types node playwright.config.ts helpers.ts visible/*.ts holdout/*.ts
# Warm the cache with packages the agents will almost certainly use.
TMP="$(mktemp -d)"; cd "$TMP"; npm init -y >/dev/null
npm install --no-audit --no-fund react react-dom vite @vitejs/plugin-react typescript \
  fastify express better-sqlite3 tsx @types/node @types/react @types/react-dom >/dev/null
rm -rf "$TMP"
echo "judge ready at $J"
