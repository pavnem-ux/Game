# Task 08.5 — progress

Spec: [task-08.5.md](task-08.5.md) (owner's text, Prettier-formatted). Code map: reuse
[task-08-progress.md](task-08-progress.md#code-map) (additions below).

Current: Phase 4 done — waiting for "continue" (next: Phase 5, step 5.1)

Branch `task-08.5-playtest` from `task-08-campaign` (Task 08, PR #4). Draft PR targets
`task-08-campaign` so its diff shows only Task 08.5; retarget after PR #3/#4 are merged.

## Steps

### Phase 0 — Setup

- [x] 0.1 Branch, progress file, draft PR

### Phase 1 — Debug speed

- [x] 1.1 Time scale ×1/×2/×4/×8 on simulation time (same logic, same event order)
- [x] 1.2 God mode (no damage taken) + "kill all on screen" (normal deaths, drops, kill counts)
- [x] Tests: scheduled events fire once and in order at ×8; kill-all updates run stats

### Phase 2 — Run statistics

- [x] 2.1 Run stats collector from existing combat events
- [x] 2.2 Results screen stats panel
- [x] 2.3 Debug overlay: live DPS (5 s) + total damage per source
- [x] Tests: totals match damage events; stats reset between runs; summary in recentRuns

### Phase 3 — Bug reporting

- [x] 3.1 Build version label on main menu + pause (build-time injection)
- [x] 3.2 Error boundary + global handlers, last 5 errors in a separate key
- [x] 3.3 «Сообщить о проблеме» report download (pause + results)
- [x] 3.4 Debug: load a report → import its save (validated import)
- [x] Tests: report fields; crash path leaves save intact

### Phase 4 — Reproducibility

- [x] 4.1 Seeded RNG for gameplay randomness (audit; record anything not converted)
- [x] 4.2 Per-run seed: overlay, results, reports; debug start with a seed
- [x] Tests: same seed + inputs → identical spawn/card sequence for 2 min

### Phase 5 — Game feel

- [ ] 5.1 Floating damage numbers (crit style), pooled, capped
- [ ] 5.2 Enemy hit flash; player damage red vignette/flash
- [ ] 5.3 Screen shake (player damage, boss heavy attacks) + «Тряска экрана» setting
- [ ] Check: FPS with max enemies on Map 10 (debug overlay)

### Phase 6 — Playtest kit & delivery

- [ ] 6.1 `docs/playtest.md` (Russian)
- [ ] 6.2 Full regression + production build; no debug in production
- [ ] 6.3 PR description; mark ready (don't merge)

## Code map (Task 08.5 additions)

- 1.1 `src/engine/time-scale.ts` (`DEBUG_TIME_SCALES`, `frameStep`), scene `time-scale` command
  (presets only), `AlphaState.timeScale` (DEV/QA), panel group «Ускорение забега» ×1/×2/×4/×8;
  tests `tests/engine/time-scale.test.ts`.
- 1.2 `GameplayWorld.debugKillInView(view?)` (shared `killEnemies` with `clearEnemies`), testing
  action `kill-in-view`, scene command `kill-on-screen` (camera `worldView`), panel button
  «Убить всех на экране»; God Mode = existing `QaGameplayWorld.setGodMode` (panel toggle, all
  DEV/QA worlds incl. campaign); tests `tests/campaign/debug-speed.test.ts`.
- 2.1 `src/gameplay/run-stats.ts` (`RunStats`, `RunStatsSnapshot`), fed by `GameplayWorld.record`
  (combat/weapon/progression channels), snapshot `runStats`; attribution in `SkillEngine`
  (`attackSource`, `currentSource`/`setSource`, `withSource` around activations, zones,
  scheduled actions, projectiles, passives) and `SynergyResolver.announce`; tests
  `tests/gameplay/run-stats.test.ts`.
- 2.2 `src/gameplay-ui/RunStatsPanel.tsx` (results), `src/gameplay-ui/strings-ru.ts` (new 08.5
  text, `damageSourceLabel`, `enemyTypeLabel`), `summarizeRunStats` in `campaign-state.ts`;
  persisted summary `RunStatsSummary` + `validateRunStatsSummary` (`src/profile/rewards.ts`),
  optional `RunResult.stats` / `RecentRun.stats`, parsed in `saveSchema.recentRun`; tests
  `tests/profile/run-stats-summary.test.ts`, results panel in `tests/campaign-browser.mjs`.
- 2.3 `src/gameplay-ui/DebugOverlay.tsx` (lazy, DEV/QA, shown with `?debug` during a run;
  collapsible), debug-only text `src/gameplay-ui/strings-ru-debug.ts`; Phase 4 (seed) and
  Phase 5 (FPS) extend this overlay. Browser check in `tests/campaign-browser.mjs`; production
  markers in `tests/alpha-production.mjs`.
- 3.1 `config/build-info.mjs` (+ `.d.mts`) → Vite/Vitest `define` `__APP_VERSION__`,
  `__APP_COMMIT__` (`src/build-env.d.ts`); `src/gameplay-ui/BuildLabel.tsx` on the main menu
  (`CampaignMenu`) and pause (`PauseDialog`); tests `tests/build-info.test.mjs` (in
  `test:build-policy`), browser/production label checks.
- 3.2 `src/gameplay-ui/error-log.ts` (key `skazki.errors`, last 5), `crash-state.ts`
  (`crashState.report/recover`, `installGlobalErrorHandlers`), `CrashGuard.tsx` (error
  boundary + crash screen, wraps `AlphaApp` in `src/main.tsx`; prototype untouched),
  `alphaBridge.reset`, `campaignStore.discardActiveRun`; DEV panel «Сымитировать сбой»; tests
  `tests/persistence/crash-safety.test.ts`, crash path in `tests/campaign-browser.mjs`.
- 3.3 `src/gameplay-ui/bug-report.ts` (`buildBugReport`, `reportFilename`, format
  `skazki-report` v1), `campaignStore.downloadReport` (+ shared `downloadJson`),
  `ReportButton.tsx` on pause, results and crash screens; snapshot `seed`; tests
  `tests/persistence/bug-report.test.ts`, pause download in `tests/campaign-browser.mjs`,
  production presence in `tests/alpha-production.mjs`.
- 3.4 `saveFromReport` + `campaignDebug.stageReport` (`campaign-debug.ts`), DEV panel file input
  «Загрузить отчёт → импорт сохранения»; tests `tests/persistence/report-import.test.ts`,
  download → load → confirm round-trip in `tests/campaign-browser.mjs`.
- 4.1 `src/gameplay/rng.ts` (`createRunRandom` → `combat` / `skills` / `spawn` streams,
  `DEFAULT_SEED`, `validateSeed`, `lcgStream`), used by `GameplayWorld`; golden test
  `tests/gameplay/rng.test.ts`.
- 4.2 `generateRunSeed` + `startRun(mapId, class, seed?)` (`campaign-state.ts`), seed on the
  results screen (`RU.seed`) and in the debug overlay; DEV «Сид» + «Начать выбранную карту с
  этим сидом» (`campaignDebug.startWithSeed`); reports already carry `run.seed` (3.3). Tests
  `tests/gameplay/reproducibility.test.ts`, `tests/persistence/run-seed.test.ts`, browser checks.

- Existing pieces this task builds on (from Task 07.x/08):
  - Time scale: `AlphaScene.timeScale` + `time-scale` command (DEV/QA, 1–20, multiplies the
    frame delta of the same `GameplayWorld.update`) — 1.1 restricts/presets it to ×1/2/4/8.
  - God Mode: `src/gameplay/qa.ts` `QaGameplayWorld.godMode` (blocks only player HP loss via a
    Combat Core policy), QA panel toggle — 1.2 exposes it under `/?debug`.
  - `clear-enemies` testing action (`src/gameplay/testing.ts`) — check it uses normal deaths.
  - Seeded RNG: Combat Core RNG + separate spawn RNG already (AGENTS.md §4.5); `seed` option in
    `GameplayOptions`. 4.1 is an audit + gap fixes, not a rewrite.
  - World events `getEvents()` (bounded 160) — the stats collector must consume events per
    frame (or a dedicated listener), never rely on the bounded history.
  - Recent runs: `src/profile/profile.ts` `RecentRun`; schema `src/persistence/saveSchema.ts`.

## Decisions / deviations

- `docs/task-08.5.md` is the owner's spec verbatim, Prettier-formatted (whitespace only) for CI.
- Rule 5 mentions "the existing localization file": the alpha has none — Russian strings are
  inline in components, plus `src/gameplay-ui/save-messages.ts`. Proposal: new Task 08.5 player
  text goes into one new module `src/gameplay-ui/strings-ru.ts`; existing strings stay where they
  are (no unrequested refactor). Owner may redirect.

- 1.1: the scale multiplies the capped frame step (0.05 s × scale), so ×8 = 8× fewer, larger
  `GameplayWorld.update` calls through the same boundaries. Scheduled campaign events fire once,
  in order, at the same instants (up to float accumulation: ×1 may log 239.99999999999997 for
  240). Pre-existing and unchanged: enemy steering is sampled per update, so individual contact
  times/positions differ by a few ms between frame sizes (the same happens with real FPS jitter);
  rewards/deadlines are unaffected. Replaced the Task 08 1–20 slider (owner's ×1/2/4/8 spec).

- 1.2: kill-all kills through Combat Core (periodic damage, MAX_SAFE_INTEGER), so deaths,
  crystals, kill counts, elite/boss kills and boss-defeated are the normal deduplicated ones. The
  run-stats part of the test covers the existing run counters (kills, elite/boss kills,
  rewards); the Phase 2 collector gets its own kill-all test. God Mode was already present
  (Task 07.2) and is reused unchanged. Like `clearEnemies`, the world method itself ships in the
  production bundle but is unreachable there (no controller/UI); `test:production` checks the
  controller/UI markers.

- 2.1: Combat events carry only an attack id, so attribution is additive metadata: the skill
  engine tags each attack snapshot it creates with the executing skill/synergy (`skill:<id>`,
  `synergy:<id>`); zones, delayed actions and projectiles inherit their creator's tag; a
  synergy tags everything it creates after announcing itself. Basic weapon hits are matched via
  the weapon `impact` event (`weapon:<id>`). DoT ticks are split by each stack's raw damage and
  attributed to the stack's origin (weapon/skill/synergy); unlabelled skill statuses now carry
  the executing skill as `originId` (metadata only — no rule reads it except the existing
  "synergy-applied stacks never proc" check, which is unchanged for synergy stacks). Damage =
  Core `appliedDamage` (actual HP lost). Debug kills/HP cuts → source `debug`. Multipliers from
  buffs/marks count towards the hit's own source. Enemy types: melee, ranged, elite-melee,
  elite-ranged, boss (boss summons count as melee/ranged). Low HP = a drop below 20% Max HP
  while alive, counted once until HP is back at ≥ 20%. DPS = damage in the last 5 s (0.25 s
  buckets) / 5 (or elapsed time in the first 5 s). Bounded: 512 recent weapon attacks, 1024
  known enemies, 1024 attack tags, 100 timeline entries, 50 low-HP times.

- 2.2: persisted summary = damage dealt/taken (whole numbers), top 3 sources, death time,
  revive used, low-HP moments — added as an optional field on each recent run. Schema version
  stays 1: the field is additive and optional, older saves load unchanged, and older builds drop
  unknown fields (the documented parser rule), so no migration is needed. Invalid summaries are
  rejected (never repaired), like every other field. The results screen shows the full
  in-memory stats of the current run (top 5 sources with share, damage taken + worst enemy type,
  death time, revive, low-HP moments). `.results-panel` got `max-height` + scroll so the longer
  panel fits small screens.

- 2.3: debug-only labels live in `strings-ru-debug.ts` (imported only by lazy DEV/QA chunks) so
  they never reach the production bundle; player-facing 08.5 text stays in `strings-ru.ts`.

- 3.1: commit = Workers Builds `WORKERS_CI_COMMIT_SHA` → `GITHUB_SHA` → local `git rev-parse`
  → `unknown` (the label never fails a build). Version = `package.json` (`0.1.0`, unchanged).

- 3.2: on any crash (render error, uncaught error, unhandled rejection) the active run is
  discarded with NO save write — not even the usual «abandoned» record — so the save stays
  byte-identical (verified in unit + browser tests). The crash screen unmounts the game;
  «Вернуться в меню» remounts a fresh app/Phaser game. Error entries: time, source, message
  (≤ 500 chars), stack (≤ 2000), build label; never throws, even with failing storage.
- 3.2 fix (Task 08 bug found by the crash test): after the debug progress reset or an import that
  locks the selected map, «Начать забег» silently did nothing. The UI selection now falls back to
  the highest unlocked map whenever the profile changes (`tests/persistence/campaign-selection`).

- 3.3: report = format/version, createdAt, build {version, commit, label}, user agent, run
  {runId, seed, map id/name, class, permanent/run level, simulation time, status, screen,
  kills, full in-memory run stats} (null outside a run), last ≤ 5 errors, and the save — only
  after the normal save validation (`parseProfile`), else `{ok:false, error}`. File name uses UTC
  like the save export. The button is a player feature (present in production). Also on the crash
  screen, whose text points players to it. `GameplaySnapshot.seed` (additive) = the run's base
  seed (`options.seed`, default 1337 until Phase 4.2 generates per-run seeds).

- 3.4: only the report envelope is checked by the debug tool (format `skazki-report`,
  `save.ok`); the embedded save then goes through the normal `prepareImport` validation and the
  same confirm/cancel step on the Settings page. A tampered or invalid save is rejected and the
  current save stays unchanged.

- 4.1 audit (gameplay randomness → seeded stream):
  - spawn positions/angles → `spawn`; Combat Core crit/Dodge and status application chances →
    `combat` (the world injects it into Core and Status Effects); level-up offers, rerolls and
    skill procs → `skills`.
  - No randomness needed: enemy kind choice (fixed ranged share sequence), XP crystal drops
    (deterministic amounts/positions), elite schedule, boss ability choice (fixed rotation with
    cooldowns), enemy AI decisions.
  - Not converted, by design: the legacy prototype (`/?prototype`, `src/engine/systems/*`, not
    part of the alpha); UI identifiers (run id, profile id, debug profile id) — they never
    affect gameplay; default `Math.random` fallbacks in standalone `CombatCore`/`StatusEffects`
    constructors (the world always injects its seeded streams). No visual-only randomness exists
    in `AlphaScene`.
  - The extracted formulas are byte-identical to the previous inline ones (golden test for 10
    seeds × 3 streams × 500 draws), so every existing seed reproduces the same run.

- 4.2: before 08.5 every campaign run used the default seed 1337 (identical spawn patterns and
  card offers each time). Now the UI generates a fresh 32-bit seed per run with the browser
  CSPRNG (outside the simulation); the simulation stays fully deterministic for a given seed.
  This is the only player-visible change of Phase 4 (variety between runs), required by the
  spec. The seed is not persisted in the save (it is in the report and on the results screen).
  Reproducibility test: 2 classes/maps × 120 s with normal waves, scripted input and fixed card
  choices; identical spawn positions/times, elite spawns, card offers and kill counts.

## Blockers / known issues

- Cloudflare Preview cannot be opened by the agent (`*.workers.dev`).
