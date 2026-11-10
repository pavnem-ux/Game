# Task 08 — Playable Campaign Alpha (10 maps, bosses, progression, saves)

Repo: pavnem-ux/Game. Spec + phased plan. Progress lives in `docs/task-08-progress.md`.

---

## 0. Working rules (read first, every session)

1. At session start: read this file and `docs/task-08-progress.md`, run `git status` and
   `git log --oneline -5`. Continue from the first unchecked step. Don't redo checked steps.
2. If the working tree has uncommitted changes from an interrupted session: inspect them,
   finish or revert that step, then continue.
3. Work one step at a time. After each step: run the relevant tests, commit
   (`task08: <phase>.<step> <summary>`), push, tick the step in the progress file.
   Small commits are the checkpoint system — the session may end at any moment.
4. Use the "Code map" in the progress file instead of re-exploring the repo. Update it when
   you create or find important files.
5. Record decisions, deviations and blockers in the progress file (one line each).
6. At the end of a phase: run the full test suite, update the progress file, reply with a
   short report (≤10 lines: done, tests, issues). Stop and wait for "continue".
7. Extend, don't rewrite. Preserve and reuse: combat core, Character Stats (levels 1–50),
   weapon attacks, enemy AI, status effects, survival/revival, XP crystals, wave spawning,
   Task 07 skills/cards/synergies, React/Phaser UI, `/?debug` tools, GameplayWorld events.
8. Don't paste large files or logs into replies. Priority: correct state and persistence
   over visuals.

---

## 1. Spec (reference for all phases)

### 1.1 Campaign

- 10 maps, playable by Warrior/Mage/Archer/Rogue. Map 1 unlocked; victory unlocks the
  next; unlocked maps stay replayable. Unlocks shared across classes; XP/levels per class.
- Map i (1–10): duration [10,10,11,11,12,12,13,13,14,15] min; victory XP = 100+50i;
  Gold = XP/2.
- Same arena/assets for all maps. Vary enemy stats, spawn rate, waves, elites, boss.
- Difficulty (k = i−1): enemy HP ×(1+0.12k), dmg ×(1+0.08k), spawn rate ×(1+0.08k);
  elites get extra ×2.5 HP, ×1.4 dmg. Preliminary; respect existing formulas/caps.
  Per-map enemy overrides allowed. All balance values in one central config file.

### 1.2 Run flow

- Simulation time only; frozen during pause, level-up choice, revive prompt.
- 5 stages (opening, escalation, midgame, late, boss phase), boundaries relative to duration.
- Elite every 2:00 strictly before map end; at 10:00 the boss replaces the elite.
  Elite profiles: aggressive melee, ranged. Distinct look, name + HP bar, extra run XP.
  Each scheduled event fires exactly once (pause/resume, large time steps).
- Boss: spawns once at 10:00 with notification, own HP bar, ≥2 abilities with cooldowns,
  telegraphs on dangerous attacks, anti-stunlock/CC limits, death event.
  Ability library: radial projectile burst, telegraphed circular AoE, charge/dash,
  temporary speed buff, summon adds. 10 boss configs = distinct combos/params.
- Victory = boss dead AND duration reached, either order. After duration: no new
  waves/elites; existing enemies and boss keep acting. Victory/defeat resolve exactly once.
- Revival unchanged (1/run, 50% HP, 3s invulnerability, cleanse). Death without revive =
  defeat; defeat never unlocks. Clear transitions: pause/restart/quit/revive/victory/defeat.
- No mid-run saves: reload/quit during a run abandons it (no rewards); player returns to
  the main menu. Tell the player this in the UI.

### 1.3 Rewards & progression

- Victory: full map XP to the selected class, Gold to the profile.
  Defeat: floor(reward × 0.25 × min(elapsed/duration, 1)) each. Abandoned: nothing.
  Run XP never converts to permanent XP.
- Unique run ID; rewards applied exactly once (results revisits, repeated events, reload).
- Level L→L+1 costs 100+50(L−1) XP; overflow carries across levels; cap 50 (extra XP goes
  to a lifetime counter). Levels feed only the existing stat calculation.
- Talent points derived from level by one function, never stored as a counter:
  +1 per even level, +1 bonus at 30, max 26. No spending yet.
- Progression logic is pure (no storage, no UI imports).

### 1.4 Persistence

- localStorage only. No cloud/accounts/backend. All access through a `saveStore`
  module (`load()`/`save()`), so a cloud adapter can replace it later.
- Whole profile = one JSON under one key. Before each write, copy the previous valid
  snapshot to a backup key.
- Profile (stable IDs): schemaVersion, profileId, createdAt, lastSavedAt, selectedClass,
  classes{warrior,mage,archer,rogue: {xp, level, lifetimeXp, talentsSpent: 0}}, gold,
  highestUnlockedMap, completedMaps, bestResults per map, stats{runs, wins, defeats,
  enemiesKilled, bestSurvivalTime}, recentRuns (max 20), processedRunIds (max 50).
  Never store derived values (combat stats, talent points).
- `saveSchema` module: validate() + migrations map keyed by version (empty; v1 current).
  New fields get defaults; never reset a profile because a field was added.
- Autosave after every permanent change. A run's rewards, level-ups, unlocks, stats and
  runId are applied to a copy and committed as one snapshot. Never autosave per frame.
- Missing save → new profile. Unreadable/invalid/newer-version save → don't overwrite,
  try backup, else show error and keep original data untouched.
- Write failure (quota/unavailable): keep in-memory state, show visible warning; never
  claim rewards were saved.
- Export: validated profile → JSON download `skazki-save-YYYY-MM-DD.json`. Read-only.
- Import: parse → validate → migrate → confirm (offer to export current first) → replace.
  Any failure leaves the current save unchanged. Imported data is data only.
