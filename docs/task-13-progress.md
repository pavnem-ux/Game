# Task 13 — progress

Spec: [task-13-ui-redesign.md](task-13-ui-redesign.md) (owner's file; Prettier only added blank lines).
Branch `task-13-ui` from `main` at `095ec2d` (Tasks 11 and 12 merged). Presentation only — no
gameplay changes.

Current: Phase 2 (screens)

Draft PR: https://github.com/pavnem-ux/Game/pull/12

## Checklist

- [x] 0.1 Branch from `main`, progress file, draft PR, "before" screenshots (1280×720)
- [x] 1.1 Tokens + background
- [x] 1.2 Components + unit tests (compare tooltip values, disabled states)
- [ ] 2.1 Hub
- [ ] 2.2 Character select
- [ ] 2.3 Equipment
- [ ] 2.4 Talents
- [ ] 2.5 Shop
- [ ] 2.6 Map path
- [ ] e2e per screen (select class, equip, buy talent, buy item, start map)
- [ ] 3.1 Keyboard/focus, reduced motion, 1024/1280/1920 widths
- [ ] 3.2 Full checks (AGENTS.md §6 incl. e2e and `test:production`)
- [ ] 3.3 "After" screenshots 1280×720 and 1920×1080
- [ ] 3.4 Docs (`PLAYABLE_COMBAT_ALPHA.md` UI section, README), PR description

## Code map (Task 13)

- Screenshots: `tests/ui-screenshots.mjs` (not a test; dev server; `SHOT_PREFIX`, `SHOT_SIZES`,
  `SHOT_PAGES`) with the showcase save `tests/fixtures/ui-showcase-profile.json` (generated and
  validated by `tests/fixtures/make-ui-showcase-profile.ts`: maps 1–12 won, warrior 13, mage 5,
  archer 3, rogue 32 with 15 talent ranks, 4 items, 2530 Gold). Output in the ignored
  `artifacts/ui/`; the PR set is copied as JPEG (quality 82) to `docs/ui/before|after/`, because the
  GitHub API cannot attach images to a PR description.
- Current menu (before): `CampaignMenu.tsx` (tabs Играть / Персонаж / Карты / Магазин / Прогресс /
  Настройки, Gold), `CampaignPages.tsx` (Character, Maps, Progression with `TalentsPanel`),
  `ShopPages.tsx` (Shop, `EquipmentPanel` on the Character page), `SaveManagement.tsx` (Settings),
  styles in `alpha.css`, Russian text in `strings-ru.ts`.
- Kit (1.1–1.2): `src/gameplay-ui/kit/` — `tokens.css` (palette night-blue/ink, candle-gold,
  parchment; tier colours; class accents; spacing, radii, shadows; motion 150/200/250 ms, 0 with
  `prefers-reduced-motion`; serif headings / sans body), `kit.css`, `components.tsx` (`Backdrop`
  with vignette and deterministic drifting motes, `Button` primary/secondary/danger/ghost with
  `disabledReason` → disabled + title + accessible description, `Panel` with ornamental corners,
  `Tabs` (aria-pressed group, arrow keys), `ConfirmModal` (focus to confirm, Enter/Esc, focus
  return), `Tooltip`, `CompareList`, `ProgressBar`, `CurrencyBadge` («Золото: N»), `TierFrame`),
  `ClassEmblem.tsx` (original inline SVG crest per class), `logic.ts` (`STAT_ROWS`,
  `compareStats`, `disabledReason`, `progressFraction`, `formatGold`, `formatStat`, `romanRank`).
  Everything is scoped to `.meta-ui` (the menu root), so the in-run HUD is untouched.
- Strings: `RU.meta` in `strings-ru.ts` (nav, hub, character, stats, equipment, talents, shop,
  maps, modal).
- Tests: `tests/ui-kit/kit-logic.test.ts` (vitest include `tests/ui-kit/**`).

## Decisions

## Verification log

- Phase 1: typecheck ✓, format ✓, `npm test` 1252 ✓ (kit 8), build ✓.
