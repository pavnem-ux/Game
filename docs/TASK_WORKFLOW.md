# Task workflow

How every task is run (owner decision, Task 29). A task file only needs to say «Follow
docs/TASK_WORKFLOW.md». AGENTS.md rules (roles, invariants, git) still apply.

## Session

- Read the task file, its progress file (`docs/task-NN-progress.md`), [CODEMAP.md](CODEMAP.md),
  then `git status` and `git log --oneline -5`.
- Continue from the first unchecked step; resolve uncommitted leftovers first.
- Don't re-explore the repo: use CODEMAP, and update it when you add or move important files.

## Branch and PR

- Branch from the latest `main` with the name given in the task; open a draft PR to `main` at the
  start. Never merge: only the owner merges.

## Steps

- One step → targeted test (only the affected suite) → commit `Task NN: <step> <summary>` → push →
  tick the step in the progress file.
- Phases run back-to-back; stop only on a blocker or when done.

## Progress file

- The step checklist plus one-line decisions / blockers. Nothing else.

## Verification (the owner tests manually)

- Unit tests only for logic: gameplay rules, formulas, rewards, saves, determinism. 1–3 focused
  tests per behaviour. No tests for pure layout / visual / text changes.
- Bug fixes include a regression test. Never skip, disable or weaken a test to get green.
- e2e: add or update only when a core flow changes (start run, level-up offer, run end, save /
  load, shop purchase). Desktop viewport only. CI runs e2e; run it locally only to fix a CI
  failure.
- Before the final push, once: `npm run typecheck`, `npm test`, `npm run format:check`,
  `npm run build`. `npm run test:production` only if the build, DEV gating or `main.tsx` changed.
- No screenshots, FPS tables or measurement reports unless the task asks.
- Report results as one line per command (pass / fail + count). Never paste logs.

## Docs

- Update an existing module doc only when its contract changes; one short README line per feature.
- No new `docs/<FEATURE>.md` unless the task asks. Don't edit `docs/playtest.md` unless asked.

## Mobile (frozen until pre-release)

- Don't break touch controls or small-screen layouts, but don't design, tune or test specifically
  for mobile. Opt-in checks: `npm run test:e2e:extended`.

## PR description

- What changed (bullets); gameplay / balance changes called out; test results (one line); known
  limitations. Template: `.github/pull_request_template.md`.
