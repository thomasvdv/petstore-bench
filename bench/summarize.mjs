// node summarize.mjs [TASK]  -> per-arm table from results/TASK/*/result.json (default petstore).
// Calibration runs (run id starting with "calib") are left out.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const task = process.argv[2] ?? 'petstore';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'results', task);
const rows = fs.existsSync(root)
  ? fs.readdirSync(root)
      .map((d) => path.join(root, d, 'result.json'))
      .filter((f) => fs.existsSync(f))
      .map((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
      .filter((r) => !String(r.run).startsWith('calib'))
  : [];

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mins = (s) => (s == null ? '-' : (s / 60).toFixed(1));

const arms = [...new Set(rows.map((r) => r.arm))].sort();
console.log(`task: ${task}\n`);
console.log('arm              runs  green  median_min  best_min  med_rounds  holdout_pass  med_cost');
for (const arm of arms) {
  const rs = rows.filter((r) => r.arm === arm);
  const g = rs.filter((r) => r.status === 'green');
  const hold = g.map((r) => r.holdout_passed / Math.max(1, r.holdout_passed + r.holdout_failed));
  const costs = rs.map((r) => r.cost_usd).filter((c) => c != null);
  console.log(
    arm.padEnd(16),
    String(rs.length).padStart(4),
    String(g.length).padStart(6),
    mins(median(g.map((r) => r.agent_seconds))).padStart(11),
    mins(g.length ? Math.min(...g.map((r) => r.agent_seconds)) : null).padStart(9),
    String(median(g.map((r) => r.rounds)) ?? '-').padStart(11),
    (hold.length ? (100 * median(hold)).toFixed(0) + '%' : '-').padStart(13),
    (costs.length ? '$' + median(costs).toFixed(2) : '-').padStart(9),
  );
}
console.log('\nmedian_min = median agent minutes to a green visible suite, over green runs only.');
console.log('A fast arm with low holdout_pass is gaming the visible tests.');
