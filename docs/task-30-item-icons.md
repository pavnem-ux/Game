# Task 30 — Art Packs 5 + 6: Item Icons and Pets

Follow `docs/TASK_WORKFLOW.md`. Base: latest `main`. Branch `task-30-items-pets-art`.
Inputs (attached): `art-pack-5.zip` (30 item icons 128×128 WebP named by gear template id) and `art-pack-6.zip`
(6 pet sprites 256×256 WebP named by pet id, bottom-centre anchor), each with `manifest-packN.json` and
`ART_PROVENANCE-packN.md`. UI/rendering only — items, pets, prices, stats unchanged. Don't edit the image files.

## Spec
- Files → `public/assets/icons/items/*`, `public/assets/pets/*`; merge both manifests into
  `public/assets/manifest.json`; append both provenance rows to `docs/ART_PROVENANCE.md`.
- Registry kind `item-icon` keyed by gear template id (26 templates + 4 `starter_*`). All tiers of a template
  share its icon; rarity stays shown by the existing tier frame/colour; upgrade badge (+N) on top. Use it in shop
  cards, equipment slots and owned-items rows, item details, forge list/upgrade panel, compare tooltip, quest
  rewards that grant items.
- Registry kind `pet` keyed by pet id (`firefly`, `owlet`, `fox`, `hedgehog`, `kitten`, `wolf`): in-run follower
  sprite (scale to the current pet display size, flip by movement direction, keep idle bob, pet light and the
  existing action effects) and the pet card/portrait in pet selection, shop, forge and quest rewards.
- Fallback to the current look for any missing key.
- Tests: every gear template id, starter id and pet id resolves; unknown id → fallback.
