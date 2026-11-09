# Pet Store speed benchmark

This benchmark measures how fast each agent arm builds the same app from the same spec, judged by tests the agent can't tamper with.

## Layout

- `template/` is copied into a fresh git repo for every run. It holds `SPEC.md`, `AGENTS.md` (also copied to `CLAUDE.md`), `seed/catalog.json`, the visible suite in `acceptance/`, and `opencode.json`, which pre-grants permissions.
- `holdout/` has 16 tests the agents never see. They cover the same spec through different paths: edge cases, concurrency, deny flow and privacy.
- `bench/` has the harness:
  - `setup.sh` builds the judge and warms the npm cache. Run it once.
  - `run.sh ARM RUN_ID` does one timed run.
  - `schedule.sh N ARM...` runs N rounds and rotates the arm order each round.
  - `summarize.mjs` prints the results table.
  - `arms.sh` holds the agent commands and model ids.

## Protocol

1. The agent gets the prompt and works until it stops.
2. The judge runs a pristine copy of the visible suite against the app. If the agent edits its own copy of the tests, it gains nothing.
3. If any test fails, the failing test titles and errors go back to the same session as a new turn.
4. Steps 1 to 3 repeat until the suite is green, or until 2 hours of agent time (`CAP_SECONDS`), or until 6 turns (`MAX_ROUNDS`).
5. Once a run is green, the judge scores the holdout suite.

The headline metric is `agent_seconds`: the sum of the agent's turn times up to the green turn. Judge time is excluded. `wall_seconds` is recorded too.

## Run on teachpilot-build

```
bench/setup.sh
bench/run.sh claude-opus calib        # calibration run first, see below
bench/schedule.sh 3 claude-opus opencode-flash opencode-opus
node bench/summarize.mjs
```

Arms: `claude-opus`, `claude-sonnet`, `opencode-flash`, `opencode-opus`.

## Check before the real runs

- **The model ids and CLI flags in `arms.sh`.** I couldn't run either CLI here. Confirm `claude -p --continue --model --dangerously-skip-permissions --output-format json` and `opencode run -m provider/model --continue` against your installed versions. Confirm the provider/model strings too. Override them with `CLAUDE_OPUS_MODEL`, `OC_FLASH_MODEL` and so on.
- **The opencode permission format** in `template/opencode.json`, for your opencode version. One permission prompt would stall a headless run until the cap.
- **The suites have not been run against a working app.** They typecheck and list correctly. Do one calibration run and read any failures. If a test is wrong rather than the app, fix the test before the timed runs. A broken test makes every arm DNF.
- **Isolation.** Runs are sequential and use port 3000. Don't run two at once. For stronger isolation, run each `run.sh` inside a container.
- **Cost.** It's captured from Claude Code's JSON output only. For opencode arms, read cost from the provider dashboard.

## Reading the results

Use `median_min` only over green runs, and report the green count next to it. If an arm is fast but has a low `holdout_pass`, it's gaming the visible tests, not building the app.