- Reset progression: dev tools only.

### 1.5 UI

- Main menu: Play, Character, Maps, Progression, Settings (existing options + Save
  Management), Gold shown.
- Character: per class name, level, XP/next, key stats, talent points, starting weapon.
- Maps: number/name, duration, difficulty, lock state, rewards, best result, boss name
  if unlocked. Locked maps can't be started.
- Progression: class, level, XP bar, talent points, Gold, campaign progress, recent runs,
  non-functional "Talents / Equipment — Coming Soon" placeholders.
- Results: victory/defeat, map, class, time, kills, elite kills, boss killed, run level,
  XP, Gold, levels and talent points gained, newly unlocked map. Buttons: Menu, Replay.
- HUD additions: map name, time left, stage, boss countdown, elite alert, boss HP bar,
  run level/XP (visibly distinct from permanent level). Task 07 skill UI keeps working.
- Save Management: Export, Import, last save time, save status, warning that clearing
  browser data deletes progress. Friendly messages, no stack traces.

### 1.6 Architecture

Separate modules: campaign config, map unlocks, run timer/objectives, elite/boss
scheduler, boss abilities, rewards, class XP, Gold, saveStore, saveSchema, campaign UI
state. No reward/save/scheduling logic in UI components. Deterministic scheduling.
No backend, login, or paid services.

---

## 2. Phases

### Phase 0 — Setup

- 0.1 Confirm the latest branch contains Task 07.2 (if not: record blocker, stop).
  Create branch `task-08-campaign`.
- 0.2 Create `docs/task-08-progress.md` from the template in section 3. Fill the Code map:
  where combat, stats, enemies, spawning, skills, UI, debug, existing storage and tests
  live; test and build commands.
- 0.3 Commit, push, open a **draft** PR "Task 08: Campaign Alpha".

### Phase 1 — Campaign core

- 1.1 Central campaign/balance config (10 maps, difficulty, stages, elites, boss refs).
- 1.2 Run timer on simulation time + stages + wave scaling via existing spawner.
- 1.3 Event scheduler: elites every 2:00, boss at 10:00, exactly-once (boss may be a
  scaled placeholder enemy for now).
- 1.4 Run state machine: victory/defeat/abandon rules, exactly-once resolution.
- Tests: config (10 maps, durations, scaling); elite times; single boss; no duplicates
  after pause/large steps; time frozen during pause/skill choice; victory incl. early
  boss kill on long maps; duration reached with boss alive.

### Phase 2 — Elites & bosses

- 2.1 Elite profiles (melee, ranged): visuals, name/HP bar, extra XP.
- 2.2 Boss ability library (5 abilities) with telegraphs and cooldowns.
- 2.3 10 boss configs, boss HP bar, spawn notification, CC limits, death event.
- Tests: each ability triggers and respects cooldown; boss death fires once; CC limits.

### Phase 3 — Progression logic (pure)

- 3.1 Reward calculation (victory/defeat/abandon).
- 3.2 Class XP, overflow, cap 50, lifetime XP; talent points function.
- 3.3 applyRunResult(profile, result) → new profile: rewards, levels, unlocks, stats,
  recent runs, runId dedup. Pure and idempotent.
- Tests: reward math; abandoned = 0; exactly-once; per-class levels; shared Gold; cap;
  overflow; talent points at even levels, +1 at 30, 26 at 50; win unlocks, defeat doesn't.

### Phase 4 — Save system

- 4.1 saveSchema: defaults, validate, migrations map.
- 4.2 saveStore: load/save, backup key, error handling (malformed, newer version,
  quota, unavailable).
- 4.3 Wire autosave into progression (one snapshot per change); failure warning state.
- 4.4 Export/import logic.
- Tests: first launch; save/reload roundtrip; no duplicate rewards after reload;
  export/import roundtrip; invalid JSON/values/newer version leave save intact;
  migration stub; write failure; backup recovery.

### Phase 5 — UI

- 5.1 Main menu + navigation + Gold.
- 5.2 Character and Map selection.
- 5.3 Results screen (wired to applyRunResult) + Progression screen.
- 5.4 HUD additions.
- 5.5 Save Management screen + save-failure warning + mid-run-forfeit notice.

### Phase 6 — Debug, verification, delivery

- 6.1 `/?debug` (absent in production): unlock/select maps, set class level, grant
  XP/Gold, jump to next elite, spawn boss, cut boss HP, force victory/defeat via the
  normal results pipeline, inspect save, reset test progress, accelerated run mode
  using the same simulation logic.
- 6.2 Full regression (combat/AI/status/weapons/survival/Task 07) + production build.
- 6.3 Walk through the manual test path below (logic-level where a browser isn't
  available); record results.
- 6.4 PR description: summary, changed files, architecture, balance config location,
  test/build results, how to playtest, known limitations. Mark PR ready. Don't merge.

### Manual test path (Definition of Done)

New profile → pick class → Map 1 → fight, pick skills, unlock synergies → elites →
boss at 10:00 → win → see XP/Gold/levels → Map 2 unlocked → restart browser → progress
intact → Map 2 with another class (separate XP, shared Gold) → export save, import it
back. Map 10 must be completable. Works without debug tools.

---

## 3. Progress file template (`docs/task-08-progress.md`)

```
# Task 08 progress
Branch: task-08-campaign | PR: <link>
Current: Phase X, step X.Y

## Steps
- [ ] 0.1 … (copy all step IDs from task-08.md)

## Code map
- Test command: …  Build command: …
- Combat: …
- …

## Decisions / deviations
-

## Blockers / known issues
-
```
