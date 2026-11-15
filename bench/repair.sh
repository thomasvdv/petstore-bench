#!/usr/bin/env bash
# repair.sh ARM RUN_ID [MAX_REPAIR_ROUNDS]
# Resumes a finished run's agent session, feeds it the hidden holdout failures, and re-scores
# visible + holdout after each repair turn. This is a self-repair diagnostic, not a one-shot run.
# Results go to repair.json; the original result.json is left untouched.
set -uo pipefail
ARM="$1"; RUN="$2"; MAX_REPAIR="${3:-2}"
KIT="$(cd "$(dirname "$0")/.." && pwd)"
TASK="${TASK:-petstore}"; export TASK
WORK="${WORK_ROOT:-$KIT/runs}/$TASK/$ARM-$RUN"
OUT="$KIT/results/$TASK/$ARM-$RUN"
[ -d "$WORK" ] || { echo "no workdir $WORK" >&2; exit 2; }
[ -f "$OUT/result.json" ] || { echo "no result.json in $OUT" >&2; exit 2; }
source "$KIT/bench/lib.sh"
source "$KIT/bench/arms.sh"

# Recover the explicit opencode session from the first turn's JSON, unless saved.
if [ -f "$OUT/session.txt" ]; then
  OC_SESSION="$(cat "$OUT/session.txt")"
elif [[ "$ARM" == claude-* ]]; then
  # Claude Code resumes the workdir's most recent conversation with --continue.
  OC_SESSION=""
else
  OC_SESSION="$(grep -o '"sessionID":"[^"]*"' "$OUT/agent-1.out" 2>/dev/null | head -1 | cut -d'"' -f4)"
fi
if [[ "$ARM" != claude-* ]] && [ -z "${OC_SESSION:-}" ]; then
  echo "could not find session id" >&2
  exit 2
fi
export OC_SESSION EFFORT OPENCODE_BIN ARM CLAUDE_OPUS_MODEL CLAUDE_SONNET_MODEL CLAUDE_HAIKU_MODEL OC_FLASH_MODEL OC_GLM_MODEL
export -f agent_resume _opencode _claude

read -r initial_hold_pass initial_hold_fail < <(
  node "$KIT/bench/report.mjs" counts "$OUT/holdout.json" 2>/dev/null || echo "0 0"
)
initial_agent_s=$(node -e 'const r=require(process.argv[1]); console.log(r.agent_seconds ?? 0)' "$OUT/result.json")
initial_green=$(node -e 'const r=require(process.argv[1]); console.log(r.status === "green" && r.visible_failed === 0 ? "true" : "false")' "$OUT/result.json")
total_agent_s="$initial_agent_s"
repair_s=0
rounds=0
green=false
[ "$initial_green" = "true" ] && green=true
hold_json="$OUT/holdout.json"
vis_json="$OUT/visible-1.json"
hold_pass="$initial_hold_pass"
hold_fail="$initial_hold_fail"

# A holdout run that produced no report counts as 0 passed / 0 failed. That is a failure, not a pass.
hold_ok() { [ "$hold_fail" -eq 0 ] && [ "$hold_pass" -gt 0 ]; }

# Find the next free agent-N.out number.
n=1
while [ -f "$OUT/agent-$n.out" ]; do n=$((n + 1)); done

cd "$WORK"
while { ! hold_ok || ! $green; } && [ "$rounds" -lt "$MAX_REPAIR" ]; do
  rounds=$((rounds + 1))
  left=$(( ${CAP_SECONDS:-7200} - total_agent_s ))
  [ "$left" -le 0 ] && { echo "agent-time cap reached"; break; }

  FEEDBACK="An independent judge ran the hidden holdout suite against your app and it did not pass. Fix the app (not the tests) without breaking the visible acceptance suite. Keep the spec's behavior; stop when the hidden suite passes.

$(node "$KIT/bench/report.mjs" failures "$hold_json")"
  if ! $green; then
    FEEDBACK="$FEEDBACK

The visible acceptance suite also failed and must stay green:

$(node "$KIT/bench/report.mjs" failures "$vis_json")"
  fi

  # Do not leave the injected holdout seed variants in the agent's repo during repair.
  rm -rf "$WORK/seed/variants"
  echo "repair $rounds: agent working (${left}s left)"
  t0=$(date +%s)
  with_timeout "$left" bash -c 'agent_resume "$1"' _ "$FEEDBACK" \
    >"$OUT/agent-$n.out" 2>"$OUT/agent-$n.err" </dev/null
  agent_rc=$?
  turn_s=$(( $(date +%s) - t0 ))
  repair_s=$((repair_s + turn_s))
  total_agent_s=$((total_agent_s + turn_s))
  echo "repair $rounds: agent stopped after ${turn_s}s (exit $agent_rc)"

  if [ "$agent_rc" -ne 0 ] && ! is_timeout_rc "$agent_rc" && [ "$turn_s" -lt 15 ]; then
    echo "agent exited with code $agent_rc after ${turn_s}s; stopping" >&2
    break
  fi

  ( cd "$WORK" && npm install --no-audit --no-fund >"$OUT/install-repair-$rounds.log" 2>&1 )
  vis_json="$OUT/visible-repair-$rounds.json"
  if "$KIT/bench/judge.sh" visible "$WORK" "$vis_json"; then green=true; else green=false; fi
  hold_json="$OUT/holdout-repair-$rounds.json"
  "$KIT/bench/judge.sh" holdout "$WORK" "$hold_json" >/dev/null 2>&1 || true
  read -r hold_pass hold_fail < <(node "$KIT/bench/report.mjs" counts "$hold_json" 2>/dev/null || echo "0 0")
  echo "repair $rounds: visible $($green && echo GREEN || echo FAILED), holdout $hold_pass passed / $hold_fail failed"
  n=$((n + 1))
done

read -r vis_pass vis_fail < <(node "$KIT/bench/report.mjs" counts "$vis_json" 2>/dev/null || echo "0 0")
cost=$(node "$KIT/bench/cost.mjs" "$OUT")
status="unrepaired"
if $green && hold_ok; then status="repaired"; fi
if ! $green; then status="broken-visible"; fi
if [ "$initial_hold_fail" -eq 0 ] && [ "$initial_hold_pass" -gt 0 ] && $green; then status="clean"; fi

cat >"$OUT/repair.json" <<EOF
{"task":"$TASK","arm":"$ARM","run":"$RUN","status":"$status",
 "initial_holdout_passed":$initial_hold_pass,"initial_holdout_failed":$initial_hold_fail,
 "repair_rounds":$rounds,"visible_passed":$vis_pass,"visible_failed":$vis_fail,
 "holdout_passed":$hold_pass,"holdout_failed":$hold_fail,
 "initial_agent_seconds":$initial_agent_s,"repair_seconds":$repair_s,"agent_seconds":$total_agent_s,
 "cost_usd":$cost,"effort":"$EFFORT"}
EOF
cat "$OUT/repair.json"
