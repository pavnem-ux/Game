# Task 08 progress

Branch: task-08-campaign | PR: https://github.com/pavnem-ux/Game/pull/4 (draft)
Current: Phase 6, step 6.4 (6.3 done)

## Steps

- [x] 0.1 Confirm latest branch contains Task 07.2; create branch `task-08-campaign`
- [x] 0.2 Create this progress file; fill the Code map
- [x] 0.3 Commit, push, open draft PR "Task 08: Campaign Alpha"
- [x] 1.1 Central campaign/balance config (10 maps, difficulty, stages, elites, boss refs)
- [x] 1.2 Run timer on simulation time + stages + wave scaling via existing spawner
- [x] 1.3 Event scheduler: elites every 2:00, boss at 10:00, exactly-once
- [x] 1.4 Run state machine: victory/defeat/abandon, exactly-once resolution
- [x] 2.1 Elite profiles (melee, ranged): visuals, name/HP bar, extra XP
- [x] 2.2 Boss ability library (5 abilities) with telegraphs and cooldowns
- [x] 2.3 10 boss configs, boss HP bar, spawn notification, CC limits, death event
- [x] 3.1 Reward calculation (victory/defeat/abandon)
- [x] 3.2 Class XP, overflow, cap 50, lifetime XP; talent points function
- [x] 3.3 applyRunResult(profile, result) → new profile (pure, idempotent)
- [x] 4.1 saveSchema: defaults, validate, migrations map
- [x] 4.2 saveStore: load/save, backup key, error handling
- [x] 4.3 Wire autosave into progression; failure warning state
- [x] 4.4 Export/import logic
- [x] 5.1 Main menu + navigation + Gold
- [x] 5.2 Character and Map selection
- [x] 5.3 Results screen (wired to applyRunResult) + Progression screen
- [x] 5.4 HUD additions
- [x] 5.5 Save Management screen + save-failure warning + mid-run-forfeit notice
- [x] 6.1 `/?debug` tools (absent in production)
- [x] 6.2 Full regression + production build
- [x] 6.3 Manual test path walkthrough; record results
- [ ] 6.4 PR description; mark PR ready (don't merge)

## Code map

- Campaign (Task 08): `src/campaign/` — `config.ts` (CAMPAIGN_BALANCE: durations, difficulty,
  stages, elite/boss, rewards, reserved slots; CAMPAIGN_MAPS 1–10 with boss refs;
  startup `validateCampaignConfig`); `timer.ts` (pure `stageAt`/`runClock` on simulation time,
  `campaignSpawning`, `scaleEnemyStats`). World hook: `GameplayOptions.campaign {mapId}` →
  `GameplayWorld.campaignMap`, scaled `enemyStats`, spawner settings, snapshot `campaign`.
  `schedule.ts` (`campaignSchedule`, `CampaignDirector` exactly-once with `firedLog`); world
  boundary kind `campaign` (rank 9.5, after reinforcements) → `resolveCampaignEvent`,
  `spawnScheduled`; events on channel `campaign` (`elite-spawned`, `boss-spawned`, `duration-reached`).
  `run-state.ts` pure `reduceRun` (victory/defeat/abandoned, first wins) → world `campaignInput`,
  `abandonRun()`, `run-resolved` event (outcome, runId from `options.campaign.runId`, elapsed
  capped at duration); world freezes (`paused`) once resolved.
  `elites.ts` (`eliteEnemyConfig` from existing melee/ranged profiles, `eliteProfile` name +
  extraXp; definitions in `CAMPAIGN_BALANCE.elite.definitions`). Snapshot `campaign.elites`;
  scene draws aura, scaled body, wide HP bar and pooled name tags (`AlphaScene.nameLabels`).
  `boss-abilities.ts` (`BossController` boundary module: telegraph → execute → cooldown, global
  gap, effects; 5 kinds; `validateBossAbilities`). World: `bossHost` (Core + `hostilePolicies`,
  EnemyAI `launchProjectile`/`setSpeedBoost`), boundary kind `boss` rank 6.5, snapshot
  `bossCast`/`bossEffects`; scene telegraphs. EnemyAI additive APIs: `setSpeedBoost`,
  `launchProjectile`, snapshot `speedBoost`; `movement.ts` `futureCrossings`.
  `bosses.ts` (`BOSS_DEFINITIONS` ×10 keyed by map `bossId`: behaviour, HP/dmg/size/speed,
  xpReward, CC limits, abilities; `validateBossDefinitions`). World: boss spawned from its
  definition, `boss-defeated` event once, snapshot `campaign.boss` (HP bar data); SkillEngine
  optional host hook `controlLimits` (boss-only Slow cap / stun scale / immunity).
- Profile/progression (pure, no storage/UI): `src/profile/` — `rewards.ts` (`RunResult`,
  `runRewards`), `class-xp.ts` (`xpToNextLevel`, `addClassXp` overflow/cap 50/lifetime,
  derived `talentPoints`), `profile.ts` (`PlayerProfile` schema v1, `createProfile(id, createdAt)`),
  `apply-run.ts` (`applyRunResult(profile, result, finishedAt)` pure + idempotent by runId,
  `isMapUnlocked`, `nextMapAfter`, `validateRunResult`). Tests `tests/profile/`
  (`npm run test:profile`).
- Persistence: `src/persistence/` — `saveSchema.ts` (`parseProfile`/`parseProfileJson` never
  throw: version check → `migrations` (empty, keyed by from-version) → `normalizeProfile`
  defaults + strict validation, unknown fields dropped; `SaveDataError` codes malformed-json /
  not-an-object / newer-version / unsupported-version / invalid). `saveStore.ts`
  (`createSaveStore({storage, now, newProfileId})` → `load()` new/loaded/recovered/error/
  unavailable, `save()` with backup copy + quota/unavailable/blocked/invalid, `clearForDev`;
  keys `skazki.profile`, `.backup`, `.quarantine`). `progressionService.ts`
  (`createProgressionService(store)`: in-memory profile + `SaveStatus` saved/unsaved/
  not-persisted/error, `commitRun` one save per run, `selectClass`, `retrySave`,
  `replaceProfile`, `subscribe`; `generateRunId`), `transfer.ts` (`exportProfile` →
  `skazki-save-YYYY-MM-DD.json`, `prepareImport` size limit 1 MB + parse/validate/migrate, no
  side effects). Tests `tests/persistence/` (`npm run test:persistence`).
- Campaign UI: `src/gameplay-ui/campaign-state.ts` (`campaignStore`: progression service
  singleton, menu page, selected map, `startRun` → `start` command with `campaign {mapId, runId}`
  and the class's permanent level), `CampaignMenu.tsx` (nav + Gold + pages; Play keeps the
  class grid + «Начать забег» used by browser tests), `CampaignPages.tsx` (Character, Maps),
  `campaign-format.ts`, `ResultsScreen.tsx`; `campaignStore` commits resolved runs once
  (`runResultFrom`, `lastResult`), `quitToMenu` (→ `abandon` command), `pagehide` abandon.
  `CampaignHud.tsx` (map/stage/time left/boss countdown/elite alert/boss HP bar),
  `SaveManagement.tsx` (Settings → export/import with confirmation/retry; `SaveWarning` banner),
  `save-messages.ts` (friendly texts); `campaignStore.exportSave/stageImport/confirmImport/
cancelImport/retrySave`.
  Scene screen `results` (campaign victory/defeat). Browser test `tests/campaign-browser.mjs`
  (part of `npm run test:e2e`). Tests `tests/campaign/` (`npm run test:campaign`).
- Node 24, `npm ci`. Unit: `npm test` (Vitest + Node prototype tests). Per module: `test:stats`,
  `test:combat`, `test:weapons`, `test:status`, `test:enemies`, `test:survival`, `test:alpha`
  (tests/gameplay), `test:skills`. Typecheck `npm run typecheck`; format `npm run format:check`
  (Prettier also checks docs/_.md). Build `npm run build` → `dist/`; `npm run test:production`.
  QA: `GAME_LOCAL_QA=1 npm run build:qa` + `npm run test:qa`. E2E: `npm run dev` on :5173, then
  `CHROMIUM_PATH=/opt/pw-browsers/chromium-_/chrome-linux64/chrome npm run test:e2e`.
- Rules: `AGENTS.md` (invariants §4: Combat Core owns HP/damage; `GameplayWorld` is the sole
  scheduler via peekBoundary/advanceToBoundary/resolveBoundary; seeded RNG only; stable tie order).
- Combat: `src/combat-core/` (`CombatCore`, `attack.ts` createAttackSnapshot /
  `calculateSuccessfulDamage`, periodic DoT damage, barrier, death events).
- Stats: `src/character-stats/` (class attributes, levels 1–50, `calculateCharacterStats(class,
level)`, caps `COMBAT_ATTRIBUTE_CAPS`, `scaleCooldown`/`scaleCircularAoeRadius`). Run stats:
  `src/skills/stats.ts` `composeRunStats`.
- Weapons: `src/weapon-attacks/` (targeting, melee sectors, projectiles). Alpha weapons:
  `ALPHA_WEAPONS` in `src/gameplay/config.ts`.
- Enemies: `src/enemy-ai/` (movement, separation grid, contact/ranged attacks, `setControl`
  Slow/Stun). Profiles `ALPHA_ENEMIES`, `ALPHA_ENEMY_STATS` (`src/gameplay/config.ts`).
- Status effects: `src/status-effects/` (`STATUS_RULES` 10 stacks, 1 s tick).
- Survival/revival: `src/player-survival/` (one revival, 50% HP, 3 s protection, cleanse).
- World/scheduler: `src/gameplay/GameplayWorld.ts` (boundaries, events `getEvents()`, snapshot
  `getSnapshot()`, `spawnEnemy`, run XP crystals, `setPaused`). Types `src/gameplay/types.ts`.
- Spawning/waves: `src/gameplay/spawning.ts` (`DEFAULT_SPAWNING`, `spawningSettings`,
  `wavePressure`, off-screen positions; separate spawn RNG). Caps: 120 enemies, 512 crystals.
- Run XP: `src/gameplay/experience.ts` (`XP_RULES`, `RunExperience`, `runXpCost`).
- Skills (Task 07/07.2 v2): `src/skills/` (catalog, `RunSkills`, offers, `SkillEngine`,
  `synergies.ts` pair unlock + `SynergyResolver`, `damage-readout.ts`, `synergy-info.ts`).
- UI (React): `src/gameplay-ui/AlphaApp.tsx` (screens: menu/playing/paused/level-up/revival/
  ended), `SkillPanels.tsx` (level-up, Skills overview, PauseDialog), `store.ts` (`alphaBridge`
  snapshots ~10 Hz + commands), `alpha.css`. Entry `src/main.tsx` (`/?prototype` → legacy app).
- Rendering/input (Phaser): `src/engine/AlphaScene.ts` (publishes screen, draws, P/Esc pause via
  `oncePerKeyEvent`, scene FX for skill/synergy events), `createGame.ts`, `stun-indicator.ts`.
- Debug/QA: `src/gameplay/testing.ts` (`createTestingController`, DEV/QA-only),
  `src/gameplay/qa.ts` (`QaGameplayWorld`: God Mode, synergy diagnostics),
  `src/gameplay-ui/DeveloperPanel.tsx`, gating `import.meta.env.DEV || __QA_BUILD__`,
  `config/qa-build.mjs`, `window.__alpha` (state/command/advance/presentation).
- Campaign debug (6.1): world `debugFireCampaignEvent` / `debugSetBossHpFraction` /
  `debugForceOutcome`, director `fireNow`; testing actions `campaign-skip|boss-now|boss-hp|force`;
  scene `time-scale` command; profile tools `src/gameplay-ui/campaign-debug.ts`; DeveloperPanel
  fieldsets «Кампания · профиль/забег»; tests `tests/campaign/debug.test.ts`.
- Existing storage: `src/progression/save.ts` — localStorage key `fantasy-survivors.progression`
  (v1: bestSeconds, bestKills, runs); `loadSave`/`saveRun` used by `AlphaScene` and the prototype.
  No other persistence.
- Tests: `tests/<module>/*.test.ts` (Vitest; skills helpers `tests/skills/helpers.ts` `arena`,
  `play`, `ALL_SYNERGY_SKILLS`), browser `tests/alpha-browser.mjs`, `tests/browser.mjs`
  (prototype), `tests/alpha-production.mjs`, `tests/alpha-qa.mjs`, `tests/skills-ui-browser.mjs`,
  `tests/qa-tools-browser.mjs`. Screenshots → ignored `artifacts/`.
- Docs: `docs/IN_RUN_SKILLS.md`, `docs/SYNERGIES_V2_DAMAGE.md`, `docs/PLAYABLE_COMBAT_ALPHA.md`,
  `docs/EXPERIENCE_WAVES.md`, `docs/DEVELOPMENT_WORKFLOW.md`.

## Decisions / deviations

- 1.1: stage starts at 0 / 15% / 40% / 65% / 90% of duration (spec: relative boundaries, values
  not given). Map and boss names are original placeholders. Phase 1 boss = scaled melee
  placeholder (HP ×15, dmg ×1.6 on top of map difficulty), replaced in Phase 2.
- 1.2: spawn rate ×m divides wave interval and its floor (min 0.25 s); campaign waves use
  maxActive = 120 − 4 reserved slots for elites/boss. World event history is bounded (160):
  exactly-once logic must use state, never history.
- 1.3: reserved slots raised to 8 (≥ max scheduled enemies: Map 10 = 6 elites + boss), so a
  scheduled spawn never exceeds the cap and is never skipped. New tie rank 9.5 'campaign' after
  reinforcement spawning (additive, as Task 07 did). 12-min map: no elite at exactly 12:00.
- 1.4: boss death = any death of the boss entity (deduplicated by the world). A resolved run
  freezes the world like a pending choice. Run ID is supplied by the caller (UI, Phase 5) — the
  simulation never generates it from wall-clock or Math.random.
- 2.1: elites reuse the existing enemy AI with scaled radius/speed/attack interval (melee) or
  range (ranged); extra run XP (+40, provisional) is added to the normal crystal, so the reward
  stays deduplicated by the world.
- 2.2: boss actions get tie rank 6.5 (with enemy attacks, before status expirations); dangerous
  abilities (circle AoE, charge) must telegraph ≥ 0.8 s; boss hits use the same survival policy
  as enemy contact; summons never use the reserved elite/boss slots. Placeholder boss uses
  `CAMPAIGN_BALANCE.boss.defaultAbilities` until 2.3. Charge = speed boost toward the player +
  impact check at the end (not a teleport), reusing EnemyAI movement.
- 2.2 fix (pre-existing EnemyAI edge case, exposed by elites): a melee enemy on the player's
  exact centre with separation velocity produced a crossing root below the clock resolution at
  large t, looping forever. `futureCrossings` drops roots that are the same instant as now;
  regression tests in `tests/enemy-ai/task08-regressions.test.ts`.
- 2.3: boss CC limits only tighten the global rules (Slow cap 25–30%, stun ×0.4–0.5, immunity
  3–4 s). Boss/elite HP bars are drawn in-world for now; the HUD boss bar is Phase 5.4. Boss XP
  (+120…260 run XP, provisional) rides on the normal deduplicated crystal. Removed the Phase 1
  placeholder boss values from the config.
- 3.3: abandoned runs only count in `stats.runs`, recent runs and processed ids (no rewards,
  kills, survival or best results). A victory must have `bossKilled`. Locked maps cannot be
  applied. Profile id and timestamps are supplied by the caller (pure). Recent runs keep
  level before/after so a revisited results screen shows the exact original summary.
- 4.1: invalid data is rejected, never auto-repaired (except defaults for missing fields).
  Consistency check: every completed map must have unlocked its successor.
- 4.2: an unusable main save is copied to a quarantine key before the backup can be used, so
  even a newer-version or corrupt save is never lost. If neither is usable, writes are blocked.
  The old prototype key `fantasy-survivors.progression` is left untouched (separate data).
- 4.3: a new profile is saved immediately on first launch. On a failed write the progress stays
  in memory for the session (status `unsaved` + failure) and `CommitResult.saved` is false.
- 4.4: import keeps the file's own profileId; confirmation + "export current first" and the
  actual download/upload are UI (5.5). A confirmed import goes through `replaceProfile`, so the
  previous valid save becomes the backup.
- 5.1: the menu now always starts campaign runs (map 1 by default); the DEV-only start-level
  input was removed (Phase 6 adds a set-class-level debug tool). Non-campaign runs remain
  available through DEV/QA restart commands.
- 5.3: results are committed by the campaign UI state module (not components), once per runId;
  reload/close during a run commits an abandoned result on `pagehide` (sync localStorage).
  Results show «Прогресс сохранён» only when the commit reached storage.
- 5.4: elite alert 10 s before each elite and 5 s after it spawns; HUD reads the snapshot only.
  Run level/XP relabelled «Уровень забега · опыт забега» (blue), permanent «ур. класса».
- 5.5: Settings has no pre-existing options in the alpha, so it holds Save Management only.
  The forfeit notice is on the Play page and in the campaign Pause dialog. CSS class
  `class-stats` (not `character-stats`, which the prototype stylesheet already uses).
- 6.1: debug tools reuse the normal pipelines: early boss/elite = director `fireNow` (marked
  fired, never spawns again); boss HP cut = periodic damage through Combat Core (pre-scaled by
  Resistance, never heals); forced victory = boss death + firing 'end' (snapshot
  `durationReached` also reflects the run state); forced defeat = HP 0 + finish run (no
  revival). Profile edits go through validated `replaceProfile`; reset needs confirmation.
  Acceleration multiplies the scene frame delta (1–20×, DEV/QA only), same simulation steps.
  Production markers asserted absent in `tests/alpha-production.mjs`.
- Task 07.2 is on the PR #3 branch (`claude/stoic-carson-76vdrx`, `dde421a` + v2 `9e8aa93`), not
  on `main` (PR #3 unmerged). `task-08-campaign` is stacked on that branch; the draft PR targets it
  so its diff shows only Task 08. Retarget to `main` after PR #3 is merged.
- Commit titles follow the Task 08 rule `task08: <phase>.<step> <summary>` (overrides AGENTS.md
  `Task NN:` style for this task, per owner).
- `docs/task-08.md` is the owner's spec verbatim, Prettier-formatted (whitespace only) for CI.

## Verification log

- 6.2 (full regression): typecheck ✓, format ✓, `npm test` 977 Vitest + Node suites ✓ (combat,
  AI, status, weapons, survival, Task 07 skills/synergies, campaign/profile/persistence),
  `npm run build` ✓, `test:production` 2 PASS (debug markers absent), QA build + `test:qa` PASS,
  `test:e2e` 3 PASS (prototype, alpha, campaign incl. DEV campaign tools).

- 6.3 (test path, no debug tools): `tests/campaign/walkthrough.test.ts` — new profile → Map 1
  (warrior: run skills, elites, boss at 10:00, victory, +XP/Gold/level, Map 2 unlocked) → new
  service over the same storage (= browser restart) keeps progress → Map 2 with the mage
  (separate class XP, shared Gold) → Maps 3–10 won in order (all 10 bosses killed) → export →
  import into a fresh storage gives the identical profile. Normal simulation only; regular waves
  off for speed, player protected and idle (stand-in for a human dodging). UI path (menu,
  results, reload, Map 2 other class, export/import) covered by `tests/campaign-browser.mjs`
  without debug tools (fast-forward uses `advance`, the same simulation).
- 6.3 full-wave probe (not in the suite, ~2 min each): Map 10 with normal waves, protected idle
  player, seed 8 — warrior Lv 1 and Lv 10 and mage Lv 10 all won at 15:00 (boss 4493 HP killed;
  510 / 510 / 1872 kills). Not verified: an unprotected human-skill playthrough of Map 10 (needs
  the owner's Preview playtest).

## Blockers / known issues

- Cloudflare Preview not checked by the agent (sandbox cannot open `*.workers.dev`).
