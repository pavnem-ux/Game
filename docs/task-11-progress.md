# Task 11 — progress

Spec: [task-11-equipment-shop.md](task-11-equipment-shop.md) (owner's file; Prettier only aligned
the table and added blank lines). Branch `task-11-equipment` from `main` at `05b029e` (Task 10
merged: 40-map config present). All new numbers are **provisional**.

Current: done — PR ready for review (not merged)

Draft PR: https://github.com/pavnem-ux/Game/pull/9

## Checklist

- [x] 0.1 Branch from `main`, progress file, draft PR
- [x] 1.1 Item templates, tier generation, prices, shop unlock rules (config + validation)
- [x] 1.2 Purchase / equip / unequip logic (pure)
- [x] Phase 1 tests (85 items, unique ids; tier stats and prices; unlock by map; no double buy, no
      buy without Gold or with a locked tier; weapon eligibility; per-class loadouts)
- [x] 2.1 Save schema, migration, validation (spec 1.6) + tests
- [x] 3.1 Gear modifiers in the attribute pipeline + tests
- [x] 4.1 Coin drops / pickups / caps
- [x] 4.2 Run rewards (victory / defeat / abandon) + dedup
- [x] 4.3 HUD / results
- [x] Phase 4 tests (deterministic drops, one drop per death, pile cap, reward math, no duplicate
      Gold)
- [x] 5.1 Shop screen
- [x] 5.2 Character equipment screen with preview
- [x] 5.3 Debug tools
- [x] 6.1 Measure coin income (maps 1, 10, 20, 40) and tune drops to the 60% target
- [x] 6.2 Full checks (AGENTS.md §6 + e2e), docs (`EQUIPMENT_SHOP.md`, README, `playtest.md`)
- [x] 6.3 PR description

## Code map (Task 11)

- `src/equipment/config.ts`: slots, gear stats (named after `RunStatModifiers` keys, plus
  `areaSizePercent`), tier-1 base values, tier table (name, ×multiplier, price, unlock map, colour,
  Russian adjective forms), weapon price ×1.25 / second stat ×0.6, 17 templates, starter weapons.
- `src/equipment/items.ts`: `SHOP_ITEMS` (85 = 17 × 5, ids `<template>-t<tier>`), `STARTER_ITEMS`
  (tier 0, no stats), `getItem`/`findItem`, `isEligible`, `validateEquipmentConfig` (startup).
- `src/equipment/logic.ts`: `EquipmentState` {gold, ownedItems, loadouts}, `defaultLoadouts`,
  `highestClearedMap`, `isTierUnlocked`, `checkPurchase`/`purchase` (atomic: Gold + ownership),
  `equip`/`unequip` (per-class), `loadoutStats`.
