# Task 28 — progress

Spec: [task-28-synergy-talent-icons.md](task-28-synergy-talent-icons.md) (owner's file, kept
verbatim). Branch `task-28-icons`, created from the latest `main` (Task 27 merged). Input: the
owner's `art-pack-4.zip` (12 synergy icons, 12 talent branch emblems, `manifest-pack4.json`,
`ART_PROVENANCE-pack4.md`). UI only: synergies, talents and balance are unchanged.

Current: Phase 2 — synergy UI

PR: https://github.com/pavnem-ux/Game/pull/26

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR, "before" screenshots (talent screen of each
      class + phone, synergy banners I / II / III, card hint, pause synergy list, results)
- [x] 1 Pipeline: files, manifest merge, provenance, registry kinds `synergy-icon` and
      `talent-branch-icon`; tests (every synergy id and every class / branch pair resolves)
- [ ] 2 Synergy UI: banners, pause list with pips, card hint, results damage sources, gold ring
      for level III
- [ ] 3 Talent UI: branch header emblems, node emblems with number badge and rank pips, locked /
      maxed states, superpower frame and level-30 seal kept
- [ ] 4 Delivery: full checks, e2e desktop / mobile, `test:production`, "after" screenshots,
      README, PR

## Pack contents (checked in Phase 0)

| Group          | Files                                                        | Size    |
| -------------- | ------------------------------------------------------------ | ------- |
| Synergy icons  | 12 × 128 px WebP (`assets/icons/synergies/<id>.webp`)        | 237 KB  |
| Talent emblems | 12 × 192 px WebP (`assets/icons/talents/<branch name>.webp`) | (incl.) |
| Manifest       | `manifest-pack4.json`: 24 entries                            | 6 KB    |

- The 12 synergy file names and `synergyId` fields match the 12 synergy ids in `SYNERGY_RULES`
  (keys `synergy_<id>`).
- The 12 talent emblems are keyed `talent_branch_<branch name>` and carry `characterClass` and
  `branch` (1–3); they match the 12 branches of the talent catalog (e.g. warrior 1 Berserker,
  2 Guardian, 3 Twin-Blade Master). Pixel sizes match the manifest (read from the WebP headers).
- New for the parser (Phase 1, before the merge so the live manifest never fails to parse): kinds
  `synergy-icon` and `talent-branch-icon`, the key prefixes, and the extra fields `synergyId`,
  `characterClass`, `branch`.
- Budget: the art set is 1.77 MB today; with pack 4 (≈ 0.24 MB of images + the merged manifest)
  it is ≈ 2.01 MB, under the 2 MiB (2,097,152 bytes) test limit with ≈ 80 KB to spare.

## Phase 1 — pipeline

- The 24 images are copied byte-identical to `public/assets/icons/synergies/` and
  `public/assets/icons/talents/`; the manifest has 87 entries (packs 1–4: 17 + 9 + 37 + 24), same
  1-space format; provenance row 4 appended.
- Parser: kinds `synergy-icon` (key `synergy_<file>`, optional `synergyId` = file name) and
  `talent-branch-icon` (key `talent_branch_<file>`, required `characterClass` from the four
  classes and `branch` as a positive integer, one emblem per class / branch). Emblem entries keep
  `talentBranch: { characterClass, branch }`; other entries have no such field.
- Registry: `synergyIconEntry(manifest, id)` / `synergyIconEntries`, and
  `talentBranchIconEntry(manifest, class, branch)` / `talentBranchIconEntries`. Emblems are looked
  up by the class / branch fields, not by the key. Null (no manifest, unknown id or pair, missing
  icon, other kind) means "keep the current look". `artUsage` knows the 12 synergy keys and the 12
  branch keys (`talent_branch_` + the catalog branch name as a slug). The in-run scene loads
  neither.
- Tests (`tests/engine/art-pack.test.ts`): every synergy id and every catalog class / branch pair
  resolves (sizes, kinds, files); fallbacks; validation of keys, `synergyId`, class, branch and
  duplicates. Art set: 2,016,237 bytes, under the 2,097,152-byte test limit.
- Checks: `npm run typecheck`, `npm test` (142 files, 1513 tests), `npm run format:check`,
  `npm run build` pass.

## "Before" screenshots

`docs/art-pack-4/before-*.jpg`, written by `tests/art4-screens.mjs before` (dev server, `?debug`):

- `talents-<class>` (1280×1000, full page) and `phone-talents-warrior` (844×390): class level 30
  with B1·1 at rank III (maxed), B1·2 at rank II, B2·1 at rank I; the rest locked; the
  superpower branch in its own frame.
- `banner-unlock`, `banner-level2`, `banner-awakening`: Thermal Shock I → II → III «Awakening»
  (mage, Fireball + Frost Nova; page clock paused, so the banners stay).
- `card-hint`: the Frost Nova card with «▲ Thermal Shock II».
- `pause-synergies`: the pause menu's synergy list with level pips.
- `results`: warrior map-1 victory with «Synergy “Seismic Impact”» among the top damage sources.
