# Task 11 — progress

Spec: [task-11-equipment-shop.md](task-11-equipment-shop.md) (owner's file; Prettier only aligned
the table and added blank lines). Branch `task-11-equipment` from `main` at `05b029e` (Task 10
merged: 40-map config present). All new numbers are **provisional**.

Current: Phase 4 (coins)

Draft PR: https://github.com/pavnem-ux/Game/pull/9

## Checklist

- [x] 0.1 Branch from `main`, progress file, draft PR
- [x] 1.1 Item templates, tier generation, prices, shop unlock rules (config + validation)
- [x] 1.2 Purchase / equip / unequip logic (pure)
- [x] Phase 1 tests (85 items, unique ids; tier stats and prices; unlock by map; no double buy, no
      buy without Gold or with a locked tier; weapon eligibility; per-class loadouts)
- [x] 2.1 Save schema, migration, validation (spec 1.6) + tests
- [x] 3.1 Gear modifiers in the attribute pipeline + tests
- [ ] 4.1 Coin drops / pickups / caps
- [ ] 4.2 Run rewards (victory / defeat / abandon) + dedup
- [ ] 4.3 HUD / results
- [ ] Phase 4 tests (deterministic drops, one drop per death, pile cap, reward math, no duplicate
      Gold)
- [ ] 5.1 Shop screen
- [ ] 5.2 Character equipment screen with preview
- [ ] 5.3 Debug tools
- [ ] 6.1 Measure coin income (maps 1, 10, 20, 40) and tune drops to the 60% target
- [ ] 6.2 Full checks (AGENTS.md §6 + e2e), docs (`EQUIPMENT_SHOP.md`, README, `playtest.md`)
- [ ] 6.3 PR description

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
- Tests `tests/equipment/` (`npm run test:equipment`, included in `npm test`).

## Decisions

- Item names: tier adjective agreeing with the template's gender + the template name in lower case
  («Редкий тяжёлый меч», «Легендарная мантия», «Добротные латы», «Эпическое кольцо ярости»).
- A missing `loadout` in a v4 save defaults to the starter loadout (same «missing field → default»
  rule as the other fields); an invalid one is rejected.
- Starter weapons are not stored in `ownedItems`; they are always owned and never sold.

## Verification log

- Phase 1: typecheck ✓, format ✓, `npm test` 1190 ✓ (equipment 8).
- Phase 3: typecheck ✓, format ✓, `npm test` 1200 ✓, `test:e2e` 3 PASS.
- Phase 2: typecheck ✓, format ✓, `npm test` 1194 ✓. Tests pinned to schema v3 now expect v4
  (newer-version cases use 5).
