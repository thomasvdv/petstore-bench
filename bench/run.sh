#!/usr/bin/env bash
# run.sh ARM RUN_ID
# One timed run: fresh repo, agent works until the pristine visible suite passes,
# or until the time cap or round cap. Then the holdout suite is scored.
#
# Speed metric: agent_seconds = sum of agent turn durations up to the turn that went green.
# Judge time is excluded so the app's test duration doesn't count against the agent.
set -uo pipefail
ARM="$1"; RUN="$2"
KIT="$(cd "$(dirname "$0")/.." && pwd)"
CAP_SECONDS="${CAP_SECONDS:-7200}"   # 2 hours of agent time
MAX_ROUNDS="${MAX_ROUNDS:-6}"         # first turn + up to 5 feedback turns
WORK="${WORK_ROOT:-$KIT/runs}/$ARM-$RUN"
OUT="$KIT/results/$ARM-$RUN"
[ -d "$KIT/judge" ] || { echo "run bench/setup.sh first" >&2; exit 2; }

rm -rf "$WORK" "$OUT"; mkdir -p "$WORK" "$OUT"
cp -r "$KIT/template/." "$WORK/"
cp "$WORK/AGENTS.md" "$WORK/CLAUDE.md"
( cd "$WORK" && git init -q && git add -A && git -c user.name=bench -c user.email=bench@local commit -qm "spec" )

source "$KIT/bench/lib.sh"
source "$KIT/bench/arms.sh"
OC_SESSION="ses_bench$(echo "$ARM$RUN" | tr -cd "[:alnum:]")$(date +%s)"
export OC_SESSION EFFORT OPENCODE_BIN ARM CLAUDE_OPUS_MODEL CLAUDE_SONNET_MODEL OC_FLASH_MODEL OC_OPUS_MODEL
export -f agent_start agent_resume _claude _opencode
cd "$WORK"

PROMPT="Build the application described in SPEC.md. Follow AGENTS.md. Work without asking questions until the acceptance suite passes."
agent_s=0; round=0; green=false; status="dnf"
wall_start=$(date +%s); started_iso=$(now_iso)

while :; do
  round=$((round + 1))
  left=$((CAP_SECONDS - agent_s))
  [ "$left" -le 0 ] && { status="dnf-time"; break; }

  t0=$(date +%s)
  if [ "$round" -eq 1 ]; then
    with_timeout "$left" bash -c 'agent_start "$1"' _ "$PROMPT" \
      >"$OUT/agent-$round.out" 2>"$OUT/agent-$round.err" </dev/null
  else
    with_timeout "$left" bash -c 'agent_resume "$1"' _ "$FEEDBACK" \
      >"$OUT/agent-$round.out" 2>"$OUT/agent-$round.err" </dev/null
  fi
  agent_rc=$?
  turn_s=$(( $(date +%s) - t0 ))
  agent_s=$((agent_s + turn_s))

  # An agent that errors out within seconds is a harness problem, not a slow agent. Stop.
  if [ "$agent_rc" -ne 0 ] && ! is_timeout_rc "$agent_rc" && [ "$turn_s" -lt 15 ]; then
    status="agent-error"
    echo "agent exited with code $agent_rc after ${turn_s}s. See $OUT/agent-$round.err:" >&2
    tail -5 "$OUT/agent-$round.err" >&2
    break
  fi

  # Judge with the pristine visible suite. Install deps first in case the agent left them stale.
  ( cd "$WORK" && npm install --no-audit --no-fund >"$OUT/install-$round.log" 2>&1 )
  if "$KIT/bench/judge.sh" visible "$WORK" "$OUT/visible-$round.json"; then
    green=true; status="green"; break
  fi
  is_timeout_rc "$agent_rc" && { status="dnf-time"; break; }
  [ "$round" -ge "$MAX_ROUNDS" ] && { status="dnf-rounds"; break; }

  FEEDBACK="An independent judge ran the untouched acceptance suite against your app and it failed. Fix the app (not the tests) and keep going until the suite passes.

$(node "$KIT/bench/report.mjs" failures "$OUT/visible-$round.json")"
done

wall_s=$(( $(date +%s) - wall_start ))
read -r vis_pass vis_fail < <(node "$KIT/bench/report.mjs" counts "$OUT/visible-$round.json" 2>/dev/null || echo "0 0")

hold_pass=0; hold_fail=0
if $green; then
  "$KIT/bench/judge.sh" holdout "$WORK" "$OUT/holdout.json"
  read -r hold_pass hold_fail < <(node "$KIT/bench/report.mjs" counts "$OUT/holdout.json")
fi

# Claude Code's JSON output carries cost; opencode's does not, so it is left null here.
cost=$(cat "$OUT"/agent-*.out 2>/dev/null | grep -o '"total_cost_usd":[0-9.]*' | cut -d: -f2 | paste -sd+ - | bc 2>/dev/null || true)

cat >"$OUT/result.json" <<EOF
{"arm":"$ARM","run":"$RUN","status":"$status","rounds":$round,
 "agent_seconds":$agent_s,"wall_seconds":$wall_s,
 "visible_passed":$vis_pass,"visible_failed":$vis_fail,
 "holdout_passed":$hold_pass,"holdout_failed":$hold_fail,
 "cost_usd":${cost:-null},"effort":"$EFFORT","started":"$started_iso"}
EOF
cat "$OUT/result.json"
