# Task 26 — progress

Spec: [task-26-art-pack-2.md](task-26-art-pack-2.md) (owner's file, kept verbatim). Branch
`task-26-art`, created from the latest `main` (Task 25 merged). Input: the owner's `art-pack-2.zip`
(4 ground textures, 5 pickups, `manifest-pack2.json`, `ART_PROVENANCE-pack2.md`). Rendering only:
hitboxes, pickup radii, simulation and balance are unchanged.

Current: Phase 0 done — next: Phase 1 (pipeline)

Draft PR: _(opened in Phase 0)_

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR, "before" screenshots
- [ ] 1 Pipeline: files, manifest merge, provenance, registry kinds `ground` / `pickup`; tests
- [ ] 2 Ground: tiling per act, tint, layering; tests (act → texture, same seed with art on/off)
- [ ] 3 Pickups, chests, currency icons
- [ ] 4 Delivery: full checks, e2e desktop/mobile, `test:production`, FPS at 120 enemies, "after"
      screenshots (crystals, coins, telegraphs on all four grounds), README, PR

## Pack contents (checked in Phase 0)

| Group   | Files                                                                            | Size      |
| ------- | -------------------------------------------------------------------------------- | --------- |
| Ground  | `ground_{forest,marsh,ashlands,frost}` (1024 px, seamless)                       | 707 KB    |
| Pickups | `xp_crystal`, `coin`, `ore` (128 px), `chest_wooden`, `chest_enchanted` (192 px) | 40 KB     |
| Total   | 9 WebP + `manifest-pack2.json`                                                   | ≈ 0.75 MB |

With pack 1 (≈ 0.76 MB) the whole art set is ≈ 1.5 MB, under the 2 MB budget.

## Decisions

- **Manifest merge waits for the parser (Phase 1).** Pack 2's entries use a new anchor `tile` and a
  `kind` field. The Task 25 parser only accepts `bottom-center` / `center`, so merging the entries
  before it learns `tile` would make the whole manifest invalid and turn _all_ art (pack 1
  included) back into procedural looks. The images, the manifest merge, the provenance row and the
  parser / registry change therefore land together in step 1.1; until then the pack waits unpacked
  outside the repo. This also keeps the "before" screenshots free of pack-2 art.
- **Ore is not a world pickup.** Activity Ore is banked and paid with a victory (Task 24); nothing
  drops Ore on the ground. The `ore` image is used for the UI Ore badges only.
- **"Before" screenshots.** `tests/art2-screens.mjs <tag>` (not part of `test:e2e`; needs a dev
  server) writes `docs/art-pack-2/<tag>-*.jpg` at DPR 2: maps 1, 15, 25, 35 (acts I–IV) with XP
  crystals and coin piles from the normal reward pipeline (kills in view, a caught treasure thief),
  a wooden and an enchanted chest and a bombard telegraph — full view and a close-up — plus the hub
  and a results screen. The same script produces the "after" set in Phase 4.
