# Task 41 — Bag screen, slot upgrades and salvage (items rework, part 2 of 4)

Follow `docs/TASK_WORKFLOW.md`, with the items-rework branching (as in Task 40):

- Merge the latest `main` into `items-rework` first and push (Task 40 must already be merged into it).
- **Branch `task-41-bag-slots`** from `items-rework`. Open the draft PR **into `items-rework`**, not `main`.

Builds on Task 40 (item instances, rarities, affixes, shop stock, save v10). All numbers are provisional and live in
one config place. All player-facing text in English.

## Goal

One **Bag** screen replaces today's Equipment page: equipped slots on the left, the bag in the middle, the selected
item's card on the right. **Slot upgrades** bring back permanent gear growth (the old Forge item upgrades are gone):
an upgrade belongs to the class's slot, not to the item, and stays forever. **Salvage** turns unwanted items into
Ore.

## Spec

### 1. Slot upgrades

- Each class has its own 7 slot levels, 0–30 (saved per class, e.g. `ClassProgress.slotLevels`).
- **Every level:** the main stat of the item in that slot ×(1 + 0.04·level). +30 → ×2.2.
- **Milestones +5, +10, +15, +20, +25, +30:** the secondary stats of the item in that slot ×(1 + 0.20·milestones
  reached). +30 → ×2.2. Applied in the gear pipeline before the central caps, as part of the item's own stats.
- The bonus applies to whatever item is in the slot, the starter weapon included. Changing the item keeps the bonus.
- **Cost of level n:** Gold `250 + 4·n²`, Ore `8 + 4·n`. No class-level gate.

| Level | +1  | +5  | +10 | +15   | +20   | +25   | +30   |
| ----- | --- | --- | --- | ----- | ----- | ----- | ----- |
| Gold  | 254 | 350 | 650 | 1 150 | 1 850 | 2 750 | 3 850 |
| Ore   | 12  | 28  | 48  | 68    | 88    | 108   | 128   |

### 2. Salvage

- Salvaging removes an item and pays Ore: Common 0, Uncommon 1, Rare 3, Epic 8, Legendary 25.
- An item equipped by any class can't be salvaged (shown locked, with which classes wear it).
- Bulk actions: salvage the marked items; «Salvage all Common and Uncommon» (skips equipped items). Both show the Ore
  total and ask to confirm. Any Legendary in a salvage asks to confirm separately.

### 3. Bag

- **Capacity 60** owned items (starter weapons don't count). When the bag is full, the shop refuses a purchase with
  a short message («Bag is full — salvage something first»). Task 42 handles drops into a full bag.
- Each item gets a «new» flag when it is added; viewing its card clears it (saved).

### 4. Bag screen layout

Opened for the selected class (the hub tile and nav entry that open Equipment today now open the Bag). Three
panels:

- **Left — equipped.** 7 rows (Weapon, Helm, Armor, Gloves, Leggings, Amulet, Ring): slot name, slot level `+N`,
  equipped item name in its rarity colour (or «Empty»). Selecting a row selects that slot and filters the bag to it.
  Under the rows: the **upgrade button** for the selected slot with its Gold and Ore cost, the current bonuses, and
  «Next milestone at +N». Disabled-looking only when Gold or Ore is short (show what's missing) or the slot is +30.
- **Middle — bag.** A grid of item icons, each framed in its rarity colour, with the item level. Filters: rarity
  (All / Common / Uncommon / Rare / Epic / Legendary) and slot (All + 7). Sort: item level (default), rarity,
  newest. Markers on an item: «new», «better» (higher main stat than the item equipped in its slot for this class,
  slot bonuses included), «equipped». Multi-select mode for salvage. Header: `Bag · 37 / 60`.
- **Right — item card.** Name in rarity colour, rarity label, slot, item level, main stat and every secondary stat
  **with the slot bonuses applied**; next to each value, the difference to the equipped item (green better, red
  worse, «new» for a stat the equipped item doesn't have). A level gate shows «Requires level N» when the class is
  too low. Actions: **Equip**, **Salvage → N Ore**. «Equipped by: Warrior, Mage» when it's worn.
- Items of other classes' weapons are hidden unless the slot filter is Weapon and a «Show all classes» toggle is on.
- Keep the visual style of the existing meta screens (`meta.css`, ui-kit). Desktop first; don't break the mobile
  layout.

### 5. Shop and Forge

- The shop stays a separate page (Task 40). A bought item goes to the bag with the «new» flag.
- The Forge page keeps pet upgrades only (as after Task 40). Slot upgrades live on the Bag screen, not in the Forge.

### 5a. Shop layout (owner: the offer lists are too tall)

Today each offer is a tall full-width card stacked in one column, so a slot's 4 offers need a lot of scrolling.
Rework the gear part of `ShopPage` (pets tab unchanged):

- **One compact grid:** a slot's 4 offers (Common + 3 Uncommon) sit **side by side in one row** on desktop
  (4 columns; 2 on narrow screens). A card is short: icon + name in rarity colour + item level on one line, the main
  stat and the one secondary stat on one line each, price + Buy at the bottom. No long explanatory text on cards.
- **«All» tab first (default):** every slot of the class on one page — one compact row per slot (slot label on the
  left, its 4 offers to the right). 7 rows fit on one desktop screen without scrolling; the slot tabs remain for
  focusing one slot.
- **Compare on the card:** show the main-stat difference to the item the class wears in that slot, slot bonuses
  included (green «+6 damage» / red), and a «better» marker, using the same comparison as the Bag.
- Move the long note («Items at item level N …») into one short line under the header: «Item level 32 · new stock at
  level 33». Sold-out offers stay as a greyed placeholder so the row doesn't jump.
- The class selector stays; Gold and Ore totals in the header.

### 6. Quests

- Bring back `forge.plus5` and `forge.plus10` as «Upgrade any slot to +5» / «… to +10» (same ids and rewards, Gold
  ×0.8 already applied in Task 40). `forge.tier4` stays hidden (Task 42 retargets it).

### 7. Save

- Bump the save version: add slot levels (all 0) and the «new» flags (all off for existing items). Nothing else
  changes. Production saves are still not migrated here.

## Docs

- `docs/EQUIPMENT_SHOP.md`: bag, slot upgrades, salvage. Update `CODEMAP.md` for the new screen.
