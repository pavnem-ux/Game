# Task 40 — Item model and progression balance (items rework, part 1 of 4)

Follow `docs/TASK_WORKFLOW.md`, with one change: this task is part of the **items rework**, which lands in
`main` all at once later.

- **Integration branch `items-rework`.** If it does not exist, create it from the latest `main` and push it. If it
  exists, merge the latest `main` into it first and push.
- **Branch `task-40-items-model`** from `items-rework`. Open the draft PR **into `items-rework`**, not `main`.
- Production (`main`) and players' saves on production are not touched by this task.

All numbers are provisional (owner-controlled). Keep every new number in one config place per module, like
`TIER_CONFIG` / `COIN_RULES` today. All player-facing text in English.

## Goal

Gear becomes the main source of power. Items get an **item level** (1–50) and a **rarity**. Rarity decides how many
secondary stats an item has. Class levels give much less power than today. This task builds the item model, the
stat pipeline, the shop for Common and Uncommon, and the balance changes. The bag screen, slot upgrades (Task 41),
drops / salvage / reforge (Task 42) and Legendary effects (Task 43) come later. After this task the game must be
fully playable: buy gear in the shop, equip it, run maps.

## Spec

### 1. Item instances

- Items become **instances** (random rolls make two items of the same kind different): `uid`, `base` (slot +
  class for weapons), `itemLevel` 1–50, `rarity`, `affixes` (list of `{stat, value}`), `legendaryId?` (unused until
  Task 43).
- The profile keeps an account-wide list of owned instances. Each class's loadout references instance `uid`s per
  slot, as it references item ids today. An instance may be equipped by several classes at once (as today).
- Equipping needs **class level ≥ item level**. Weapons stay class-only. The weapon slot can never be empty: every
  class keeps its starter weapon (item level 1, Common, no affixes).
- **One item kind per slot; its look follows the item level.** Stats depend only on slot, level and rarity. The
  name and icon come from the existing gear templates (and their art), picked by item-level band — see §1a.
- Remove the old 5-tier items (130 shop items), their tiers and stat values. Keep the 26 templates'
  ids, names and icons for §1a. Remove the Forge (+0…+10 item levels, its
  screen and its rules). Ore stays as a currency (used again in Task 41).

### 1a. Names and icons

An item's display name = `<band base> of <suffix>`, e.g. «Plate Gauntlets of Fury». Rarity is shown by colour and a
rarity label, not in the name. Common items have no suffix («Plate Gauntlets»). The icon is the existing template
art of the band base.

**Band base by item level** (reuses the 26 existing templates and their icons):

| Slot     | Levels 1–15                             | Levels 16–32                          | Levels 33–50                        |
| -------- | --------------------------------------- | ------------------------------------- | ----------------------------------- |
| Helm     | Hunter's Hood (`hunter_hood`)           | Mage's Circlet (`mage_circlet`)       | Guard's Helm (`guard_helm`)         |
| Armor    | Robe (`robe`)                           | Leather Armor (`leather_armor`)       | Plate Armor (`plate`)               |
| Gloves   | Trickster's Gloves (`trickster_gloves`) | Sorcerer's Gloves (`sorcerer_gloves`) | Plate Gauntlets (`plate_gauntlets`) |
| Leggings | Leather Trousers (`leather_pants`)      | Mystic's Breeches (`mystic_trousers`) | Plate Greaves (`plate_greaves`)     |
| Amulet   | Simple Amulet (`amulet_life`)           | Runed Amulet (`amulet_magic`)         | Royal Amulet (`amulet_power`)       |
| Ring     | Iron Ring (`ring_speed`)                | Silver Ring (`ring_precision`)        | Gold Ring (`ring_fury`)             |

| Class weapon | Levels 1–24                     | Levels 25–50                          |
| ------------ | ------------------------------- | ------------------------------------- |
| Warrior      | Quick Sword (`quick_sword`)     | Heavy Sword (`heavy_sword`)           |
| Rogue        | Shadow Dagger (`shadow_dagger`) | Assassin's Dagger (`assassin_dagger`) |
| Archer       | Shortbow (`short_bow`)          | Longbow (`long_bow`)                  |
| Mage         | Wisdom Staff (`wisdom_staff`)   | Flame Staff (`flame_staff`)           |

