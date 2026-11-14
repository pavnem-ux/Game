# Task 22 — Declutter the In-Run HUD + Equipment/Shop/Forge UX

Repo: pavnem-ux/Game. Base: latest `main` (Tasks 16–21 merged). Branch `task-22-hud`.
Progress: `docs/task-22-progress.md`. Presentation only — simulation, balance and economy unchanged.

## Rules

1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from the
   first unchecked step; resolve uncommitted leftovers first.
2. Per step: commit `Task 22: <step> <summary>` → push → tick in progress file. Phases back-to-back.
3. Follow AGENTS.md (PR to `main`, never merge). Update e2e selectors instead of weakening tests.
4. Desktop and mobile (Task 16) layouts both. Player text in Russian.

## 1. Spec

### 1.1 Top

- Keep the large run timer and its label.
- Remove from the info bar: map name, stage («Этап»), remaining time («Осталось»), «Босс через».
- Keep the coin counter.
- New single countdown to the nearest scheduled event: «Элита через 1:20» or «Босс через 0:45» (whichever
  comes first, from the existing elite/boss schedule; respects 2-elite events and per-act intervals).
  Hide it when nothing is scheduled any more (after map duration). Boss HP bar unchanged.

### 1.2 Bottom

- Remove: «Навыки» button, «Автоматические N/4 · Пассивные N/6» text, passive skill icons, the bottom
  caption with map name and wave number.
- Active (automatic) skill icons with cooldown overlay move to the bottom-left corner (compact column/row,
  rank shown small). Talent/pet/buff icons from Tasks 12/20 stay where they are unless they overlap.
- Dash button/indicator stays.
- The full skills list (actives, passives, synergy levels) remains available in the pause menu; check it
  shows everything the removed elements showed.

### 1.3 Level-up offer screen

- Remove the hotkey hint line («R — перебросить · B — изгнать · S — пропустить · 1–3 — выбрать»).
- Remove the R/B/S/1–3 keyboard shortcuts on this screen (S also moves the player down, so a held key could
  skip an offer by accident). Mouse/touch buttons and Tab/Enter focus navigation remain.
- Remove the «Навыки» button on this screen as well.

### 1.4 Equipment, shop and forge screens (meta UI)

- **Rows by rarity:** in Экипировка (owned items) and Магазин, items are grouped into rows by tier —
  Обычный → Добротный → Редкий → Эпический → Легендарный — each row with a tier-coloured header; empty
  rows hidden; existing slot/class filters still apply within the rows.
- **Equipped item details:** clicking an equipped item in a paper-doll slot opens a details panel: name with
  upgrade level, tier, all stats (current values incl. upgrade), buttons «Снять» and «Улучшить в кузнице».
  The latter opens the Forge with this item preselected; back returns to Экипировка.
- **Equip button placement:** when an item is selected in the owned list, the details panel with «Надеть»
  (and the stat compare) appears at the top of the item area / next to the selection — never at the very
  bottom of the page. On mobile it is a sticky panel visible without scrolling.
- **Forge mode switch:** the Предметы / Питомцы choice becomes a prominent centred segmented control at the
  top of the Forge screen (large, clearly showing the active mode), replacing the current switch.
- Same behaviour and data as now; only layout and navigation change.

## 2. Phases

- **0 Setup:** branch, progress file, draft PR; "before" screenshots (desktop 1280×720, mobile 844×390).
- **1 Top:** next-event countdown (pure function from the schedule, tested: elite first, boss first,
  2-elite events, after 10:00, after map end → hidden, frozen on pause).
- **2 Bottom:** remove elements, move active skill icons; pause menu completeness.
- **3 Offer screen:** remove hints/hotkeys/button. Test: pressing R/B/S/1–3 during an offer changes nothing.
- **4 Meta screens:** 4.1 rarity rows (equipment + shop); 4.2 equipped item details → forge deep link;
  4.3 equip panel placement; 4.4 forge mode switch. e2e: open equipped item → «Улучшить в кузнице» opens the
  forge with that item; select owned item → «Надеть» visible without scrolling (desktop and mobile);
  switch forge Предметы/Питомцы.
- **5 Delivery:** full checks from AGENTS.md §6 (+ e2e desktop and mobile); "after" screenshots; update
  `docs/playtest.md` (Russian); PR. Don't merge.
