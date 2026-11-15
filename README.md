# Pet Store speed benchmark

This benchmark measures how fast each agent arm builds the same app from the same spec, judged by tests the agent can't tamper with.

## Tasks

Each task lives in `tasks/<name>/`. `template/` is copied into a fresh git repo for every run: `SPEC.md`, `AGENTS.md` (also copied to `CLAUDE.md`), `seed/`, the visible suite in `acceptance/`, and `opencode.json`. `holdout/` holds the tests the agents never see. Pick a task with `TASK=<name>`; the default is `petstore`.

- `petstore`: catalog, search, cart, accounts, checkout, async approval. 11 visible, 16 holdout.
- `petstore-v2`: the same store plus stock reservations that expire, coupons with per-line rounding, tax by state, shipping, cancellation, idempotent checkout, order event history, and partial refunds that split a fixed discount across lines. 16 visible, 23 holdout. Every expected amount in its tests was recomputed from the spec's rules.
- `petstore-v3`: v2 plus a test-controlled business clock, grouped coupon stacking with best-subset selection and per-line discount caps, gift cards with split payments and tender-aware refunds, admin item price edits with order price snapshots, multi-warehouse stock allocation, and hidden seed variants 2 and 3. 23 visible, 42 holdout.

Runs, results and judges are kept per task: `runs/<task>/`, `results/<task>/`, `judge/<task>/`.
- `bench/` has the harness:
  - `setup.sh` builds the judge and warms the npm cache. Run it once.
  - `run.sh ARM RUN_ID` does one timed run.
  - `schedule.sh N ARM...` runs N rounds and rotates the arm order each round.
  - `summarize.mjs` prints the results table.
  - `repair.sh ARM RUN_ID [ROUNDS]` resumes a finished run, feeds it hidden holdout failures and re-scores; writes `repair.json`.
  - `suite-repair.sh N ARM...` runs the full schedule, then repairs every run that failed holdout.
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
bench/setup.sh                                  # builds judges for every task
TASK=petstore-v2 bench/run.sh claude-opus calib # calibrate first, see below
TASK=petstore-v2 caffeinate -is bench/schedule.sh 3 claude-opus claude-sonnet opencode-flash
node bench/summarize.mjs petstore-v2            # leaves out calib runs

TASK=petstore-v3 bench/run.sh opencode-flash calib
TASK=petstore-v3 caffeinate -is bench/schedule.sh 3 claude-opus claude-sonnet claude-haiku opencode-flash opencode-glm
node bench/summarize.mjs petstore-v3

