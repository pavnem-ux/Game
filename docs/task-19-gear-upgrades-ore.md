# Task 19 — More Gear Slots, Ore, Item Upgrades (Кузница)

Repo: pavnem-ux/Game. Base: latest `main` with Task 16 merged. Branch `task-19-gear`.
Progress: `docs/task-19-progress.md`.

## Rules

1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from the
   first unchecked step; resolve uncommitted leftovers first.
2. Per step: test → commit `Task 19: <step> <summary>` → push → tick in progress file.
3. Phases run back-to-back; stop only on a blocker or when done. Follow AGENTS.md (PR to `main`, never
   merge; rewards applied once in the run snapshot; gear stats through the existing pipeline, caps once).
4. Extend `src/equipment/` additively; read `docs/EQUIPMENT_SHOP.md` first. UI uses the Task 13 kit and must
   work on mobile layouts (Task 16). Player text in Russian. Numbers in config, provisional in docs.

## 1. Spec

### 1.1 New slots (shared by all classes): Шлем, Перчатки, Штаны → 7 slots total

Two-stat templates (first stat ×1.0, second ×0.6 of the existing tier-1 base values), 5 tiers each, same
tier multipliers, unlock rules and prices as existing non-weapon items:
| Slot | Templates (stats) |
|---|---|
| Шлем | Шлем стража (max HP, resistance); Капюшон охотника (crit chance, dodge); Венец мага (CDR, magic dmg) |
| Перчатки | Латные рукавицы (phys dmg, resistance); Перчатки ловкача (attack speed, crit chance); Перчатки чародея (magic dmg, area size) |
| Штаны | Латные поножи (max HP, resistance); Кожаные штаны (movement speed, dodge); Шаровары мистика (CDR, max HP) |
→ +45 items (130 total). Shop tabs, equipment paper-doll and compare tooltips include the new slots.

### 1.2 Ore («Руда»)

- Second profile currency. Victory only: `2 + floor(mapId / 4)` ore (map 40: 12); first victory on a map ×3.
  Defeat/abandon: 0. Applied once in the same run snapshot as XP/Gold (existing dedup).
- Shown in the hub, shop, forge and results screen.

### 1.3 Upgrades («Кузница»)

- Every owned item (incl. weapons) has an upgrade level +0…+10, shared by all classes (items are
  account-wide unlocks). Each level adds +5% of the item's base stats (+10 = ×1.5). Always succeeds — no
  failure, no downgrade, no randomness.
- Cost of upgrading to level L: Gold = item price × 0.1 × L; Ore = ceil(tier × L / 2).
  Starter weapons (tier 0) can't be upgraded.
- Forge screen (hub button «Кузница», also from the item tooltip): item list with filters, current vs next
  stats, cost, «Улучшить» (atomic: currencies deducted + level saved in one write; disabled if short).
- Item names show the level: «Кольцо точности +3».

### 1.4 Save

- Schema v5 + migration: `ore: 0`, `itemLevels: {}`, per-class loadout gains `helmet`, `gloves`, `pants`
  (empty). Nothing else changes. Validation: level 0–10, only owned items, ore ≥ 0. Export/import, backup
  and bug reports include the new fields. Invalid data never overwrites a valid save.

### 1.5 Debug (dev/QA only)

Grant ore, set item level, unlock all new items.

## 2. Phases

- **0 Setup:** branch, progress file, draft PR.
- **1 Slots:** 1.1 templates/items/config; 1.2 loadout + stats pipeline; 1.3 shop/equipment UI.
  Tests: 130 unique items; new slots eligible for all classes; stats applied once with caps; loadouts
  per class independent.
- **2 Ore:** 2.1 rewards + first-victory bonus + dedup; 2.2 UI. Tests: amounts for maps 1, 4, 40; ×3 only
  on first victory; none on defeat/abandon; no duplicates after reload/repeated result events.
- **3 Forge:** 3.1 upgrade logic (pure); 3.2 stats with levels; 3.3 forge UI.
  Tests: cost table; can't exceed +10, upgrade unowned or starter items, or go below 0 currency; stat
  values at +0/+5/+10; atomic save.
- **4 Save:** v5 migration/validation. Tests: v4 save migrates without loss; round-trip export/import.
- **5 Delivery:** full checks from AGENTS.md §6 (+ e2e incl. mobile viewport); docs (`docs/EQUIPMENT_SHOP.md`,
  README, `docs/playtest.md` in Russian); PR with ore income and upgrade cost tables. Don't merge.
