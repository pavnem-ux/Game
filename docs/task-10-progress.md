# Task 10 — progress

Spec: [task-10-maps.md](task-10-maps.md) (owner's file; Prettier only added blank lines before
lists). Branch `task-10-maps` from `main` at `65c1835` (contains Tasks 08, 08.5, 09, 09.1:
`src/campaign` and `src/talents` present). All new numbers are **provisional**.

Current: done — awaiting Codex review and owner approval (PR #8)

Draft PR: https://github.com/pavnem-ux/Game/pull/8

## Checklist

- [x] 0.1 Branch from `main`, progress file, draft PR to `main`
- [x] 1.1 Campaign config for 40 maps (acts, names, durations, difficulty, elites, modifiers, boss
      refs) + validation
- [x] 1.2 Run XP −20%, Gold table, ranged share 0.12 (spec 1.3)
- [x] Phase 1 tests (40 maps; maps 1–10 snapshot; difficulty 11/20/40; crystal/elite XP; Gold;
      unlock chain 10→…→40)
- [x] 2.1 Boss configs 11–40 (landed with 1.1, see commit note)
- [x] 2.2 Elite interval per act, 2 elites per event where configured
- [x] Phase 2 tests (`tests/campaign/bosses-elites-40.test.ts`) (boss uniqueness, ability counts, elite times, reserved slots)
- [x] 3.1 Per-map modifiers through existing levers + tests (`tests/campaign/modifiers.test.ts`)
- [x] 4.1 Save validation/migration for maps 1–40 (schema v3, `migrateV2toV3`)
- [x] 4.2 Recommended level function
- [x] 4.3 Map selection UI (acts, recommended level, modifiers, boss, lock reason)
- [x] 4.4 Debug: unlock all 40 maps, jump to any map
- [x] Phase 4 tests (old save, maps 11–40 persist, recommended level 1/11/30/40)
- [x] 5.1 Accelerated check: maps 20 and 40 completable (level 50, all talents) — 8/8 victories,
      table in `docs/CAMPAIGN_ALPHA.md`
- [x] 5.2 Full checks (AGENTS.md §6 + e2e), docs (`CAMPAIGN_ALPHA.md`, README, `playtest.md`)
- [x] 5.3 PR description

## Code map (Task 10)

- `src/campaign/config.ts`: `CAMPAIGN_ACTS` (I–IV, names, map ranges, elite interval
  120/105/90/75), `DOUBLE_ELITE_MAPS` (25–30, 35–40), `actOf`, `mapDurationSeconds` (11–40: 15 min),
  `mapDifficulty` (≤ 10 Task 08 formula; > 10 spawn rate frozen, HP/damage from map 10 +0.15/+0.10),
  `victoryGold` (own table / formula), `eliteEventTimes`. `CampaignMap` gains `act`, `elite`
  (interval, perEvent, multipliers) and `reservedSlots`. `CAMPAIGN_BALANCE.rangedShare` 0.12,
  `maxRangedShare` 0.18, elite `extraXp` 32. 30 new map/boss names in `MAP_TEXT`.
- `src/campaign/schedule.ts`: elites from `eliteEventTimes` × `perEvent` (each elite its own event
  at the same time, index order); the boss is its own event at 10:00; per-map reserve check.
- `src/campaign/timer.ts`: `campaignSpawning` uses the campaign ranged share and the map's reserve.
- `src/gameplay/GameplayWorld.ts`: elite multipliers from `map.elite`.
- `src/gameplay/experience.ts`: `XP_RULES` melee 8, ranged 12.
- `src/campaign/bosses.ts`: `LATER_BOSSES` (maps 11–40), `bossParamSignature`, `BOSS_ABILITY_COUNTS`,
  validation per act (Act I distinct kind sets; Acts II–IV 2–3 / 3 abilities; no duplicate
  ability set + parameters across all 40; Act IV cooldowns below every Acts II–III cooldown of the
  same kind).
- Modifiers (3.1): `MAP_MODIFIERS` (`swift` speed ×1.1, `ranged15`/`ranged18` share, `elites` HP ×1.25 /
  damage ×1.15) in `config.ts`; `CampaignMap.modifiers` (Russian labels) and `enemySpeedScale`;
  world `enemyProfile(kind)` scales the default enemy profiles (automatic waves, boss adds, elite
  base); the test API `spawnEnemy` and bosses keep their own configs.
- Save (4.1): `PROFILE_SCHEMA_VERSION` 3; `migrateV2toV3` in `src/persistence/saveSchema.ts`;
  map ids validated against `CAMPAIGN_MAPS.length` (40). Tests `tests/persistence/maps-40.test.ts`.
- 4.2 `src/profile/recommended-level.ts` (`recommendedLevel`, `levelAfterAllMaps`); tests
  `tests/profile/recommended-level.test.ts`.
- 4.3 `CampaignPages.tsx` `MapsPage`: act tabs (group «Акты кампании», selected map's act first),
  act title, «Рекомендуемый уровень N», lock reason «Победите на карте N», modifier list, boss
  «???» while locked. `CampaignMenu.tsx`: map select grouped by act; summary with recommended level
  and modifiers. CSS in `alpha.css`.
- 4.4 `campaignDebug.jumpToMap(id)` (unlock up to it + normal `startRun`), DEV panel «Debug карта» /
  «Перейти к карте»; tests `tests/persistence/maps-debug.test.ts`; production markers added.
- Tests: `tests/campaign/maps-40.test.ts` + fixture `tests/campaign/fixtures/act1-task08.json`
  (maps, schedules, spawner settings and XP values dumped from `main` before Task 10).

## Decisions

- Acts II/III elite intervals (105 s, 90 s) do not hit 10:00, so the boss is its own event at
  10:00 on every map; an elite falling exactly on 10:00 is replaced by the boss (Act I, Act IV
  intervals 120 / 75). Maps 1–10 schedules are byte-identical to Task 08 (fixture test).
- Reserved slots are per map: max(8, every scheduled enemy) — maps 1–10 keep 8; e.g. map 40
  reserves 21 (10 events × 2 elites + boss), so automatic waves there cap at 99 active enemies and a
  scheduled elite/boss is never skipped. Provisional; this is the existing reserve rule applied to
  the larger schedules.
- The 0.12 baseline ranged share lives in the campaign config (`CAMPAIGN_BALANCE.rangedShare`), so
  the non-campaign alpha/sandbox spawner default (0.18) is unchanged. Boss run XP (`xpReward`) is
  not an elite reward and stays as configured (Task 10 bosses 270 + 10·(id − 11)).
- Boss uniqueness: 5 ability kinds give only 20 kind sets of size 2–3, so uniqueness for maps
  11–40 is on ability set + parameters (spec wording); Act I keeps its distinct kind sets.
- Existing Task 08 tests now scope their «10 maps» assertions to Act I; their «map 11 is invalid»
  cases moved to map 41/42; crystal-value assertions use the new `XP_RULES` (one test kills 3
  enemies instead of 2 so it still crosses level 2).

- Modifier values (×1.1 speed, 0.15/0.18 ranged, elites ×1.25/×1.15) and which maps get them are
  provisional choices within the spec (≤ 2 per map, 23 of 30 new maps). `swift` affects normal
  enemies, elites and boss adds, not the boss itself (bosses have their own speed config).

- 4.1 schema bump is required: the save rule «a completed map unlocks the next» now makes a Task
  08–09 save that finished map 10 (`highestUnlockedMap` 10) inconsistent, so v2 → v3 unlocks map 11
  for exactly those saves; every other field is kept. Older builds will refuse a v3 save
  (`newer-version`), as designed.

- 4.2 The recommended level equals the map number for every map (each victory gives a little more
  than one level's cost on the existing curve): map 29 → 29, map 30 → 30 (superpower), map 40 →
  40; clearing all 40 maps once reaches **41**, not the spec's expected ~43 (45 000 XP; level 42
  needs 45 100). Reported, not tuned: victory XP and the level curve are fixed by the spec.

- 5.1 The check is a headless bot run (script kept out of the repo, in the agent scratchpad):
  all 4 classes win maps 20 and 40 with no deaths; bosses die within 1–8 s of spawning. Reported as
  a balance finding (late maps too easy at level 50), not tuned.

## Verification log

- Phase 1: typecheck ✓, format ✓, `npm test` 1160 ✓.
- Phase 2: typecheck ✓, format ✓, `npm test` 1168 ✓.
- Phase 3: typecheck ✓, format ✓, `npm test` 1173 ✓.
- Phase 5: typecheck ✓, format ✓, `npm test` 1182 ✓, `npm run build` ✓, `test:production` 2 PASS,
  `GAME_LOCAL_QA=1 npm run build:qa` + `test:qa` PASS, `test:e2e` 3 PASS.
- Phase 4: typecheck ✓, format ✓, `npm test` 1182 ✓, `npm run build` ✓, `test:production` 2 PASS,
  `test:e2e` 3 PASS (campaign test: act tabs, Act II cards, «1 / 40», all 40 unlocked by DEV).
