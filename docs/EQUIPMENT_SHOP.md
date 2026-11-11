# Equipment, Shop and Gold Coins (Task 11)

Spec: [task-11-equipment-shop.md](task-11-equipment-shop.md) · progress:
[task-11-progress.md](task-11-progress.md). All numbers below are **provisional** (owner-controlled,
alpha) and live in two config files: `src/equipment/config.ts` (items) and
`src/equipment/economy.ts` (coins).

Meta loop: collect coins in a campaign run → buy gear in «Магазин» → equip it on the Character
screen → the next run starts with the stronger attributes.

## 1. Slots, items, tiers

- 4 slots per class: «Оружие» (class-specific), «Броня», «Амулет», «Кольцо» (shared). Each class has
  its own loadout; an owned shared item can be worn by every class at once.
- Starter weapons (`starter_sword`, `starter_daggers`, `starter_bow`, `starter_staff`) are tier 0,
  give no bonus, are always owned (never stored in `ownedItems`, never sold) and are the default
  weapon. Unequipping a weapon returns the starter weapon; other slots become empty.
- 17 templates × 5 tiers = **85 shop items**, ids `<template>-t<tier>` (e.g. `plate-t3`). Names:
  tier adjective agreeing with the template's gender + the template name («Редкий тяжёлый меч»,
  «Легендарная мантия»).

| Tier | Name        | Stat × | Price (weapon ×1.25) | In the shop after map | Colour    |
| ---- | ----------- | ------ | -------------------- | --------------------- | --------- |
| 1    | Обычный     | ×1     | 80 (100)             | from the start        | `#c9c9c0` |
| 2    | Добротный   | ×2     | 300 (375)            | 8                     | `#7fc77a` |
| 3    | Редкий      | ×3.5   | 700 (875)            | 16                    | `#6fa8e8` |
| 4    | Эпический   | ×5     | 1400 (1750)          | 24                    | `#b67ae6` |
| 5    | Легендарный | ×7     | 2500 (3125)          | 32                    | `#f0b54a` |

Tier-1 base values: physical / magical damage +4%, max HP +5%, resistance +2, crit chance +1 p.p.,
crit damage +5 p.p., attack speed +2, dodge +1 p.p., movement speed +2%, cooldown reduction +1 p.p.,
area size +2%. Weapons: first stat ×1.0, second ×0.6.

| Slot           | Templates (stats)                                                                          |
| -------------- | ------------------------------------------------------------------------------------------ |
| Warrior weapon | Тяжёлый меч (phys dmg, crit dmg); Быстрый меч (attack speed, crit chance)                  |
| Rogue weapon   | Кинжал убийцы (crit chance, crit dmg); Кинжал теней (phys dmg, dodge)                      |
| Archer weapon  | Длинный лук (phys dmg, crit dmg); Короткий лук (attack speed, movement speed)              |
| Mage weapon    | Посох пламени (magic dmg, area size); Посох мудрости (CDR, magic dmg)                      |
| Armor          | Латы (max HP, resistance); Кожаный доспех (dodge, movement speed); Мантия (CDR, area size) |
| Amulet         | Амулет силы (phys dmg); Амулет магии (magic dmg); Амулет жизни (max HP)                    |
| Ring           | Кольцо точности (crit chance); Кольцо ярости (crit dmg); Кольцо скорости (attack speed)    |

Examples: «Обычные латы» max HP +5%, resistance +2 (80 Gold); «Легендарный тяжёлый меч» physical
damage +28%, crit damage +21 p.p. (3125 Gold).

The shop tier unlock reads the **highest cleared map** (`completedMaps`), not the highest unlocked
one. `validateEquipmentConfig()` runs at startup (unique ids, 85 items, known stats, positive
prices, increasing tiers).

## 2. API

- `src/equipment/items.ts`: `SHOP_ITEMS`, `STARTER_ITEMS`, `getItem` / `findItem`, `starterWeapon`,
  `isEligible(item, class, slot)`.
- `src/equipment/logic.ts` (pure): `checkPurchase` → `ok` or a reason (`unknown`, `starter`,
  `owned`, `locked`, `gold`), `purchase` (Gold − price and ownership in one result; throws
  `EquipmentError`), `equip` (`not-owned`, `not-eligible`), `unequip`, `highestClearedMap`,
  `isTierUnlocked`, `isOwned`, `defaultLoadout(s)`.
- `src/equipment/stats.ts`: `gearModifiers(loadout)`, `addModifiers`, `validateLoadout`,
  `permanentStats(class, level, talents, loadout | null)` (Character screen).
- `src/profile/equipment.ts`: `buyItem`, `equipItem`, `unequipSlot` on a `PlayerProfile`;
  `campaignStore.buyItem / equipItem / unequipSlot` save each action with one validated write (a
  failed write keeps the old profile).

## 3. Stat integration

Gear produces `RunStatModifiers` (named after their keys, plus the new additive
`areaSizePercent`) that are added to the talent layer (`permanentModifiers`) at world creation.
`composeRunStats` applies all layers once and the central caps once (crit chance 75, dodge 60, CDR
50, attack speed 300, movement 200); gear never stores final stats and never changes Combat Core
rules. The Warrior's off-hand sword talent uses `physicalDamage`, which already includes gear.
Changes apply from the next run (`GameplayOptions.equipment.loadout` is read only at world start).

