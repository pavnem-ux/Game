# Task 27 — progress

Spec: [task-27-skill-icons.md](task-27-skill-icons.md) (owner's file, kept verbatim). Branch
`task-27-icons`, created from the latest `main` (Task 26 merged). Input: the owner's
`art-pack-3.zip` (37 skill icons, `manifest-pack3.json`, `ART_PROVENANCE-pack3.md`). UI only:
skills, balance and simulation are unchanged.

Current: done — PR ready for review (owner merges)

PR: https://github.com/pavnem-ux/Game/pull/25

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR, "before" screenshots (offer screen, HUD with
      4 actives, pause skill list, results; phone HUD and offer)
- [x] 1 Pipeline: files, manifest merge, provenance, registry kind `skill-icon`; tests (every
      catalog skill id resolves, unknown id falls back)
- [x] 2 Screens: offer cards, HUD cooldowns, pause list + synergy displays, results
- [x] 3 Delivery: full checks, e2e desktop/mobile, `test:production`, "after" screenshots, README, PR

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

## Phase 1 — pipeline

- The 37 icons are copied byte-identical to `public/assets/icons/skills/`; the manifest has 63
  entries (pack 1: 17, pack 2: 9, pack 3: 37), same 1-space format; provenance row 3 appended.
- Parser: `kind: "skill-icon"` accepted. Skill icons are keyed `skill_<id>` for the file
  `<id>.webp`; the optional `skillId` field must equal the file name. Other kinds keep the
  key = file-name rule.
- Registry: `skillIconArtKey(id)`, `skillIconEntry(manifest, id)` (null → the glyph: no manifest,
  unknown id, missing icon or an entry of another kind) and `skillIconEntries(manifest)`;
  `artUsage` returns `skill-icon` only for catalogue skill ids. Icons are DOM images, so the
  in-run scene does not load them.
- Tests (`tests/engine/art-pack.test.ts`): every one of the 37 catalogue ids resolves to its
  128 px icon; unknown / missing / no-manifest fall back; key / `skillId` validation; files and
  sizes match; the art set (1.77 MB) stays under 2 MB.

## Phase 2 — screens

- `SkillIcon` (`src/gameplay-ui/kit/SkillIcon.tsx`): the pack's round icon as a decorative
  `<img>` (no frame, the art keeps its glow), or the catalogue glyph while the manifest loads, for an
  id without an icon, for bonus cards, or if the image fails. All icons are preloaded once when the
  in-run app mounts (`preloadSkillIcons`).
- One size config, `SKILL_ICON_SIZES` (CSS px, installed as `--skill-icon-*` on `:root`): card 96
  (64 on short / narrow screens), HUD 44 (touch 44, the Task 16 minimum; was 34 on phones), pause
  list 32, results 24, inline pair icons 20. All ≤ the 128 px source; at DPR 2 the 96 px card icon
  is upscaled slightly (128 → 192 device px), the others are sharp.
- Offer cards and the Mage «Fifth Circle» choice: large icon; «NEW» / «▲ II» as a corner badge off
  the symbol centre (the card text labels stay).
- HUD active skills: frameless icon on a soft dark disc, rank badge at the corner, dimmed while
  cooling, with a radial (conic) overlay = share of the cooldown left. The share needs the full
  cooldown, so `SkillCombatSnapshot` gained a read-only `cooldownTotals` (set at activation, never
  read by the simulation; arithmetic of `readyAt` unchanged).
- Pause: skill list headings (32 px), every synergy pair row shows both skills' icons; card hints
  («✦ Unlocks …», «▲ Synergy II/III») show the pair's icons. Additive data for that:
  `cardLevelRaises(...).pair` and `cardSynergyHints(...).unlocks[].withSkillIds`.
- Results / run stats: `skill:<id>` damage sources get their icon (`damageSourceSkill`); weapons,
  synergies, statuses, pets keep text only.
- Not changed: synergy banners (text only), DEV panels (optional in the spec; skipped).
- Tests: `tests/ui-kit/skill-icons.test.ts` (view / fallback / sizes / CSS reads every size /
  overlay share / pair ids / damage-source mapping), `tests/skills/combat.test.ts`
  (`cooldownTotals`). `mobile-browser`, `alpha-browser`, `skills-ui-browser` pass (left-handed
  44 px skill row still clear of the dash button).

## Phase 3 — delivery

- Checks (all pass): `npm run typecheck`, `npm test` (142 files, 1508 tests),
  `npm run format:check`, `npm run build`, `npm run test:e2e` (all seven browser suites, incl. the
  extended `art-browser.mjs`: icons on the HUD / offer / pause list on desktop 1280×720 and phone
  844×390 with the expected sizes, glyph fallback without the manifest), `npm run test:production`.
- "After" screenshots: `docs/art-pack-3/after-*.jpg` (same script and build as "before").
- Docs: `docs/ART_PACK.md` (skill icons section, manifest rules, verification, limits),
  `docs/IN_RUN_SKILLS.md` (read-only `cooldownTotals`, pair ids), README section.
- Not verified: real phones / GPUs, Safari / Firefox; the Cloudflare Preview is for the owner to
  check (the sandbox cannot open `*.workers.dev`).

## "Before" screenshots

`docs/art-pack-3/before-*.jpg`, written by `tests/art3-screens.mjs before` (dev server, `?debug`):
warrior with Ground Slam, Whirlwind, Cleave, War Cry, Battle Fury and Power. The page clock is
paused so only `__alpha.advance` moves the world; DOM banners therefore stay on the HUD shot (the
skill bar close-up `before-hud-skills.jpg` is the reference for the HUD icons).
