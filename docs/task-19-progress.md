# Task 19 — progress

Spec: [task-19-gear-upgrades-ore.md](task-19-gear-upgrades-ore.md) (owner's file). Branch
`task-19-gear` stacked on `task-16-mobile` (PR #16 was not merged into `main` yet when this task
started; the spec's base is "main with Task 16 merged"). Rebase onto `main` once #16 is merged.

Current: Phase 5

Draft PR: https://github.com/pavnem-ux/Game/pull/17

## Checklist

- [x] 0 Branch, spec, progress file, draft PR
- [x] 1.1 Helmet / gloves / pants templates, items, config
- [x] 1.2 Loadout + stats pipeline
- [x] 1.3 Shop / equipment UI
- [x] Phase 1 tests
- [x] 2.1 Ore rewards, first-victory bonus, dedup
- [x] 2.2 Ore UI
- [x] 3.1 Upgrade logic (pure)
- [x] 3.2 Stats with upgrade levels
- [x] 3.3 Forge UI
- [x] 4 Save v5 migration / validation
- [ ] 5 Full checks, docs, PR

## Decisions

- Slot order: Оружие, Шлем, Броня, Перчатки, Штаны, Амулет, Кольцо (`GEAR_SLOTS`).
- New template ids: `guard_helm`, `hunter_hood`, `mage_circlet`, `plate_gauntlets`,
  `trickster_gloves`, `sorcerer_gloves`, `plate_greaves`, `leather_pants`, `mystic_trousers`.
- "First stat ×1.0, second ×0.6" is applied to the new slots via `SECOND_STAT_REDUCED_SLOTS`
  (weapon + the 3 new slots). Task 11 armor keeps ×1.0 / ×1.0 (unchanged). New items cost the
  non-weapon tier price (80 / 300 / 700 / 1400 / 2500).
- The loadout and stats pipeline already iterates `GEAR_SLOTS`, so the new slots flow through
  `gearModifiers` → `composeRunStats` (caps once) with no new code path. Save validation fills a
  missing slot with `null`.
- Paper doll: helmet / armor / gloves left, amulet / ring / pants right of a slim figure, weapon
  across the bottom; at ≤ 760 px two slot columns without the figure. Shop and filter tabs list all
  7 slots (from `GEAR_SLOTS`). Checked at 1280×800, 1024×768, 844×390, 390×844: no horizontal scroll.
- Ore: `runOre(outcome, mapId, firstVictory)` in `equipment/economy.ts` (`ORE_RULES`); "first
  victory" = the map was not in `completedMaps` before this run. Credited in `applyRunResult`
  (same snapshot and run-ID dedup as XP/Gold); stored per recent run (`ore`, optional) and in
  `RunSummary.oreGained`. UI: «Руда» badge next to Gold in the menu top bar (hub, shop, forge — all
  menu pages), «Руда» row on the results screen (with «первая победа ×3»).
- Forge (`equipment/upgrades.ts`, pure): `UPGRADE_RULES`, `upgradeCost`, `upgradedStats`,
  `checkUpgrade` (reasons `unknown`, `starter`, `not-owned`, `max`, `gold`, `ore`), `upgradeItem`
  (one new state). Gold cost rounds **up** (`⌈price × 0.1 × L⌉`: a tier-5 weapon at 3125 Gold has
  half-Gold steps, e.g. +1 = 313). Upgraded stats are rounded to 3 decimals.
- Levels live in `profile.itemLevels` (id → 1–10; +0 not stored). They reach the run through
  `GameplayOptions.equipment.itemLevels` (validated at world start) → `gearModifiers(loadout,
levels)` → `composeRunStats` (caps once). Character and Equipment screens use the same
  `permanentStats(…, itemLevels)`.
- Store: `campaignStore.upgradeItem(id)` → one validated save (Gold + ore + level); a failed write
  keeps the old profile. Debug: `grantOre`, `setItemLevel` (DEV/QA panel only).
- Forge UI (`meta/ForgeScreen.tsx`): page «Кузница» in the menu nav (after «Магазин») and a hub
  tile; «В кузницу» in the Equipment item preview opens it with that item selected. Owned
  upgradeable items (equipped first) with slot filter and level pips; detail panel: level, current vs
  next stats, Gold + ore cost (red when short), «Улучшить до +N» (disabled with the reason). Item
  names show the level («… +3») in the forge, equipment (doll, grid, compare), shop and character
  cards; item stat lines show upgraded values. On phones the detail panel scrolls into view on pick.
- DEV panel «Снаряжение и магазин»: «Выдать руду», item + level (+0…+10) → «Установить уровень
  предмета».
- Save v5 (`migrateV4toV5`): adds `ore: 0`, `itemLevels: {}` and empty `helmet` / `gloves` /
  `pants` to every existing loadout; nothing else changes. Validation: ore whole ≥ 0; item levels
  whole 0–10 for owned, upgradeable items (0 accepted, not kept); new slots checked like the old
  ones. Older-version test fixtures built from current profiles now drop the v5-only fields (a real
  v1–v4 save never had them); the newer-version cases use v6.
- Debug «Лучшее снаряжение»: the Mage gets the magic helmet / gloves / pants.

## Verification log
