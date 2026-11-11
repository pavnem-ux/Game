# Task 11 — Equipment, Shop and Gold Coins

Repo: pavnem-ux/Game. Base: latest `main` with Task 10 merged (if Task 10's 40-map config is missing,
stop and report). Branch `task-11-equipment`. Progress: `docs/task-11-progress.md`.
Goal: a full meta loop — collect coins in runs → buy gear in the shop → equip → beat harder maps.

## Rules

1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from
   the first unchecked step; resolve uncommitted leftovers first.
2. Per step: test → commit `Task 11: <step> <summary>` → push → tick in progress file.
3. Phases run back-to-back; stop only on a blocker or when done. Follow AGENTS.md (PR to `main`,
   never merge, invariants §4: Combat Core owns damage, one scheduler, seeded RNG, dedup rewards).
4. Reuse code maps in `docs/task-*-progress.md`; don't re-explore.
5. Gear only changes existing combat attributes. No new stats, weapon behaviours, attack shapes,
   procs, sockets, crafting, selling, loot drops or premium currency.
6. Player text in Russian. All values in one equipment/economy config; mark provisional in docs.

## 1. Spec

### 1.1 Slots & ownership

- 4 slots per class: Оружие (class-specific), Броня, Амулет, Кольцо (shared by all classes).
- Buying an item unlocks it permanently for the profile (no copies, no inventory limit). Any eligible
  class can equip an owned item; each class has its own loadout.
- Starting weapons count as owned tier-0 items with no bonus, equipped by default.
- Warrior's talent off-hand sword stays as is (its formula uses physicalDamage, which already includes
  gear) — no separate off-hand slot.

### 1.2 Items (generated from templates × tier)

Tiers: 1 Обычный, 2 Добротный, 3 Редкий, 4 Эпический, 5 Легендарный; stat multiplier ×1/×2/×3.5/×5/×7.
Shop unlock by highest cleared map: tier 1 from start, tier 2 after map 8, 3 after 16, 4 after 24,
5 after 32. Each template exists in every tier (name = template name + tier adjective, Russian).
Tier-1 base values: phys/magic damage +4%, max HP +5%, resistance +2, crit chance +1 pp,
crit damage +5 pp, attack speed +2, dodge +1 pp, movement speed +2%, CDR +1 pp, area size +2%.
Weapons: first stat ×1.0, second ×0.6. Others: as listed.

| Slot           | Templates (stats)                                                                          |
| -------------- | ------------------------------------------------------------------------------------------ |
| Warrior weapon | Тяжёлый меч (phys dmg, crit dmg); Быстрый меч (attack speed, crit chance)                  |
| Rogue weapon   | Кинжал убийцы (crit chance, crit dmg); Кинжал теней (phys dmg, dodge)                      |
| Archer weapon  | Длинный лук (phys dmg, crit dmg); Короткий лук (attack speed, movement speed)              |
| Mage weapon    | Посох пламени (magic dmg, area size); Посох мудрости (CDR, magic dmg)                      |
| Armor          | Латы (max HP, resistance); Кожаный доспех (dodge, movement speed); Мантия (CDR, area size) |
| Amulet         | Амулет силы (phys dmg); Амулет магии (magic dmg); Амулет жизни (max HP)                    |
| Ring           | Кольцо точности (crit chance); Кольцо ярости (crit dmg); Кольцо скорости (attack speed)    |

Total: 8 weapon templates + 9 shared = 17 templates × 5 tiers = 85 items.
Prices (Gold): tier 1/2/3/4/5 = 80/300/700/1400/2500; weapons ×1.25.

### 1.3 Stat integration

- Gear modifiers enter the permanent-attribute snapshot through the existing pipeline (same path as
  talents): applied once, central caps applied once at finalization; never stored as final stats.
- Character screen shows final stats with/without gear; equip preview shows +/- per stat.

### 1.4 Gold coins in runs

- Coins are pickups like XP crystals (same magnet/collection rules, separate pile cap, piles merge).
  Drops via the seeded RNG: normal enemy chance-based small value, elite guaranteed pile, boss large
  pile; values scale with map. Each enemy death drops coins at most once.
- Tuning target: on an average victory, collected coins ≈ 60% of the map's victory Gold from
  Task 10; the victory bonus becomes the other 40%. Measure with accelerated mode on maps 1, 10, 20,
  40 and record in the PR.
- Victory: all collected coins + victory bonus. Defeat: 50% of collected coins, no bonus.
  Abandoned run: nothing. Gold applied exactly once in the same run snapshot as XP (existing dedup).
- HUD: coins collected this run. Results: coins collected, bonus, total.

### 1.5 Shop

- Main menu «Магазин»: tabs by slot; weapons filtered by the selected class (switcher to view others).
- Card: name, tier color, stats, price, state (купить / куплено / надето / откроется после карты N).
  Buy → confirm → Gold deducted and item owned in one atomic save; disabled if Gold is short.
- Character screen: 4 slots per class, pick from owned eligible items, unequip back to starter weapon /
  empty slot. Changes apply to the next run.

### 1.6 Save

- Schema bump + migration: `ownedItems: []`, per-class `loadout` (starter weapon, empty others).
  Gold, XP, levels, maps, talents untouched.
- Validation: known item ids, owned before equipped, slot/class eligibility, Gold ≥ 0. Invalid import
  never overwrites a valid save. Export/import, backup, bug reports include gear.

### 1.7 Debug (dev/QA only)

Grant Gold, unlock all items, equip best tier for a class, coin drop overlay (coins per minute).

## 2. Phases

### Phase 0 — Setup

- 0.1 Branch from `main`, progress file, draft PR.

### Phase 1 — Data & pure logic

- 1.1 Item templates, tier generation, prices, shop unlock rules (config + validation).
- 1.2 Purchase/equip/unequip logic (pure).
- Tests: 85 items, unique ids; tier stats and prices; unlock by map; can't buy twice, without Gold or
  locked tier; weapon eligibility by class; per-class loadouts independent.

### Phase 2 — Save

- 2.1 Schema, migration, validation (1.6). Tests: old save migrates without loss; purchases and
  loadouts survive reload and export/import; invalid gear data rejected.

### Phase 3 — Stats

- 3.1 Gear modifiers in the attribute pipeline. Tests: applied once; caps; gear + talents compose;
  run stats and damage preview match combat; switching class uses that class's loadout.

### Phase 4 — Coins

- 4.1 Coin drops/pickups/caps. 4.2 Run rewards (victory/defeat/abandon) + dedup. 4.3 HUD/results.
- Tests: deterministic drops per seed; one drop per death; pile cap without loss; reward math;
  no duplicate Gold after reload or repeated result events.

### Phase 5 — UI & debug

- 5.1 Shop screen. 5.2 Character equipment screen with preview. 5.3 Debug tools.

### Phase 6 — Tuning & delivery

- 6.1 Measure coin income (1.4) and adjust drop values to the target; record the table in the PR.
- 6.2 Full checks from AGENTS.md §6 (+ e2e). Docs: `docs/EQUIPMENT_SHOP.md`, README, shop and gear
  checks in `docs/playtest.md` (Russian).
- 6.3 PR description: item list summary, prices, income table, test/build results, limitations.
  Don't merge.
