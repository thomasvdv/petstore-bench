import { defineConfig } from '@playwright/test';
import * as path from 'path';

// APP_DIR: the app repo root. SUITE_DIR: which tests to run.
// Defaults let an agent run `npx playwright test` from acceptance/.
const appDir = process.env.APP_DIR ?? path.resolve(__dirname, '..');
const suiteDir = process.env.SUITE_DIR ?? './tests';

export default defineConfig({
  testDir: suiteDir,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI_JSON ? [['json', { outputFile: process.env.CI_JSON }], ['line']] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'off',
  },
  webServer: {
    command: 'npm start',
    cwd: appDir,
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
