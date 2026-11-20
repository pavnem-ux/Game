# Task 31 — Art Pack 7: Decor, Menu Backgrounds, Emblem, Activity/Chest/Buff Art

Follow `docs/TASK_WORKFLOW.md`. Base: latest `main`. Branch `task-31-art`.
Input (attached): `art-pack-7.zip` — 32 decor props, 5 backgrounds (1920×1080), emblem, 11 objects, all WebP,
named and typed in `manifest-pack7.json`; `ART_PROVENANCE-pack7.md`. Rendering/UI only — no gameplay, collision
or balance changes. Don't edit the image files.

## Spec
- Files → `public/assets/{decor,backgrounds,ui,objects}/*`; merge the manifest into `public/assets/manifest.json`;
  append the provenance row to `docs/ART_PROVENANCE.md`. Registry kinds from the manifest (`decor`, `background`,
  `ui`, `buff-icon`, `currency-icon`, `chest-open`, `activity`); fallback to the current look for any missing key.
- **Decor:** each act uses its 8 art props (manifest `act`: forest/marsh/ashlands/frost = Acts I–IV) instead of
  the procedural set, same seeded placement (Task 18). Decor is drawn **below** all units, pickups, projectiles and
  telegraphs and never covers them. `tall` props (trees, columns, walls, statues, lamp): lower density (≈ half),
  kept ≥ 250 units from the spawn centre and from activities/chests. Ember crack, ash pile and the will-o'-wisp lamp
  get no extra light/glow so they don't read as hazards. Per-map tint stays subtle.
- **Backgrounds** (lazy-loaded when the screen opens, not in the boot preload): `bg_menu` behind the hub/main menu;
  `bg_act1..4` behind the matching act regions of the map path. Add a dark gradient/vignette so text and buttons
  stay readable; keep the existing layout.
- **Emblem:** hub/title shows `emblem` with the game title rendered in the existing font next to/under it.
- **Objects:**
  - `shrine_embers` → Shrine activity (capture ring/progress drawn on top as now);
  - `lantern_unlit` / `lantern_lit` → Dying Lantern before/after activation (light radius effect stays code);
  - `chest_wooden_open` / `chest_enchanted_open` → chest open state (replace the open puff frame; keep the effect);
  - `buff_fury`, `buff_quick_hands` (`haste`), `buff_light_step` (`lightStep`) → HUD buff icons with timers and
    pickup popups; `buff_magnet` → magnet popup;
  - `icon_gold`, `icon_ore` → all UI Gold/Ore badges (replace the pickup art used there since Task 26; in-run
    pickups keep `coin`/`ore`).
- Tests: every manifest key resolves; decor per act maps to the 8 props of that act; tall-prop exclusion radius;
  backgrounds not in the boot preload list.
