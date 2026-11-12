# Equipment, Shop and Gold Coins (Task 11)

Spec: [task-11-equipment-shop.md](task-11-equipment-shop.md) · progress:
[task-11-progress.md](task-11-progress.md). All numbers below are **provisional** (owner-controlled,
alpha) and live in two config files: `src/equipment/config.ts` (items) and
`src/equipment/economy.ts` (coins).

Meta loop: collect coins in a campaign run → buy gear in «Магазин» → equip it on the Character
screen → the next run starts with the stronger attributes.

## 1. Slots, items, tiers

- 4 slots per class: «Оружие» (class-specific), «Броня», «Амулет», «Кольцо» (shared) — **Task 19
  adds «Шлем», «Перчатки», «Штаны» (7 slots, 130 items; see §8)**. Each class has
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

Schema v4 (`migrateV3toV4`; Task 19 → v5, see §8.5): `ownedItems: []` and each class's `loadout` (starter weapon, other
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

## 8. Task 19 — new slots, ore («Руда»), upgrades («Кузница»)

Spec: [task-19-gear-upgrades-ore.md](task-19-gear-upgrades-ore.md) · progress:
[task-19-progress.md](task-19-progress.md). All numbers are **provisional** (owner-controlled) and
live in `src/equipment/config.ts` (slots, templates), `src/equipment/economy.ts` (`ORE_RULES`) and
`src/equipment/upgrades.ts` (`UPGRADE_RULES`).

### 8.1 Slots and items

7 slots, in this order: «Оружие», «Шлем», «Броня», «Перчатки», «Штаны», «Амулет», «Кольцо». The
new slots are shared by all classes (like armor). Their templates have two stats: first ×1.0,
second ×0.6 of the tier-1 base (`SECOND_STAT_REDUCED_SLOTS`: weapon + the three new slots; Task 11
armor keeps ×1.0 / ×1.0). Tiers, multipliers, unlocks and prices are those of the other non-weapon
items (80 / 300 / 700 / 1400 / 2500). 26 templates × 5 tiers = **130 shop items**.

| Slot     | Templates (stats, tier 1)                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Шлем     | Шлем стража `guard_helm` (HP +5%, res +1.2); Капюшон охотника `hunter_hood` (crit +1, dodge +0.6); Венец мага `mage_circlet` (CDR +1, magic +2.4%)                         |
| Перчатки | Латные рукавицы `plate_gauntlets` (phys +4%, res +1.2); Перчатки ловкача `trickster_gloves` (AS +2, crit +0.6); Перчатки чародея `sorcerer_gloves` (magic +4%, area +1.2%) |
| Штаны    | Латные поножи `plate_greaves` (HP +5%, res +1.2); Кожаные штаны `leather_pants` (move +2%, dodge +0.6); Шаровары мистика `mystic_trousers` (CDR +1, HP +3%)                |

UI: the paper doll shows helmet / armor / gloves left and amulet / ring / pants right of the
figure, the weapon across the bottom (phones ≤ 760 px: two columns, no figure). Shop tabs and the
equipment filters list all 7 slots.

### 8.2 Ore

Victory only: `2 + ⌊mapId / 4⌋`; the **first** victory on a map (map not yet in `completedMaps`)
pays ×3. Defeat / abandoned: 0. Credited by `applyRunResult` in the same snapshot as XP and Gold
(run-ID deduplication: a repeated result or a reload never pays twice). Shown next to Gold in the
menu top bar (hub, shop, forge — every menu page), in the forge header and as «Руда» on the results
screen.

| Map | Victory | First victory (×3) |
| --- | ------- | ------------------ |
| 1–3 | 2       | 6                  |
| 4   | 3       | 9                  |
| 8   | 4       | 12                 |
| 12  | 5       | 15                 |
| 16  | 6       | 18                 |
| 20  | 7       | 21                 |
| 24  | 8       | 24                 |
| 32  | 10      | 30                 |
| 40  | 12      | 36                 |

First victories on all 40 maps give 810 ore together.

### 8.3 Upgrades (forge)

Every owned item (weapons included; starter weapons excluded) has one account-wide level +0…+10
(`profile.itemLevels`; items are account-wide unlocks, so every class wearing it gets the level).
Each level adds +5% of the item's base stats (+5 = ×1.25, +10 = ×1.5; values rounded to 3
decimals). An upgrade **always** succeeds: no randomness, no failure, no downgrade.

Cost of reaching level L: Gold = ⌈price × 0.1 × L⌉ (rounded up: the half-Gold steps of 375 / 875 /
1750 / 3125 weapons), Ore = ⌈tier × L / 2⌉. To +10 in total: 5.5 × price Gold.

