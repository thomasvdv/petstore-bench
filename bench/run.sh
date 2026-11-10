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
TASK="${TASK:-petstore}"; export TASK
TD="$KIT/tasks/$TASK"
[ -d "$TD/template" ] || { echo "no task $TASK in $KIT/tasks" >&2; exit 2; }
WORK="${WORK_ROOT:-$KIT/runs}/$TASK/$ARM-$RUN"
OUT="$KIT/results/$TASK/$ARM-$RUN"
[ -d "$KIT/judge/$TASK" ] || { echo "run bench/setup.sh $TASK first" >&2; exit 2; }

rm -rf "$WORK" "$OUT"; mkdir -p "$WORK" "$OUT"
cp -r "$TD/template/." "$WORK/"
cp "$WORK/AGENTS.md" "$WORK/CLAUDE.md"
( cd "$WORK" && git init -q && git add -A && git -c user.name=bench -c user.email=bench@local commit -qm "spec" )

source "$KIT/bench/lib.sh"
trap 'echo; echo "interrupted: stopping agent and servers"; free_port 3000; kill 0' INT TERM
source "$KIT/bench/arms.sh"
OC_SESSION="ses_bench$(echo "$ARM$RUN" | tr -cd "[:alnum:]")$(date +%s)"
export OC_SESSION EFFORT OPENCODE_BIN ARM CLAUDE_OPUS_MODEL CLAUDE_SONNET_MODEL OC_FLASH_MODEL OC_OPUS_MODEL
export -f agent_start agent_resume _claude _opencode
cd "$WORK"

PROMPT="Build the application described in SPEC.md. Follow AGENTS.md. Work without asking questions. Stop as soon as the acceptance suite passes. Do not add tests or features beyond the spec."
et() { TZ=America/New_York date '+%H:%M ET'; }
# Prints a progress line every minute while an agent turn runs.
heartbeat() { # $1 turn start epoch, $2 log prefix
  while sleep 60; do
    local changed
    changed=$(git -C "$WORK" status --porcelain 2>/dev/null | grep -vc node_modules)
    echo "  $(et) $ARM/$RUN turn $round: $(( ($(date +%s) - $1) / 60 )) min, $changed paths changed, log $(wc -c <"$2.out" | tr -d ' ') bytes"
  done
}

echo "$(et) $TASK $ARM/$RUN starting. Workdir: $WORK  Logs: $OUT"
agent_s=0; round=0; green=false; status="dnf"
wall_start=$(date +%s); started_iso=$(now_iso)

while :; do
  round=$((round + 1))
  left=$((CAP_SECONDS - agent_s))
  [ "$left" -le 0 ] && { status="dnf-time"; break; }

  t0=$(date +%s)
  echo "$(et) turn $round: agent working (progress every minute; tail -f $OUT/agent-$round.out)"
  heartbeat "$t0" "$OUT/agent-$round" & HB=$!
  if [ "$round" -eq 1 ]; then
    with_timeout "$left" bash -c 'agent_start "$1"' _ "$PROMPT" \
      >"$OUT/agent-$round.out" 2>"$OUT/agent-$round.err" </dev/null
  else
    with_timeout "$left" bash -c 'agent_resume "$1"' _ "$FEEDBACK" \
      >"$OUT/agent-$round.out" 2>"$OUT/agent-$round.err" </dev/null
  fi
  agent_rc=$?
  kill "$HB" 2>/dev/null; wait "$HB" 2>/dev/null
  turn_s=$(( $(date +%s) - t0 ))
  echo "$(et) turn $round: agent stopped after $((turn_s / 60)) min (exit $agent_rc). Judging."
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
    green=true; status="green"; echo "$(et) visible suite GREEN"; break
  fi
  is_timeout_rc "$agent_rc" && { status="dnf-time"; break; }
  [ "$round" -ge "$MAX_ROUNDS" ] && { status="dnf-rounds"; break; }

  echo "$(et) visible suite failed: $(node "$KIT/bench/report.mjs" counts "$OUT/visible-$round.json" | awk '{print $1" passed, "$2" failed"}'). Sending feedback."
  FEEDBACK="An independent judge ran the untouched acceptance suite against your app and it failed. Fix the app (not the tests) and keep going until the suite passes.

$(node "$KIT/bench/report.mjs" failures "$OUT/visible-$round.json")"
done

wall_s=$(( $(date +%s) - wall_start ))
read -r vis_pass vis_fail < <(node "$KIT/bench/report.mjs" counts "$OUT/visible-$round.json" 2>/dev/null || echo "0 0")

hold_pass=0; hold_fail=0
if $green; then
  echo "$(et) scoring holdout suite"
  "$KIT/bench/judge.sh" holdout "$WORK" "$OUT/holdout.json"
  read -r hold_pass hold_fail < <(node "$KIT/bench/report.mjs" counts "$OUT/holdout.json")
fi

cost=$(node "$KIT/bench/cost.mjs" "$OUT")

cat >"$OUT/result.json" <<EOF
{"task":"$TASK","arm":"$ARM","run":"$RUN","status":"$status","rounds":$round,
 "agent_seconds":$agent_s,"wall_seconds":$wall_s,
 "visible_passed":$vis_pass,"visible_failed":$vis_fail,
 "holdout_passed":$hold_pass,"holdout_failed":$hold_fail,
 "cost_usd":$cost,"effort":"$EFFORT","started":"$started_iso"}
EOF
cat "$OUT/result.json"
