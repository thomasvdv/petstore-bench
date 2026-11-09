# Instructions

Build the application described in `SPEC.md` in this repository.

- Work autonomously. Do not ask questions. If the spec is silent, make a reasonable choice and move on.
- Do not modify anything under `acceptance/` or `seed/`. A separate, untouched copy of the tests is used for judging.
- Use the required stack in SPEC.md section 1.
- You are done when this passes from the repo root:
  `cd acceptance && npm install && npx playwright install chromium && npx playwright test`
- Leave port 3000 free when you finish. Stop any server you started.