| Item price (tier) | Gold per level +1 … +10                                          | Gold to +10 |
| ----------------- | ---------------------------------------------------------------- | ----------- |
| 80 (t1)           | 8 / 16 / 24 / 32 / 40 / 48 / 56 / 64 / 72 / 80                   | 440         |
| 100 (t1 weapon)   | 10 / 20 / … / 100                                                | 550         |
| 300 (t2)          | 30 / 60 / 90 / 120 / 150 / 180 / 210 / 240 / 270 / 300           | 1650        |
| 700 (t3)          | 70 / 140 / … / 700                                               | 3850        |
| 1400 (t4)         | 140 / 280 / … / 1400                                             | 7700        |
| 2500 (t5)         | 250 / 500 / … / 2500                                             | 13750       |
| 3125 (t5 weapon)  | 313 / 625 / 938 / 1250 / 1563 / 1875 / 2188 / 2500 / 2813 / 3125 | 17190       |

| Tier | Ore per level +1 … +10                       | Ore to +10 |
| ---- | -------------------------------------------- | ---------- |
| 1    | 1 / 1 / 2 / 2 / 3 / 3 / 4 / 4 / 5 / 5        | 30         |
| 2    | 1 / 2 / 3 / 4 / 5 / 6 / 7 / 8 / 9 / 10       | 55         |
| 3    | 2 / 3 / 5 / 6 / 8 / 9 / 11 / 12 / 14 / 15    | 85         |
| 4    | 2 / 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20  | 110        |
| 5    | 3 / 5 / 8 / 10 / 13 / 15 / 18 / 20 / 23 / 25 | 140        |

Forge screen («Кузница»: menu nav after «Магазин», hub tile, «В кузницу» in the Equipment item
preview): owned upgradeable items with a slot filter (equipped first) and level pips; the selected
item's level, current vs next stats, Gold + ore cost (red when short) and «Улучшить до +N»
(disabled with the reason: «Не хватает золота / руды», «Предмет уже улучшен до +10»). Item names show
the level everywhere: «Обычное кольцо точности +3» (forge, equipment, shop, character cards).

### 8.4 API and stat integration

- `src/equipment/upgrades.ts` (pure): `UPGRADE_RULES`, `upgradeCost(item, L)`,
  `upgradedStats(item, level)`, `itemDisplayName`, `checkUpgrade` → `ok` or `unknown` / `starter` /
  `not-owned` / `max` / `gold` / `ore`, `upgradeItem(state, id)` (Gold, ore and the level in one
  new state; throws `UpgradeError`, unchanged), `validateItemLevels`.
- `src/equipment/economy.ts`: `ORE_RULES`, `runOre(outcome, mapId, firstVictory)`.
- `loadoutStats(loadout, levels?)`, `gearModifiers(loadout, levels?)`,
  `permanentStats(class, level, talents, loadout, levels?)` — additive optional parameter (absent =
  +0, the Task 11 behaviour).
- Runs: `GameplayOptions.equipment.itemLevels` (validated at world start, read once) →
  `gearModifiers` → the talent+gear layer → `composeRunStats` (central caps once). Combat Core
  rules are unchanged.
- `src/profile/equipment.ts`: `upgradeProfileItem`; `campaignStore.upgradeItem(id)` saves once (a
  failed write keeps the old profile); `campaignStore.openForge(id)`.

### 8.5 Save v5

`migrateV4toV5`: `ore: 0`, `itemLevels: {}`, and every class loadout gains empty `helmet`,
`gloves`, `pants`. Nothing else changes. Validation: ore is a whole number ≥ 0; item levels are
whole numbers 0–10 of owned, upgradeable items (0 is accepted and not kept); new-slot items must be
known, in the right slot and owned. Recent runs store the run's ore (`ore`, optional). An invalid
import never overwrites a valid save; export / import, the backup copy and bug reports include the
new fields.

### 8.6 Debug (DEV / QA build only)

«Снаряжение и магазин»: «Открыть все предметы» (all 130), «Лучшее снаряжение» (tier 5 in all 7
slots; the Mage gets the magic helmet / gloves / pants), «Выдать руду», item + level (+0…+10) →
«Установить уровень предмета». Not in the production build.

### 8.7 Verification and limits

- Tests: `tests/equipment/slots.test.ts`, `upgrades.test.ts`; `tests/persistence/ore-reward`,
  `forge-store`, `save-v5`; e2e: `campaign-browser.mjs` (7 shop tabs, ore after the first Map 1 win,
  «В кузницу» → upgrade → «+1», «Руда» results row) and `mobile-browser.mjs` (forge page and
  upgrade by touch at 844×390 and 768×1024, no horizontal scroll).
- Not verified: the ore / upgrade economy against real play (no bot measurement — e.g. first
  victories on all 40 maps give 810 ore, a tier-5 item to +10 needs 140); how +10 gear affects late
  maps; the forge on real phones (emulated Chromium only).
