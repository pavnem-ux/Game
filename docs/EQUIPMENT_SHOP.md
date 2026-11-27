# Equipment, Shop and Gold Coins (Task 11 → Task 40 items model)

Specs: [task-40-items-model.md](task-40-items-model.md) (items rework part 1/4, current model) ·
[task-11-equipment-shop.md](task-11-equipment-shop.md) (coins; its tiered items are replaced) ·
progress: [task-40-progress.md](task-40-progress.md). All numbers below are **provisional**
(owner-controlled) and live in `src/equipment/config.ts` (items, shop) and
`src/equipment/economy.ts` (coins, ore).

Meta loop: collect coins in a campaign run → buy item instances in the Shop → equip them on the
Equipment screen → the next run starts with the stronger attributes.

> Task 40 replaced the Task 11 / 19 tiered catalogue (130 fixed items, tier unlocks by cleared map,
> the Forge item upgrades +0…+10). Sections §1–§3, §5–§7 describe the Task 40 model; §4 (coins) and
> §8.2 (Ore) still apply; the rest of §8 is kept as history.

## 1. Item instances (Task 40)

An owned item is an **instance** (`ItemInstance`, `src/equipment/items.ts`): `uid` (`i<n>`, from the
profile's `nextItemNumber`), `slot` (7 slots: weapon, helmet, armor, gloves, pants, amulet, ring),
`characterClass` (weapons only — a weapon fits its class only; the other slots are shared),
`itemLevel` 1–50, `rarity`, `affixes` (rolled secondary stats) and `legendaryId` (reserved for
Task 43, unused). Two items of the same slot, level and rarity can differ by their rolls.

- Starter weapons (`starter_sword`, `starter_daggers`, `starter_bow`, `starter_staff`) are item
  level 1, Common, no secondary stats, always owned, never stored in `items`; unequipping a weapon
  returns the starter weapon, other slots become empty.
- **Equipping needs class level ≥ item level** (`equipBlock` → `level`; the UI shows «Needs class
  level N»). One instance may be equipped by several classes at once (shared slots).

| Rarity    | Secondary stats | Main stat × | Roll range (share of the level's maximum) | Colour    |
| --------- | --------------- | ----------- | ----------------------------------------- | --------- |
| Common    | 0               | ×1          | —                                         | `#c9c9c0` |
| Uncommon  | 1               | ×1.05       | fixed 75%                                 | `#7fc77a` |
| Rare      | 2               | ×1.1        | 60–100%                                   | `#6fa8e8` |
| Epic      | 3               | ×1.15       | 70–100%                                   | `#b67ae6` |
| Legendary | 3 (+ Task 43)   | ×1.2        | 80–100%                                   | `#f0b54a` |

### 1.1 Main stats (flat, whole numbers)

L = item level; values before the rarity factor, rounded after it (`mainStats`). Damage is of the
wearer's class damage type (magical for the Mage, physical for the others).

| Slot   | Main stat                             |
| ------ | ------------------------------------- |
| Weapon | damage 4 + L                          |
| Gloves | damage 0.4 × weapon                   |
| Ring   | damage 0.25 × weapon                  |
| Armor  | max HP 10 + 2.5L, resistance 2 + 0.6L |
| Helmet | max HP 0.6 × armor                    |
| Amulet | max HP 0.4 × armor                    |
| Legs   | resistance 1.2 × armor                |

Examples: Common armor L12 = +40 max HP, +9 resistance; Common weapon L10 = +14 damage; Legendary
legs L50 = +46 resistance.

### 1.2 Secondary stats

Maximum at item level L = max × (0.3 + 0.7 × (L − 1) / 49) (30% at L1, 100% at L50), rounded to the
stat's decimals. Each slot has a pool of 6 (`SLOT_AFFIX_POOLS`); an item draws distinct stats.

| Stat (suffix)                                     | Max at L50                    | Pools                        |
| ------------------------------------------------- | ----------------------------- | ---------------------------- |
| Physical / Magic damage % (of Power / of Sorcery) | 18%                           | weapon (class damage %)      |
| Damage % (of Might)                               | 12%                           | gloves, ring, amulet, armor  |
| Attack speed (of Speed)                           | 10                            | weapon, gloves               |
| Crit chance (of Precision)                        | 6 pp                          | weapon, gloves, ring         |
| Crit damage (of Fury)                             | 25 pp                         | weapon, gloves, ring         |
| Cooldown reduction (of Haste)                     | 5 pp                          | weapon, ring, amulet, helmet |
| Elite & boss damage (of the Slayer)               | 15%                           | weapon, gloves               |
| Area size (of Reach)                              | 12%                           | gloves, amulet, armor        |
| Max HP % (of Life)                                | 12%                           | amulet, helmet, armor, legs  |
| HP regen (of Renewal)                             | 0.5% max HP/s                 | helmet, armor, legs          |
| Dodge (of Evasion)                                | 4 pp                          | helmet, armor, legs          |
| Movement speed (of the Wind)                      | 8%                            | armor, legs                  |
| Pickup radius (of Gathering)                      | 25%                           | amulet, helmet, legs         |
| Run XP (of Insight)                               | 10%                           | ring, amulet, helmet         |
| Gold find (of Fortune)                            | 8% (gear total capped at 25%) | ring, legs                   |

The exact pools are in `SLOT_AFFIX_POOLS`. Random items (`generateItem`) draw from a seeded
stream; the DEV / QA grant is seeded by the profile's shop salt and next uid (same state → same
item).

### 1.3 Names and icons

The base name and icon come from the slot's **item-level band** (`SHARED_BANDS`, `WEAPON_BANDS`;
the 26 Task 11 / 19 templates keep their art): shared slots L1–15 / 16–32 / 33–50 (e.g. armor
Robe → Leather Armor → Plate Armor), weapons L1–24 / 25–50 (e.g. Quick Sword → Heavy Sword).
Common items have the base name only; other rarities add the suffix of their strongest roll
relative to its maximum («Sorcerer's Gloves of Speed»).

## 2. Shop (Task 40)

Per class, a **derived** stock at item level = the class level (`shopStock(salt, class, level)`):
for each slot one Common and three Uncommon offers with three different stats from the slot's pool
(28 offers; the weapon offers are the class's weapon). The draw is seeded from the profile's
`shopSalt` (FNV of the profile id), the class and the level, so it is the same after a reload and
new after a level-up. A bought offer is recorded in `shopBought[class] = { level, offers }` and is
gone until the class levels up (then the record resets). Bought items join the profile's shared
`items`.

Price = round(base × (1 + L / 5)), base Common 40, Uncommon 60, weapons ×1.25 (L1 Common armor 48,
L12 136; L50 Uncommon weapon 825).

UI: Shop → slot tabs (+ Pets) and «Stock for» class selector; each offer shows name, rarity, item
level, main and secondary stats and «Buy · Gold N» with a confirmation (one validated save). Refusals:
not enough Gold, already bought at this level, offer gone.

## 3. Stat integration

`gearModifiers(loadout, items, class)` turns the equipped instances into `RunStatModifiers`:
main stats as the additive flats `flatPhysicalDamage` / `flatMagicalDamage` / `flatMaxHp` and
`resistance`, secondary stats as their percent / point keys. They join the talent layer
(`permanentModifiers`) at world creation; `composeRunStats` adds the flats to the class attributes
**before** every percent modifier and applies the central caps once (crit chance 75, dodge 60, CDR
50, attack speed 300, movement 200). Five run stats are new:

- **Elite & boss damage %** — the player's direct hits on elites and the boss
  (`GameplayWorld.targetDamageScale` via the SkillEngine host).
- **HP regen** — healing of current max HP per second in the control step, carried to whole HP
  through `core.heal`; never revives, nothing banked at full HP.
- **Pickup radius %** — multiplies the crystal / coin magnet (with the pet's).
- **Run XP %** — bonus XP on collected crystals (`RunExperience.setBonusPercent`, carried, no XP
  lost).
- **Gold find %** — added to the coin bonus percent (gear total capped at 25%).

Changes apply from the next run (`GameplayOptions.equipment = { loadout, items }`, validated and
read only at world start).

## 4. Gold coins in runs

Coins are pickups in campaign runs only (sandbox runs drop none). They use the crystal magnet rules
(same pickup radius), have their own pile cap of 256 (at the cap a new drop merges into the
nearest pile; nothing is lost), merge per 64-unit cell, and use their own seeded RNG stream
(`coins`). A drop happens inside the once-per-death reward block, so a death drops at most once.

| Rule                    | Value (provisional)                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Coin target of a map    | 60% of its victory Gold (Task 40, Gold ×0.8 — map 1: 36, 10: 144, 20: 216, 40: 360)                                                                          |
| Boss                    | one pile = 20% of the coin target (map 1: 7, 10: 29, 40: 72)                                                                                                 |
| Elites                  | all elites of the map together = 20% of the target (map 1: 2 each)                                                                                           |
| Normal enemy            | a pile of 1 × map scale (map 1: 1, 10: 4, 40: 10); chance = the other 60% of the target over the expected kills (Task 40: map 1 ≈ 0.77%, maps 10–40 ≈ 0.30%) |
| Map scale               | victoryGold(map) / victoryGold(1)                                                                                                                            |
| Victory                 | all collected coins + bonus 40% of the victory Gold (map 1: 24, map 40: 240)                                                                                 |
| Defeat                  | ⌊50% of the collected coins⌋, no bonus                                                                                                                       |
| Abandoned / reload      | nothing                                                                                                                                                      |
| Piles left at a victory | collected automatically (see below)                                                                                                                          |

On a victory, every pile still on the ground is collected. The boss of every map appears when the
timer ends (owner decision in the Task 11 review; it was 10:00 on all maps), so the map is won the
moment the boss dies and its pile could never be picked up otherwise. A defeat does not collect
the remaining piles. The income table below was measured with this rule (every bot victory ended
1–4 s after the timer).

Gold enters the profile exactly once, in the same `applyRunResult` as the XP (`RunResult.coins`,
validated whole number ≥ 0; the existing run-ID deduplication prevents double Gold after reload or a
repeated result). HUD: «◎ N» (coins this run). Results: «Монеты», «Бонус за победу», «Золото».

### 4.1 Income measurement (6.1)

Measured in Task 11, **before** Task 40's Gold ×0.8 (`GOLD_SCALE`); every Gold value below is
×0.8 today (not re-measured).

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

## 5. Save (v10)

Task 40 `migrateV9toV10` (items-rework rule): **equipment resets, everything else is kept**. The
old `ownedItems` / `itemLevels` are dropped, every class's loadout becomes the default (starter
weapon, other slots empty), and the profile gains `items: []`, `nextItemNumber: 1`,
`shopSalt` (FNV of the profile id) and `shopBought: {}`. Class XP that already pays for the next
level on the new XP curve is clamped to cost − 1 (levels never change). Gold, Ore, maps, runs,
talents, pets and quests are unchanged.

Validation (`normalizeProfile`): every item passes `validateItem` (shape, slot / class, level 1–50,
rarity, stat count by rarity, stats from the slot pool without duplicates, values within the
level's range); uids `i<n>` are unique, below `nextItemNumber` and never a starter id; loadouts
reference owned uids (or the class's starter weapon) in the right slot, eligible for the class, at
an item level ≤ the class level; the weapon slot is never empty; `shopBought` has known classes,
levels 1–50 and unique offer ids. An invalid import never overwrites a valid save; export / import,
backup and bug reports include the items.

## 6. Debug (DEV / QA build only)

«DEV · Testing» → «Gear Debug»: «Grant item» (class, slot, rarity, item level), «Legendary set at
class level» (grants and equips a Legendary item in every slot at the class level), «Grant Ore».
Gold: «Debug gold» + «Grant Gold». None of this is in the normal production build
(`test:production` checks the markers).

## 7. Verification and limits

- Tests: `tests/equipment/items-model.test.ts` (main stats, secondary stats, generation, names,
  validation, shop stock, gear pipeline, Gold-find cap), `tests/gameplay/gear-run-stats.test.ts`
  (the five run stats), `tests/persistence/save-v10`, `shop-store`, `gear-run-start`,
  `coins-reward`, `tests/gameplay/coins.test.ts`; e2e `campaign-browser.mjs` (buy the L12 Common
  armor, the offer is gone, equip by uid, pet-only forge) and `mobile-browser.mjs` (equip by touch).
- Not verified: balance of the new numbers in real play (no bot measurement for Task 40); the
  Gold-find cap is not reachable by today's pools (2 slots × 8%) and guards later sources.
- Out of scope (Task 41–43): the bag screen, selling, drops, Legendary effects.

## 8. Task 19 — new slots, ore («Руда»), upgrades («Кузница») — history

> Task 40: only §8.2 (Ore) still applies. The tiered items (§8.1), the Forge item upgrades
> (§8.3–§8.4), save v5 fields `itemLevels` (§8.5) and their debug tools (§8.6) are **replaced** by the
> Task 40 model (§1–§6); the Forge now upgrades pets only.

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
