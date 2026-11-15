# Agent arms. Sourced by run.sh with $ARM set and cwd = the run's workdir.
# agent_start PROMPT   -> first turn
# agent_resume PROMPT  -> continue the same session with judge feedback
# Model ids are overridable by env. Check them against your installed CLIs.

CLAUDE_OPUS_MODEL="${CLAUDE_OPUS_MODEL:-claude-opus-5-5}"
CLAUDE_SONNET_MODEL="${CLAUDE_SONNET_MODEL:-claude-sonnet-5-5}"
CLAUDE_HAIKU_MODEL="${CLAUDE_HAIKU_MODEL:-claude-haiku-5-5}"
OC_FLASH_MODEL="${OC_FLASH_MODEL:-ollama-cloud/deepseek-v4.1-flash:1017}"
OC_GLM_MODEL="${OC_GLM_MODEL:-ollama-cloud/glm-5.3}"
# Reasoning effort for every arm: Claude Code --effort, opencode model#variant.
EFFORT="${EFFORT:-max}"

arm_model() {
  case "$ARM" in
    claude-opus)    echo "$CLAUDE_OPUS_MODEL" ;;
    claude-sonnet)  echo "$CLAUDE_SONNET_MODEL" ;;
    claude-haiku)   echo "$CLAUDE_HAIKU_MODEL" ;;
    opencode-flash) echo "$OC_FLASH_MODEL" ;;
    opencode-glm)   echo "$OC_GLM_MODEL" ;;
    *) echo "unknown arm $ARM" >&2; return 2 ;;
  esac
}

_claude() { # $1 model, $2 prompt, $3 extra flag
  claude -p "$2" $3 --model "$1" --effort "$EFFORT" --dangerously-skip-permissions --output-format stream-json --verbose
}
# opencode V2 (installed as opencode2). Effort goes in the model name: provider/model#variant.
# Start and resume use the same explicit session id, so a resume can never pick up
# some other session from V2's shared background service. --auto approves permissions.
OPENCODE_BIN="${OPENCODE_BIN:-opencode2}"
_opencode() { # $1 model, $2 prompt, $3 ignored (same session id continues the run)
  "$OPENCODE_BIN" run --session "$OC_SESSION" -m "$1#$EFFORT" --format json --thinking --auto --archived "$2"
}

agent_start() {
  case "$ARM" in
    claude-opus)    _claude   "$CLAUDE_OPUS_MODEL"   "$1" "" ;;
    claude-sonnet)  _claude   "$CLAUDE_SONNET_MODEL" "$1" "" ;;
    claude-haiku)   _claude   "$CLAUDE_HAIKU_MODEL"  "$1" "" ;;
    opencode-flash) _opencode "$OC_FLASH_MODEL"      "$1" "" ;;
    opencode-glm)   _opencode "$OC_GLM_MODEL"        "$1" "" ;;
    *) echo "unknown arm $ARM" >&2; return 2 ;;
  esac
}

agent_resume() {
  case "$ARM" in
    claude-opus)    _claude   "$CLAUDE_OPUS_MODEL"   "$1" "--continue" ;;
    claude-sonnet)  _claude   "$CLAUDE_SONNET_MODEL" "$1" "--continue" ;;
    claude-haiku)   _claude   "$CLAUDE_HAIKU_MODEL"  "$1" "--continue" ;;
    opencode-flash) _opencode "$OC_FLASH_MODEL"      "$1" "--continue" ;;
    opencode-glm)   _opencode "$OC_GLM_MODEL"        "$1" "--continue" ;;
    *) echo "unknown arm $ARM" >&2; return 2 ;;
  esac
}
