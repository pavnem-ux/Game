# Task 29 — Lean Workflow + Mobile Freeze

Repo: pavnem-ux/Game. Base: latest `main`. Branch `task-29-lean`. Progress: `docs/task-29-progress.md`.
Owner decisions in this task: lighter verification (the owner tests manually), mobile frozen until pre-release.
No gameplay or balance changes.

## Rules
1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from the first
   unchecked step; resolve uncommitted leftovers first.
2. Per step: commit `Task 29: <step> <summary>` → push → tick in progress file. Phases back-to-back.
3. Follow AGENTS.md (PR to `main`, never merge). No screenshots. Don't paste logs into replies.

## Phase 1 — `docs/TASK_WORKFLOW.md` (new, ≤ 60 lines)
Write it with these rules; future tasks will only say «Follow docs/TASK_WORKFLOW.md»:
- **Session:** read the task file, its progress file (`docs/task-NN-progress.md`), `docs/CODEMAP.md`,
  `git status`, `git log --oneline -5`; continue from the first unchecked step; resolve uncommitted leftovers.
  Don't re-explore the repo — use CODEMAP and update it when you add or move important files.
- **Branch/PR:** branch from latest `main` named in the task; draft PR to `main` at the start; never merge.
- **Steps:** one step → targeted test (only the affected suite) → commit `Task NN: <step> <summary>` → push →
  tick the step. Phases run back-to-back; stop only on a blocker or when done.
- **Progress file:** step checklist + one-line decisions/blockers. Nothing else.
- **Verification (owner tests manually):**
  - Unit tests only for logic: gameplay rules, formulas, rewards, saves, determinism. 1–3 focused tests per
    behaviour. No tests for pure layout/visual/text changes.
  - e2e: add or update only when a core flow changes (start run, level-up offer, run end, save/load, shop
    purchase). Desktop viewport only. CI runs e2e — locally only to fix a CI failure.
  - Before the final push: `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build` once.
    `npm run test:production` only if build/DEV gating/`main.tsx` changed.
  - No screenshots, FPS tables or measurement reports unless the task asks.
  - Report results as one line per command (pass/fail + count). Never paste logs.
- **Docs:** update an existing module doc only when its contract changes; one short README line per feature.
  No new `docs/<FEATURE>.md` unless the task asks. Don't edit `docs/playtest.md` unless asked.
- **Mobile (frozen until pre-release):** don't break touch controls or small-screen layouts, but don't design,
  tune or test specifically for mobile.
- **PR description:** what changed (bullets), gameplay/balance changes called out, test results (one line),
  known limitations.

## Phase 2 — Repository updates
- 2.1 `docs/CODEMAP.md` (≤ 150 lines): merge the code maps from all `docs/task-*-progress.md` into one current
  map — modules, key files, main entry points/APIs, config files, test commands. Verify paths exist.
- 2.2 AGENTS.md: §6 and §7 point to `docs/TASK_WORKFLOW.md` for verification and docs scope (keep the rules
  «never skip, disable or weaken a test to get green» and «bug fixes include a regression test»); add the mobile
  freeze line; keep §4 invariants unchanged. CLAUDE.md: add «Follow docs/TASK_WORKFLOW.md».
- 2.3 Test suites (no logic coverage lost):
  - move mobile-viewport e2e specs and any screenshot/FPS-capture scripts out of the default `npm run test:e2e`
    and CI into an opt-in script `npm run test:e2e:extended` (keep the files);
  - remove screenshot writing from default e2e runs;
  - keep all unit/integration tests and desktop e2e for core flows. List moved specs in the PR.
- 2.4 Update `.github/pull_request_template.md` to the short PR description format above.

## Phase 3 — Delivery
Final checks once (as in TASK_WORKFLOW), PR with the short template. Don't merge.