# Full suite, then up to REPAIR_ROUNDS (default 2) repair turns for every run that failed holdout.
TASK=petstore-v3 caffeinate -is bench/suite-repair.sh 3 claude-opus claude-sonnet claude-haiku opencode-flash opencode-glm
```

Arms: `claude-opus`, `claude-sonnet`, `claude-haiku`, `opencode-flash`, `opencode-glm`.

## Check before the real runs

- **The model ids and CLI flags in `arms.sh`.** I couldn't run either CLI here. Confirm `claude -p --continue --model --dangerously-skip-permissions --output-format json` and `opencode run -m provider/model --continue` against your installed versions. Confirm the provider/model strings too. Override them with `CLAUDE_OPUS_MODEL`, `OC_FLASH_MODEL` and so on.
- **The opencode permission format** in `template/opencode.json`, for your opencode version. One permission prompt would stall a headless run until the cap.
- **Calibrate every new task.** The suites typecheck and list correctly, but a test can still be wrong about the spec. Do one calibration run and read any failures. If a test is wrong rather than the app, fix the test before the timed runs. A broken test makes every arm DNF.
- **Isolation.** Runs are sequential and use port 3000. Don't run two at once. For stronger isolation, run each `run.sh` inside a container.
- **Cost.** `cost.mjs` sums Claude Code's `total_cost_usd` and opencode's per-step `part.cost` from the agent logs. That is the provider's own accounting, so it reflects the model and prices at run time.

## Reading the results

Use `median_min` only over green runs, and report the green count next to it. `holdout_pass` pools every holdout test case across an arm's green runs (for example 125/126 for three runs of 42), so a single failed test in a single run still shows. If an arm is fast but has a low `holdout_pass`, it's gaming the visible tests, not building the app.

The `e2e_*` columns read the repair pass: `e2e_min` and `e2e_cost` are medians of one-shot plus repair turns over runs that end with a clean holdout, and `e2e_holdout` counts how many green runs got there. Without repairs they equal the one-shot columns.

## Results: petstore-v2, 2026-11-10

Three rounds per arm, order rotated each round, `EFFORT=max`. Raw runs are in `results/petstore-v2/`; judge time is excluded.

| arm | model | green | median_min | best_min | holdout (full runs) | med_cost |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| claude-opus | claude-opus-5-5 | 3/3 | 18.9 | 15.5 | 3/3 | $4.76 |
| opencode-flash | ollama-cloud/deepseek-v4.1-flash:1017 | 3/3 | 9.3 | 7.9 | 3/3 | $0.09 |

All six runs passed the 16 visible tests on the first turn, so these times measure generation speed, not recovery from judge feedback.

The holdout was expanded from 13 to 23 tests after these runs. The ten additions cover money boundaries, a six-buyer reservation race, cancel-vs-approve, concurrent refunds, coupon reuse after cancelled/denied/expired orders, and the fixed-coupon tie-break. Re-scoring the six archived checkouts against the larger suite gives 23/23 for every run, so the hardening did not change the ranking. The `result.json` files still record the original 13-test score.

The `opencode-opus` runs are archived under `results/archive/petstore-v2/`, `runs/archive/petstore-v2/`, `results/archive/petstore-v3/` and `runs/archive/petstore-v3/`; the arm is no longer part of the benchmark.

Caveats: n=3. `opencode-flash` got faster every round (13.1, 9.3, 7.9 min) and `claude-opus` did too (21.2, 18.9, 15.5), so warm-cache and API drift are not resolved by this sample. Costs are provider list prices at the time of the run.

## Results: petstore-v3, 2026-11-14

Five arms, three rounds each, order rotated each round, `EFFORT=max`, followed by a repair pass (up to two repair turns per run that failed holdout). All 15 runs passed 23/23 visible on the first turn.

| arm | model | holdout_pass | repair_min | e2e_min | e2e_cost |
| --- | --- | ---: | ---: | ---: | ---: |
| opencode-glm | ollama-cloud/glm-5.3 | 100.0% 126/126 | - | 14.6 | $3.34 |
| opencode-flash | ollama-cloud/deepseek-v4.1-flash:1017 | 95.2% 120/126 | 6.8 (r1), 11.0 (r3) | 17.6 | $0.21 |
| claude-sonnet | claude-sonnet-5-5 | 100.0% 126/126 | - | 19.3 | $3.31 |
| claude-haiku | claude-haiku-5-5 | 100.0% 126/126 | - | 20.5 | $1.40 |
| claude-opus | claude-opus-5-5 | 99.2% 125/126 | 3.6 (r2) | 25.7 | $6.27 |

`holdout_pass` is one-shot. Every repaired run reached 42/42 in a single repair turn. The failures:

- **opencode-flash r1 and r3** lost the second of two consecutive cart quantity edits, breaking the percent-discount, free-shipping and fixed-coupon tie-break tests with identical wrong subtotals. Flash hit this in every v3 batch, and GLM did in two of three runs of an earlier one-shot batch. The visible suite never edits two quantities in a row.
- **claude-opus r2** left an order `PENDING` after the cancel-vs-admin-approve race.

Resuming a Claude session is expensive: the 3.6-minute opus repair cost about $8.75 on top of the $6.04 one-shot run. Flash repairs cost about 10 to 14 cents.

Caveats: n=3 per arm, and spreads within an arm reach 7 to 16 minutes, so only large time gaps are meaningful. The 2026-11-12 v3 batch was discarded (the machine went offline and onto battery mid-schedule), and an earlier v3 batch predates two holdout test fixes; both are archived and not comparable.

## Results: petstore (v1), 2026-11-15

Same five arms and protocol. All 15 runs passed 11/11 visible on the first turn.

| arm | model | holdout_pass | repair_min | e2e_min | e2e_cost |
| --- | --- | ---: | ---: | ---: | ---: |
| opencode-flash | ollama-cloud/deepseek-v4.1-flash:1017 | 97.9% 47/48 | 2.1 (r2) | 6.3 | $0.06 |
| opencode-glm | ollama-cloud/glm-5.3 | 100.0% 48/48 | - | 6.6 | $1.81 |
| claude-sonnet | claude-sonnet-5-5 | 100.0% 48/48 | - | 11.8 | $2.01 |
| claude-haiku | claude-haiku-5-5 | 100.0% 48/48 | - | 14.4 | $0.82 |
| claude-opus | claude-opus-5-5 | 100.0% 48/48 | - | 16.8 | $4.30 |

The only failure was **opencode-flash r2** on "change quantity and remove lines", again a cart quantity edit; one repair turn fixed it. v1 does not separate the arms on correctness; v3 does.
