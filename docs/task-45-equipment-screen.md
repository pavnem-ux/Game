# Task 45 — Equipment screen, Legendary icons, hub-only navigation

Follow `docs/TASK_WORKFLOW.md`, with the items-rework branching:

- If PRs #40–#44 are merged into `items-rework`: merge the latest `main` into it, push, and branch
  **`task-45-equipment-screen`** from it. If not: stack on `task-44-readable-stats` and note it in the progress file.
- Open the draft PR **into `items-rework`**, not `main`.

No rules or numbers change. All player-facing text in English.

## Goal

The owner doesn't like the Bag screen (Task 41): the equipped items lost their old look and the pet is not visible
at all. Bring back the paper doll of the old Equipment screen (`EquipmentScreen.tsx` as on `items-rework` before
Task 40: `paper-doll`, `doll-figure`, `doll-slot-*`, `PetSlot`) and keep everything the Bag added.

## Spec

### 1. Name

- «Bag» becomes **«Equipment»** everywhere the player sees it: page title, hub tile, nav entry, buttons that open
  it, quest / toast texts. The page id and routes may stay; rename the component to `EquipmentPage` if it's cheap.
- The item list keeps its own header «Bag · 23 / 25» (with «Expand bag») — that part is the bag.

### 2. Layout

- **Left: the paper doll, as before Task 40.** The silhouette with the class emblem in the middle, Helmet / Armor /
  Gloves on the left, Amulet / Ring / Legs on the right, the wide Weapon card below, the **Pet** card under it
  («Change →» opens Pets), same `doll-slot` cards and styling.
- Each slot card now shows: slot name, the item's icon (§4), name in its rarity colour (or «Empty»), and the slot
  level `+N` in the card corner (where the old diamond marker sits). Clicking a slot selects it: it filters the bag
  to that slot and shows the slot upgrade panel.
- **Under the doll: the slot upgrade panel** for the selected slot (cost, current bonuses, next milestone) and the
  collapsible **Stats** panel (Task 44).
- **Right: the bag** (filters, sort, grid, bulk salvage, capacity, expand) and the **item card** (stats, compare,
  Equip, Reforge, Salvage), as today.
- Desktop: two columns (doll | bag + card). Narrow screens: doll first, then the bag, then the card. Keep the
  existing visual style (dark panels, gold accents).

### 3. Pet

- The pet card on the doll shows the active pet's portrait, name and level (or «No pet»), as on the old screen.
- Its aura bonuses are part of the Stats panel values (and marked «pet» in the gear-share brackets if they are
  separate today).

### 4. Legendary icons

- Legendary items use their own icon: `public/assets/icons/items/legendary/<legendaryId>.webp` (10 files, ids as in
  `LegendaryId`). If a file is missing, fall back to the slot's band icon with the Legendary frame (Task 43).
- The icon is used everywhere an item icon shows: doll slots, bag grid, item card, shop / Loot / toasts.
- Register the new assets the same way as the other item icons (preload list, asset manifest if any).

### 5. Hub: one battle button

- Remove the **«Start run · map N · Class →»** quick-start button next to «To battle» on the hub (`hub-actions`,
  string `quickStart`). «To battle» (opens the campaign map) stays the only battle entry. Keep the quick start only
  if a DEV / QA hook uses it (then hide it outside DEV).

### 6. No top navigation

- Remove the page buttons from the top bar (`meta-nav`: Home, Hero, Equipment, Talents, Shop, Forge, Campaign map,
  Progress, Settings). The top bar keeps the game title (click → hub) and the Gold / Ore badges.
- The hub tiles (`hub-tiles`) become the only way into the sections: check that every former nav page has a tile
  (Hero, Equipment, Talents, Shop, Forge, Pets, Quests, Campaign map, Progress, Settings), and add the missing ones.
- Every page other than the hub gets a clear **«← Home»** button at the start of its page header; **Esc** also
  returns to the hub (except while a confirm dialog is open, where Esc closes the dialog). Existing in-page links
  (e.g. Equipment → Shop) stay.
- Phones: the old scrolling nav row and its auto-scroll code go away with it.

## Docs

- `docs/EQUIPMENT_SHOP.md` and `CODEMAP.md`: «Equipment» screen name and layout; Legendary icon paths; hub-only
  navigation.
