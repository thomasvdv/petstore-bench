// node cost.mjs RESULT_DIR -> prints total USD across all agent turns, or "null".
// Claude Code (stream-json): one "result" event per turn with total_cost_usd for that turn.
// opencode V2 (--format json): one "step_finish" event per step with part.cost.
import fs from 'fs';
import path from 'path';

const dir = process.argv[2];
let total = 0;
let seen = false;
for (const f of fs.readdirSync(dir).filter((f) => /^agent-\d+\.out$/.test(f))) {
  for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
    if (!line.startsWith('{')) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === 'result' && typeof e.total_cost_usd === 'number') { total += e.total_cost_usd; seen = true; }
    if (e.type === 'step_finish' && typeof e.part?.cost === 'number') { total += e.part.cost; seen = true; }
  }
}
console.log(seen ? total.toFixed(4) : 'null');