- Save (2.1): `PROFILE_SCHEMA_VERSION` 4; `PlayerProfile.ownedItems`; `ClassProgress.loadout`
  (`ClassProgressCore` = XP + talents; `addClassXp` keeps the other fields); `migrateV3toV4`;
  `normalizeProfile` validates owned ids (known, buyable, unique) before loadouts (known id, right
  slot/class, owned or the class's starter, weapon never empty). Tests
  `tests/persistence/gear-save.test.ts`.
- Stats (3.1): `RunStatModifiers.areaSizePercent` (additive, 0 elsewhere) in `composeRunStats`;
  `src/equipment/stats.ts` `gearModifiers`, `addModifiers`, `validateLoadout`, `permanentStats`
  (Character screen). `GameplayOptions.equipment {loadout}`; world `loadout`, `permanentModifiers`
  = talent layer + gear (host `talentModifiers`, start stats); `campaignStore.startRun` sends the
  class's loadout. Tests `tests/equipment/stats.test.ts`, `tests/persistence/gear-run-start.test.ts`.
- Coins (4.1–4.3, tuned in 6.1): `src/equipment/economy.ts` (`COIN_RULES`: coin target 60% of the
  victory Gold, boss pile 20% of it, all elites of the map together 20%, normal piles 1 × scale with
  `normalChance(map)` = 27 piles over 4.7 × spawnRate × duration expected kills; pile cap 256,
  victory bonus 40%, defeat 50%; `coinScale` = Task 10 Gold table / 75; `coinTarget`, `coinValue`,
  `victoryBonus`, `runGold`). A victory collects the piles still on the ground
  (`RunCoins.collectAll`). `src/gameplay/coins.ts` `RunCoins` (crystal magnet radius and cell
  merging, separate cap, merge into the nearest pile at the cap). RNG stream `coins` (new salt).
  World `dropCoins` inside the once-per-death reward block; collection next to crystals; snapshot
  `coins {collected, piles}`; events `coins-dropped` / `coins-collected` (progression channel).
  `RunResult.coins` (validated, default 0) → `runRewards` {xp, gold, coins, bonus}; `runResultFrom`
  sends the collected coins. HUD «◎ N», results «Монеты / Бонус за победу / Золото», piles drawn in
  `AlphaScene`. Tests `tests/gameplay/coins.test.ts`, `tests/persistence/coins-reward.test.ts`.
- UI (5.1–5.3): `src/profile/equipment.ts` (`buyItem`, `equipItem`, `unequipSlot`, `equipmentStateOf`);
  `campaignStore.buyItem/equipItem/unequipSlot` (one validated `replaceProfile` save each; a failed
  write keeps the old profile). `src/gameplay-ui/ShopPages.tsx`: `ShopPage` (menu «Магазин»: slot tabs,
  weapon class switcher, tier colour, stats, state купить/куплено/надето/откроется после карты N,
  confirmation), `EquipmentPanel` on the Character page (4 slots, owned eligible items, «Снять»,
  +/− preview, stats without/with gear). Debug: «Открыть все предметы», «Лучшее снаряжение (класс)»
  (`campaignDebug.unlockAllItems/equipBestTier`), overlay «Монеты · в минуту». Tests
  `tests/persistence/shop-store.test.ts`; e2e shop purchase + equip; production markers.
- Tests `tests/equipment/` (`npm run test:equipment`, included in `npm test`).

## Decisions

- Item names: tier adjective agreeing with the template's gender + the template name in lower case
  («Редкий тяжёлый меч», «Легендарная мантия», «Добротные латы», «Эпическое кольцо ярости»).
- A missing `loadout` in a v4 save defaults to the starter loadout (same «missing field → default»
  rule as the other fields); an invalid one is rejected.
- Coins exist in campaign runs only (their value comes from the map); sandbox runs drop none.
- Existing Task 08 reward tests expected «victory Gold = map Gold». They now pass `coins: 45` for a
  map 1 victory (45 + 30 bonus = 75) or assert the new formula; defeat Gold is 50% of the coins.
  The campaign e2e reads the actual Gold of its win (coins vary with the per-run seed).
- Starter weapons are not stored in `ownedItems`; they are always owned and never sold.
- 6.1: the first coin values (normal 6% × 1, elite 4, boss 12, all × map scale) gave 2900–5600
  coins on won maps 20 / 40 (≈ 11× the target): a won run is a full clear (≈ 7300 kills), and the
  elites + boss alone already exceeded the target on late maps. New structure: the coin target of
  each map is split boss 20% / elites 20% (shared by the map's elite count, so double-elite maps
  don't double the income) / normals 60% (chance from the expected kill count).
- 6.1: a victory collects every pile left on the ground. Maps 1–10 spawn the boss at the end of the
  timer, so the run resolves the moment the boss dies and its pile could never be picked up.
  Defeat leaves the piles (no change).

## Verification log

- Phase 6: typecheck ✓, format ✓, `npm test` 1213 ✓, `npm run build` ✓, `test:production` 2 PASS
  (with `CHROMIUM_PATH`), QA build + `test:qa` PASS, `test:e2e` 3 PASS. Income table (8 bot
  victories per map): map 1 avg 43.5 coins (97% of 45), map 10 190 (106% of 180), map 20 287 (106%
  of 270), map 40 485 (108% of 450) — `docs/EQUIPMENT_SHOP.md` §4.1.
- Phase 1: typecheck ✓, format ✓, `npm test` 1190 ✓ (equipment 8).
- Phase 5: typecheck ✓, format ✓, `npm test` 1212 ✓, `npm run build` ✓, `test:production` 2 PASS,
  `test:e2e` 3 PASS.
- Phase 4: typecheck ✓, format ✓, `npm test` 1208 ✓, `test:e2e` 3 PASS.
- Phase 3: typecheck ✓, format ✓, `npm test` 1200 ✓, `test:e2e` 3 PASS.
- Phase 2: typecheck ✓, format ✓, `npm test` 1194 ✓. Tests pinned to schema v3 now expect v4
  (newer-version cases use 5).
