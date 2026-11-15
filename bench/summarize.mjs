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
      .map((f) => {
        const r = JSON.parse(fs.readFileSync(f, 'utf8'));
        // repair.sh writes repair.json next to result.json; its times and cost are cumulative.
        const rf = path.join(path.dirname(f), 'repair.json');
        return fs.existsSync(rf) ? { ...r, repair: JSON.parse(fs.readFileSync(rf, 'utf8')) } : r;
      })
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

// Fallback for result.json files written before run.sh recorded the model id.
// Keep in sync with bench/arms.sh; an explicit env override still wins.
const FALLBACK_MODELS = {
  'claude-opus': process.env.CLAUDE_OPUS_MODEL ?? 'claude-opus-5-5',
  'claude-sonnet': process.env.CLAUDE_SONNET_MODEL ?? 'claude-sonnet-5-5',
  'claude-haiku': process.env.CLAUDE_HAIKU_MODEL ?? 'claude-haiku-5-5',
  'opencode-flash': process.env.OC_FLASH_MODEL ?? 'ollama-cloud/deepseek-v4.1-flash:1017',
  'opencode-glm': process.env.OC_GLM_MODEL ?? 'ollama-cloud/glm-5.3',
};
const modelsFor = (rs) =>
  [...new Set(rs.map((r) => r.model ?? FALLBACK_MODELS[r.arm] ?? '-'))].join(', ');
const modelW = Math.max(
  'model'.length,
  ...arms.map((a) => modelsFor(rows.filter((r) => r.arm === a)).length),
);

console.log(`task: ${task}\n`);
console.log(
  'arm'.padEnd(16),
  'model'.padEnd(modelW),
  'runs'.padStart(4),
  'green'.padStart(6),
  'median_min'.padStart(11),
  'best_min'.padStart(9),
  'med_rounds'.padStart(11),
  'holdout_pass'.padStart(18),
  'med_cost'.padStart(9),
  'e2e_min'.padStart(8),
  'e2e_holdout'.padStart(12),
  'e2e_cost'.padStart(9),
);
for (const arm of arms) {
  const rs = rows.filter((r) => r.arm === arm);
  const g = rs.filter((r) => r.status === 'green');
  // Pool every holdout test case across green runs, so one failing case in one run counts once.
  const held = g.filter((r) => r.holdout_passed + r.holdout_failed > 0);
  const holdPass = held.reduce((n, r) => n + r.holdout_passed, 0);
  const holdTotal = held.reduce((n, r) => n + r.holdout_passed + r.holdout_failed, 0);
  const costs = g.map((r) => r.cost_usd).filter((c) => c != null);
  // End to end: one-shot plus any repair turns, counted only for runs whose final holdout is clean.
  const final = (r) => r.repair ?? r;
  const e2e = held.filter((r) => final(r).holdout_failed === 0 && final(r).holdout_passed > 0);
  const e2eCosts = e2e.map((r) => final(r).cost_usd).filter((c) => c != null);
  console.log(
    arm.padEnd(16),
    modelsFor(rs).padEnd(modelW),
    String(rs.length).padStart(4),
    String(g.length).padStart(6),
    mins(median(g.map((r) => r.agent_seconds))).padStart(11),
    mins(g.length ? Math.min(...g.map((r) => r.agent_seconds)) : null).padStart(9),
    String(median(g.map((r) => r.rounds)) ?? '-').padStart(11),
    (holdTotal ? `${((100 * holdPass) / holdTotal).toFixed(1)}% ${holdPass}/${holdTotal}` : '-').padStart(18),
    (costs.length ? '$' + median(costs).toFixed(2) : '-').padStart(9),
    mins(median(e2e.map((r) => final(r).agent_seconds))).padStart(8),
    (held.length ? `${e2e.length}/${held.length}` : '-').padStart(12),
    (e2eCosts.length ? '$' + median(e2eCosts).toFixed(2) : '-').padStart(9),
  );
}
console.log('\nmedian_min = median agent minutes to a green visible suite, over green runs only.');
console.log('med_cost = median cost over green runs only; DNF runs are not included.');
console.log('holdout_pass = holdout test cases passed out of all cases run, pooled over green runs (DNF runs have no holdout score).');
console.log('e2e_* = after the repair pass: median agent minutes and cost (one-shot + repair turns) over runs that end');
console.log('  with a clean holdout; e2e_holdout = how many green runs got there. Without repairs, e2e equals one-shot.');
console.log('A fast arm with a low holdout_pass is gaming the visible tests.');
