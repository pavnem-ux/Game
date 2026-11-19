# Task 29 — progress

Spec: [task-29-lean-workflow.md](task-29-lean-workflow.md) (owner's file, kept verbatim). Branch
`task-29-lean` from the latest `main` (Task 28 merged). No gameplay or balance changes.

PR: https://github.com/pavnem-ux/Game/pull/27

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR
- [x] 1 `docs/TASK_WORKFLOW.md`
- [x] 2.1 `docs/CODEMAP.md`
- [x] 2.2 AGENTS.md / CLAUDE.md point to the workflow; mobile freeze line
- [x] 2.3 Default e2e / CI: desktop core flows only; mobile and screenshot specs opt-in
- [x] 2.4 Short PR template
- [x] 3 Delivery: final checks once, PR

## Decisions / blockers

- 2.3: mixed suites keep their phone sections behind `E2E_EXTENDED=1` (`tests/e2e-options.mjs`)
  instead of being split into new files; default e2e writes no screenshots.
- 2.3: moved to `npm run test:e2e:extended`: `tests/mobile-browser.mjs`, `tests/english-screens.mjs`,
  and the phone parts of `browser`, `alpha-browser`, `campaign-browser`, `activities-browser`,
  `art-browser`. Default and extended runs both pass locally.
