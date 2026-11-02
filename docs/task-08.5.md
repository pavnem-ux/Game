# Task 08.5 — Playtest Readiness

Repo: pavnem-ux/Game. Builds on completed Task 08. Progress: `docs/task-08.5-progress.md`.
Goal: make manual playtesting fast, reproducible and data-driven. No new gameplay content.

## Rules

1. Session start: read this file + progress file, `git status`, `git log --oneline -5`.
   Continue from the first unchecked step; resolve uncommitted leftovers first.
2. Per step: test → commit `task08.5: <step> <summary>` → push → tick in progress file.
3. End of phase: full test suite, ≤10-line report, stop until "continue".
4. Reuse Task 08 code map (`docs/task-08-progress.md`); don't re-explore the repo.
5. Player-facing text in Russian, in the existing localization file. Code/commits: English.
6. All debug features only under `/?debug`, absent from production builds.
7. Don't change gameplay balance or save schema semantics (additive fields only, with
   migration if the schema changes).

## Phase 0 — Setup

- 0.1 Branch `task-08.5-playtest` from the Task 08 branch. Create progress file
  (steps checklist, decisions, blockers). Open draft PR.

## Phase 1 — Debug speed

- 1.1 Time scale x1/x2/x4/x8 applied to simulation time (same logic, same event order).
- 1.2 God mode (no damage taken) and "kill all on screen" (normal death events, drops
  and kill counts).
- Tests: scheduled events fire once and in order at x8; kill-all updates run stats.

## Phase 2 — Run statistics

- 2.1 Run stats collector via existing combat events: damage dealt per source
  (weapon/skill/synergy id), damage taken per enemy type, kills by type, elite/boss
  kills, run level timeline, time of death, revive used, low-HP moments (<20% HP).
- 2.2 Results screen: compact stats panel (top damage sources, damage taken, death time).
- 2.3 Debug overlay: live DPS (5s window) and total damage per source.
- Keep stats in memory per run; persist only a summary in recentRuns (additive field).
- Tests: totals match emitted damage events; stats reset between runs.

## Phase 3 — Bug reporting

- 3.1 Build version label (`v<package version> · <short commit>`) on main menu and
  pause screen. Inject at build time.
- 3.2 Error boundary + global error handlers: friendly Russian message, "Return to menu"
  button, last 5 errors kept in a separate localStorage key (never touches the save).
  Crash must not corrupt or overwrite the save.
- 3.3 "Сообщить о проблеме" button (pause + results screens): downloads
  `skazki-report-YYYY-MM-DD-HHMM.json` with version, seed, map, class, run time,
  current run stats, recent errors, validated save export, browser user agent.
- 3.4 Debug: load a report file → import its save (through the normal validated import).
- Tests: report contains all fields; crash path leaves save intact.

## Phase 4 — Reproducibility

- 4.1 Seeded RNG module. Route gameplay randomness through it: spawns, enemy choices,
  drops, level-up card offers, boss ability choice. Visual-only randomness may stay
  unseeded. If a system is too invasive to convert, record it in the progress file.
- 4.2 Seed generated per run, shown in debug overlay and results, included in reports.
  Debug: start a run with a given seed.
- Tests: same seed + same inputs → identical spawn/card sequence for the first 2 min.

## Phase 5 — Game feel

- 5.1 Floating damage numbers (crit styled differently), pooled, capped on screen.
- 5.2 Hit flash on enemies; red vignette/flash when the player takes damage.
- 5.3 Light screen shake on player damage and boss heavy attacks. Settings toggle
  "Тряска экрана" (on by default), saved in settings.
- Check: no FPS drop with max enemies on Map 10 (verify via debug overlay FPS).

## Phase 6 — Playtest kit & delivery

- 6.1 `docs/playtest.md` (Russian): setup, Definition of Done path from Task 08 as a
  checkbox list, per-class and per-map checks, how to send a report file, what to note
  (fun, difficulty, confusing moments).
- 6.2 Full regression + production build; confirm no debug features in production.
- 6.3 PR description: summary, changed files, test/build results, known limitations.
  Mark ready. Don't merge.
