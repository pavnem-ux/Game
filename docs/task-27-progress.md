# Task 27 — progress

Spec: [task-27-skill-icons.md](task-27-skill-icons.md) (owner's file, kept verbatim). Branch
`task-27-icons`, created from the latest `main` (Task 26 merged). Input: the owner's
`art-pack-3.zip` (37 skill icons, `manifest-pack3.json`, `ART_PROVENANCE-pack3.md`). UI only:
skills, balance and simulation are unchanged.

Current: Phase 1 — pipeline

PR: (draft, opened in Phase 0)

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR, "before" screenshots (offer screen, HUD with
      4 actives, pause skill list, results; phone HUD and offer)
- [ ] 1 Pipeline: files, manifest merge, provenance, registry kind `skill-icon`; tests (every
      catalog skill id resolves, unknown id falls back)
- [ ] 2 Screens: offer cards, HUD cooldowns, pause list + synergy displays, results
- [ ] 3 Delivery: full checks, e2e desktop/mobile, `test:production`, "after" screenshots, README, PR

## Pack contents (checked in Phase 0)

| Group       | Files                                                                                               | Size   |
| ----------- | --------------------------------------------------------------------------------------------------- | ------ |
| Skill icons | 37 × 128 px WebP, round artwork with soft glow (alpha)                                              | 324 KB |
| Manifest    | `manifest-pack3.json`: 37 entries `skill_<id>`, `kind: "skill-icon"`, `skillId`, `anchor: "center"` | —      |

- The 37 icon names match the 37 catalog skill ids exactly (28 class skills + 9 universal
  passives); no missing or extra icons.
- The manifest adds two things the Task 25/26 parser does not accept yet: `kind: "skill-icon"` and
  the extra `skillId` field. As in Task 26, the merge lands in Phase 1 together with the parser
  change, so the live manifest never fails to parse.
- With packs 1 and 2 (≈ 1.5 MB) the art set is ≈ 1.85 MB, still under the 2 MB budget.

## "Before" screenshots

`docs/art-pack-3/before-*.jpg`, written by `tests/art3-screens.mjs before` (dev server, `?debug`):
warrior with Ground Slam, Whirlwind, Cleave, War Cry, Battle Fury and Power. The page clock is
paused so only `__alpha.advance` moves the world; DOM banners therefore stay on the HUD shot (the
skill bar close-up `before-hud-skills.jpg` is the reference for the HUD icons).