Starter weapons keep their names and icons («Novice's Sword» etc.).

**Suffix** = the secondary stat whose roll is highest relative to its maximum (ties: first in pool order):

| Stat                | Suffix        | Stat           | Suffix       |
| ------------------- | ------------- | -------------- | ------------ |
| Physical damage %   | of Power      | Area size      | of Reach     |
| Magic damage %      | of Sorcery    | Max HP %       | of Life      |
| Damage %            | of Might      | HP regen       | of Renewal   |
| Attack speed        | of Speed      | Dodge          | of Evasion   |
| Crit chance         | of Precision  | Movement speed | of the Wind  |
| Crit damage         | of Fury       | Pickup radius  | of Gathering |
| Cooldown reduction  | of Haste      | Run XP         | of Insight   |
| Elite & boss damage | of the Slayer | Gold find      | of Fortune   |

### 2. Rarity

| Rarity    | Secondary stats              | Main stat × | Roll range of each secondary |
| --------- | ---------------------------- | ----------- | ---------------------------- |
| Common    | 0                            | 1.00        | —                            |
| Uncommon  | 1                            | 1.05        | fixed 75% (shop)             |
| Rare      | 2                            | 1.10        | 60–100%                      |
| Epic      | 3                            | 1.15        | 70–100%                      |
| Legendary | 3 (+ unique effect, Task 43) | 1.20        | 80–100%                      |

Rare and higher only come from drops (Task 42). This task needs their generation rules and a DEV/QA hook to grant a
random item of a chosen slot, rarity and item level, so they can be tested now.

### 3. Main stats (flat), L = item level

| Slot     | Main stat                                                                                      | Formula (Common)                    |
| -------- | ---------------------------------------------------------------------------------------------- | ----------------------------------- |
| Weapon   | Flat damage of the class damage type (physical for Warrior / Rogue / Archer, magical for Mage) | 4 + 1.0·L                           |
| Gloves   | Flat damage of the class damage type                                                           | 40% of the weapon value             |
| Ring     | Flat damage of the class damage type                                                           | 25% of the weapon value             |
| Armor    | Flat max HP + flat resistance                                                                  | HP 10 + 2.5·L; resistance 2 + 0.6·L |
| Helm     | Flat max HP                                                                                    | 60% of the Armor HP                 |
| Amulet   | Flat max HP                                                                                    | 40% of the Armor HP                 |
| Leggings | Flat resistance                                                                                | 120% of the Armor resistance        |

Multiply by the rarity's main-stat factor and round to whole numbers. Flat damage adds to `physicalDamage` /
`magicalDamage`, flat HP to `maxHp`, resistance to `resistance`. Add these as **flat** gear modifiers in the
attribute pipeline, applied before percent modifiers and before the central caps (one composition, as today).

### 4. Secondary stats

Value = `max × (0.3 + 0.7·(L − 1)/49) × roll`. Round to 1 decimal (HP regen: 2 decimals). One stat appears at most
once per item. Draw stats and rolls from a seeded stream (a new `items` stream).

| Stat                                   | Max at L50         | Weapon | Gloves | Ring | Amulet | Helm | Armor | Leggings |
| -------------------------------------- | ------------------ | :----: | :----: | :--: | :----: | :--: | :---: | :------: |
| Physical / Magic damage % (class type) | 18%                |   ✓    |        |      |        |      |       |          |
| Damage % (`damagePercent`)             | 12%                |        |   ✓    |  ✓   |   ✓    |      |   ✓   |          |
| Attack speed                           | 10                 |   ✓    |   ✓    |      |        |      |       |          |
| Crit chance                            | 6 pp               |   ✓    |   ✓    |  ✓   |        |      |       |          |
| Crit damage                            | 25 pp              |   ✓    |   ✓    |  ✓   |        |      |       |          |
| Cooldown reduction                     | 5 pp               |   ✓    |        |  ✓   |   ✓    |  ✓   |       |          |
| Elite & boss damage                    | 15%                |   ✓    |   ✓    |      |        |      |       |          |
| Area size                              | 12%                |        |   ✓    |      |   ✓    |      |   ✓   |          |
| Max HP %                               | 12%                |        |        |      |   ✓    |  ✓   |   ✓   |    ✓     |
| HP regen                               | 0.5% of max HP / s |        |        |      |        |  ✓   |   ✓   |    ✓     |
| Dodge                                  | 4 pp               |        |        |      |        |  ✓   |   ✓   |    ✓     |
| Movement speed %                       | 8%                 |        |        |      |        |      |   ✓   |    ✓     |
| Pickup radius %                        | 25%                |        |        |      |   ✓    |  ✓   |       |    ✓     |
| Run XP %                               | 10%                |        |        |  ✓   |   ✓    |  ✓   |       |          |
| Gold find %                            | 8%                 |        |        |  ✓   |        |      |       |    ✓     |

Five stats are new and need their effect in the run:

- **Pickup radius %** — multiplies the crystal / coin pickup radius (the existing `pickupScale` path).
- **Run XP %** — more in-run XP from crystals.
- **Gold find %** — more Gold from coin piles. Total from gear is capped at **25%**.
- **HP regen** — heals % of max HP per second through Combat Core (simulation time, never revives).
- **Elite & boss damage %** — bonus to the player's direct hits on elites and bosses.

### 5. Shop

- Sells **Common** and **Uncommon** only, at **item level = the class level** (the stock follows every level-up).
  Class level only changes between runs, so the stock never changes mid-run.
- **Stock per slot** (6 shared slots + the class's weapon): 1 Common + **3 Uncommon** with 3 different stats drawn
  from the slot's pool of 6, each at a fixed 75% roll (e.g. «Trickster's Gloves of Speed»). 28 offers per class.
- The stock is **derived, not stored**: a seeded draw from (a per-profile shop salt created once and saved, class,
  class level). Reloading the game shows the same stock; a level-up shows a new one. Buying an offer removes it
  until the next level-up (save the bought offers per class; they reset on level-up).
- Price: Common `round(40 × (1 + L/5))`, Uncommon `round(60 × (1 + L/5))`; weapons × 1.25.
- A bought item goes to the owned list. Until the bag screen (Task 41), adapt the existing Shop / Equipment pages
  just enough to buy, see an item's stats, and equip it per slot. Don't polish this UI.

### 6. Class levels

- **Attribute growth per level ×2/15** for every class (`CLASS_STATS_CONFIG.growthPerLevel`; Warrior strength 3 →
  0.4 per level). Starting attributes unchanged. Attributes may be fractional; show them rounded.
- **XP to go from level L to L+1 = 100 + 6·L²** (today 100 + 50·(L − 1)). 247 450 XP from 1 to 50. Talent points
  stay derived from the level as today. Update `recommendedLevel` (it is derived from the curve).

### 7. Rewards and enemies

- **Gold ×0.8:** apply a `goldScale = 0.8` to the map's victory Gold (`victoryGold`), so coins, the victory bonus,
  skip coins and activity coin rewards all follow. Quest Gold rewards ×0.8 (rounded). Pet prices unchanged.
- **Elite Trial:** class XP of a victory = 20% of the map's victory XP; Gold scale ×1 (was ×2); Ore scale stays ×2.
  Split today's single `rewardScale` into separate Gold and Ore scales. Hard and Nightmare unchanged (×1.5 / ×2 both).
- **Enemies:** `CAMPAIGN_BALANCE.laterDifficulty.damagePerMap` 0.10 → 0.08. Nothing else changes (HP curve, map
  1–10 values, tier multipliers).

### 8. Quests

- Forge quests (`forge.plus5`, `forge.plus10`, `forge.tier4`) can't be completed now: hide them and keep their ids.
  Tasks 41–42 retarget them.

### 9. Save

- Bump the save version. Migration rule for this branch: keep everything except equipment. Owned items, loadouts
  and Forge levels reset (every class gets its starter weapon, other slots empty). Gold, Ore, class XP / levels,
  talents, maps, quests, pets and settings are kept. A separate final task will decide how real players' saves
  move to the new model before `items-rework` reaches `main`.

## Docs

- Update `docs/EQUIPMENT_SHOP.md` to the new model (it replaces the tier model) and `docs/CHARACTER_STATS.md` for
  the growth and XP changes. Mark the Forge sections of `docs/task-19-gear-upgrades-ore.md` as replaced.
