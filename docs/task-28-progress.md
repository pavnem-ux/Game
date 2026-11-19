# Task 28 — progress

Spec: [task-28-synergy-talent-icons.md](task-28-synergy-talent-icons.md) (owner's file, kept
verbatim). Branch `task-28-icons`, created from the latest `main` (Task 27 merged). Input: the
owner's `art-pack-4.zip` (12 synergy icons, 12 talent branch emblems, `manifest-pack4.json`,
`ART_PROVENANCE-pack4.md`). UI only: synergies, talents and balance are unchanged.

Current: Phase 3 — talent UI

PR: https://github.com/pavnem-ux/Game/pull/26

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR, "before" screenshots (talent screen of each
      class + phone, synergy banners I / II / III, card hint, pause synergy list, results)
- [x] 1 Pipeline: files, manifest merge, provenance, registry kinds `synergy-icon` and
      `talent-branch-icon`; tests (every synergy id and every class / branch pair resolves)
- [x] 2 Synergy UI: banners, pause list with pips, card hint, results damage sources, gold ring
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

## Phase 2 — synergy UI

- One size config for every pack icon: `ICON_SIZES` (`src/gameplay-ui/kit/icon-sizes.ts`,
  installed as `--icon-<size>` on `:root`). Task 27's `SKILL_ICON_SIZES` / `skillIconSizeVars`
  are the same object / function (the CSS variables were renamed from `--skill-icon-*` to
  `--icon-*`; the Task 27 test now checks the new name). New sizes (provisional): banner 72
  (44 on short phones), branch header 96 (64 compact), talent node 56 (48 on touch, ≥ the
  Task 16 44 px minimum); synergy list reuses `list` 32, the card hint `pair` 20, results
  `stats` 24.
- `ArtImage` / `SynergyIcon` / `TalentBranchIcon` (`kit/ArtIcon.tsx`): a decorative `<img>`, or
  nothing when the manifest is still loading, the id has no icon or the image fails, so the
  screen keeps its current (text) look. `preloadSkillIcons` now also preloads the synergy icons
  and talent emblems.
- Banners (unlock I, level II, awakening III): the synergy icon left of the text; `Banner` gained
  `synergyId`. Level III draws a gold ring + glow around the same icon (`.is-awakened`, CSS only).
- Pause synergy list: icon before each name, level III ringed (effective level, so a DEV override
  shows too). Card hint «▲ Synergy II/III»: small synergy icon after the ▲ (the two skill icons
  from Task 27 stay). Results: `synergy:<id>` damage sources get the icon (`damageSourceSynergy`).
- Tests: `tests/ui-kit/art-icons.test.ts` (sizes, CSS reads every size, icon markup for all 12
  synergies, gold ring only at III, fallbacks, banner ids, damage-source mapping, emblem view).
  `alpha-browser`, `skills-ui-browser`, `art-browser` pass.
- Screenshot script: the results run is now a seeded campaign run (seed 2801), so «before» and
  «after» show the same sources; the «before» set was re-taken from `main` (a worktree dev
  server) with that script. The two runs' numbers differ slightly, but Seismic Impact is in the
  top five in both.

## "Before" screenshots

`docs/art-pack-4/before-*.jpg`, written by `tests/art4-screens.mjs before` (dev server, `?debug`):

- `talents-<class>` (1280×1000, full page) and `phone-talents-warrior` (844×390): class level 30
  with B1·1 at rank III (maxed), B1·2 at rank II, B2·1 at rank I; the rest locked; the
  superpower branch in its own frame.
- `banner-unlock`, `banner-level2`, `banner-awakening`: Thermal Shock I → II → III «Awakening»
  (mage, Fireball + Frost Nova; page clock paused, so the banners stay).
- `card-hint`: the Frost Nova card with «▲ Thermal Shock II».
- `pause-synergies`: the pause menu's synergy list with level pips.
- `results`: seeded warrior map-1 victory (seed 2801) with «Synergy “Seismic Impact”» among the
  top damage sources.
