# Portable helpers for macOS and Linux. Sourced by run.sh and judge.sh.

# with_timeout SECONDS CMD...  -> runs CMD, killed after SECONDS. Timeout exit codes: 124 or 142.
with_timeout() {
  local secs="$1"; shift
  if command -v timeout >/dev/null 2>&1; then timeout "$secs" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then gtimeout "$secs" "$@"
  else perl -e 'alarm shift; exec @ARGV or die "exec failed: $!"' "$secs" "$@"
  fi
}
is_timeout_rc() { [ "$1" -eq 124 ] || [ "$1" -eq 142 ]; }

# free_port PORT -> kills whatever listens on PORT.
free_port() {
  local pids
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti "tcp:$1" 2>/dev/null || true)"
    [ -n "$pids" ] && kill $pids 2>/dev/null || true
  else
    fuser -k "$1/tcp" >/dev/null 2>&1 || true
  fi
}

now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }
