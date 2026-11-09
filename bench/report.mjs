// node report.mjs counts|failures REPORT.json
// counts   -> prints "passed failed"
// failures -> prints failing test titles and first error lines (truncated), for agent feedback
import fs from 'fs';

const [mode, file] = process.argv.slice(2);
let report;
try {
  report = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {
  if (mode === 'counts') console.log('0 0');
  else console.log('The test run did not produce a report. The app probably failed to start on port 3000 (check `npm start` and GET /api/health).');
  process.exit(0);
}

const results = [];
const walk = (suite, trail) => {
  const t = suite.title ? [...trail, suite.title] : trail;
  for (const s of suite.specs ?? []) {
    for (const test of s.tests ?? []) {
      const last = test.results?.[test.results.length - 1];
      results.push({
        title: [...t, s.title].join(' > '),
        ok: test.status === 'expected',
        error: last?.error?.message ?? last?.errors?.[0]?.message ?? '',
      });
    }
  }
  for (const c of suite.suites ?? []) walk(c, t);
};
for (const s of report.suites ?? []) walk(s, []);

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;

if (mode === 'counts') {
  console.log(`${passed} ${failed}`);
} else {
  const strip = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');
  const lines = [`${passed} passed, ${failed} failed.`];
  if (results.length === 0) {
    const errs = (report.errors ?? []).map((e) => strip(e.message ?? '')).join('\n');
    lines.push('No tests ran. ' + (errs || 'The app probably failed to start on port 3000.'));
  }
  for (const r of results.filter((r) => !r.ok)) {
    lines.push(`\nFAILED: ${r.title}\n${strip(r.error).split('\n').slice(0, 8).join('\n')}`);
  }
  console.log(lines.join('\n').slice(0, 6000));
}
