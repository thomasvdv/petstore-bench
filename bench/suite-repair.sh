#!/usr/bin/env bash
# suite-repair.sh N ARM... — run N full-suite rounds, then repair every run that failed holdout.
# The one-shot results are written as usual; repair outcomes go to each run's repair.json.
set -uo pipefail
N="$1"; shift
ARMS=("$@")
KIT="$(cd "$(dirname "$0")/.." && pwd)"
TASK="${TASK:-petstore}"; export TASK
REPAIR_ROUNDS="${REPAIR_ROUNDS:-2}"

"$KIT/bench/schedule.sh" "$N" "${ARMS[@]}"

echo
echo "=== repairs (max $REPAIR_ROUNDS turns per failed run) ==="
for arm in "${ARMS[@]}"; do
  for ((r = 1; r <= N; r++)); do
    OUT="$KIT/results/$TASK/$arm-r$r"
    [ -f "$OUT/result.json" ] || continue
    fail=$(node -e 'const r=require(process.argv[1]); console.log(r.holdout_failed ?? 0)' "$OUT/result.json")
    pass=$(node -e 'const r=require(process.argv[1]); console.log(r.holdout_passed ?? 0)' "$OUT/result.json")
    status=$(node -e 'const r=require(process.argv[1]); console.log(r.status ?? "")' "$OUT/result.json")
    if [ "$status" = "green" ] && [ "$((pass + fail))" -eq 0 ]; then
      echo "=== repair $arm/r$r: holdout produced no report ==="
      "$KIT/bench/repair.sh" "$arm" "r$r" "$REPAIR_ROUNDS"
    elif [ "$fail" -gt 0 ]; then
      echo "=== repair $arm/r$r: $fail holdout failures ==="
      "$KIT/bench/repair.sh" "$arm" "r$r" "$REPAIR_ROUNDS"
    elif [ "$status" != "green" ]; then
      echo "=== skip $arm/r$r: status $status ==="
    else
      echo "=== skip $arm/r$r: holdout clean ==="
    fi
  done
done

echo
echo "=== repair summary ==="
for arm in "${ARMS[@]}"; do
  for ((r = 1; r <= N; r++)); do
    OUT="$KIT/results/$TASK/$arm-r$r"
    if [ -f "$OUT/repair.json" ]; then
      node -e 'const r=require(process.argv[1]); console.log(process.argv[2].padEnd(16), r.status, `repair_rounds=${r.repair_rounds}`, `holdout=${r.holdout_passed}/${r.holdout_passed+r.holdout_failed}`, `repair_seconds=${r.repair_seconds}`)' "$OUT/repair.json" "$arm/r$r"
    fi
  done
done