## 4. Gold coins in runs

Coins are pickups in campaign runs only (sandbox runs drop none). They use the crystal magnet rules
(same pickup radius), have their own pile cap of 256 (at the cap a new drop merges into the
nearest pile; nothing is lost), merge per 64-unit cell, and use their own seeded RNG stream
(`coins`). A drop happens inside the once-per-death reward block, so a death drops at most once.

| Rule                    | Value (provisional)                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coin target of a map    | 60% of its Task 10 victory Gold (map 1: 45, 10: 180, 20: 270, 40: 450)                                                                                |
| Boss                    | one pile = 20% of the coin target (map 1: 9, 10: 36, 40: 90)                                                                                          |
| Elites                  | all elites of the map together = 20% of the target (map 1: 2 each)                                                                                    |
| Normal enemy            | a pile of 1 × map scale (map 1: 1, 10: 4, 40: 10); chance = the other 60% of the target over the expected kills (map 1: ≈ 0.96%, maps 10–40: ≈ 0.37%) |
| Map scale               | victoryGold(map) / victoryGold(1)                                                                                                                     |
| Victory                 | all collected coins + bonus 40% of the victory Gold (map 1: 30)                                                                                       |
| Defeat                  | ⌊50% of the collected coins⌋, no bonus                                                                                                                |
| Abandoned / reload      | nothing                                                                                                                                               |
| Piles left at a victory | collected automatically (see below)                                                                                                                   |

On a victory, every pile still on the ground is collected. The boss of every map appears when the
timer ends (owner decision in the Task 11 review; it was 10:00 on all maps), so the map is won the
moment the boss dies and its pile could never be picked up otherwise. A defeat does not collect
the remaining piles. The income table below was measured with this rule (every bot victory ended
1–4 s after the timer).

Gold enters the profile exactly once, in the same `applyRunResult` as the XP (`RunResult.coins`,
validated whole number ≥ 0; the existing run-ID deduplication prevents double Gold after reload or a
repeated result). HUD: «◎ N» (coins this run). Results: «Монеты», «Бонус за победу», «Золото».

### 4.1 Income measurement (6.1)

Bot runs on the accelerated simulation (`update(0.1)` loop, no rendering), seeds 1–3 (8 runs per map:
all 4 classes on seed 1, Warrior and Mage on seeds 2 and 3), class level 50 with the talent build. The bot fights in place and walks to the nearest coin / XP pile within 500 units. A
run that wins in this build is effectively a full clear: it kills ≈ 4.7 × spawnRate × duration
normal enemies (map 1: ≈ 2500, maps 10–40: ≈ 7300; `COIN_RULES.killsPerSpawnSecond`). The normal drop
chance of a map spreads 27 piles (60% of the coin target ÷ the pile value) over that expected kill
count, so every won map gives ≈ 27 normal piles on average.

| Map | Coin target (60%) | Victories | Normal kills (avg) | Coins min–max | Coins avg | % of target | Gold per victory (avg, + bonus) | Task 10 victory Gold |
| --- | ----------------- | --------- | ------------------ | ------------- | --------- | ----------- | ------------------------------- | -------------------- |
| 1   | 45                | 8 / 8     | 2534               | 40–48         | 43.5      | 97%         | 73.5 (+30)                      | 75                   |
| 10  | 180               | 8 / 8     | 7285               | 171–211       | 189       | 105%        | 309 (+120)                      | 300                  |
| 20  | 270               | 8 / 8     | 7318               | 260–320       | 288.5     | 107%        | 468.5 (+180)                    | 450                  |
| 40  | 450               | 8 / 8     | 7299               | 428–528       | 473       | 105%        | 773 (+300)                      | 750                  |

Not measured: weaker human runs that win without a full clear collect fewer normal piles (the boss,
elite piles and the 40% bonus are fixed); the bots at the recommended level (class level = map
number, no talents) died on maps 1–20, so they gave no victory data.

## 5. Save

Schema v4 (`migrateV3toV4`): `ownedItems: []` and each class's `loadout` (starter weapon, other
slots empty); Gold, XP, levels, maps and talents unchanged. Validation (`normalizeProfile`): owned
ids known, buyable and unique; loadout ids known, in the right slot, eligible for the class, owned
(or the class's starter); weapon never empty; a missing loadout → default. An invalid import never
overwrites a valid save; export / import, backup and bug reports include gear.

## 6. Debug (DEV / QA build only)

«DEV · Тестирование» → «Gear Debug»: «Открыть все предметы», «Лучшее снаряжение (класс)» (tier 5,
the first template per slot; the Mage gets «Амулет магии»). Gold: the existing «Debug золото» + «Выдать золото».
«Отладка забега» shows «Монеты · в минуту». None of this is in the normal production build
(`test:production` checks the markers).

## 7. Verification and limits

- Tests: `tests/equipment/` (`npm run test:equipment`), `tests/persistence/gear-save`,
  `gear-run-start`, `coins-reward`, `shop-store`, `tests/gameplay/coins.test.ts`; e2e
  `campaign-browser.mjs` (buy «Обычные латы», equip, results rows).
- Not verified: income of human players (only bots, see 4.1), balance of tiers 2–5 against the
  late maps, the shop on small phone screens.
- Out of scope (spec): selling, crafting, sockets, loot drops, new stats or weapon behaviours.
