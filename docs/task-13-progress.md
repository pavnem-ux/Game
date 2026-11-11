# Task 13 — progress

Spec: [task-13-ui-redesign.md](task-13-ui-redesign.md) (owner's file; Prettier only added blank lines).
Branch `task-13-ui` from `main` at `095ec2d` (Tasks 11 and 12 merged). Presentation only — no
gameplay changes.

Current: Phase 3 (polish & delivery)

Draft PR: https://github.com/pavnem-ux/Game/pull/12

## Checklist

- [x] 0.1 Branch from `main`, progress file, draft PR, "before" screenshots (1280×720)
- [x] 1.1 Tokens + background
- [x] 1.2 Components + unit tests (compare tooltip values, disabled states)
- [x] 2.1 Hub
- [x] 2.2 Character select
- [x] 2.3 Equipment
- [x] 2.4 Talents
- [x] 2.5 Shop
- [x] 2.6 Map path
- [x] e2e per screen (select class, equip, buy talent, buy item, start map)
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
- Shell (2.x): `CampaignMenu.tsx` — `.meta-ui` root, `Backdrop` (act backdrop on the map path), top
  bar (brand → hub, nav «Главное меню»: Главная / Персонаж / Экипировка / Таланты / Магазин / Карта
  похода / Прогресс / Настройки, one Gold badge), Esc → hub (modals and the DEV panel handle their
  own Esc), content slides in. `MenuPage` `play` → `hub`, new `equipment` / `talents`; UI-only
  `viewClass` + `campaignStore.openForClass(page, class)` (reset by `setPage`).
- Screens in `src/gameplay-ui/meta/`: `Hub.tsx` (title with glow, selected hero panel with emblem,
  level and XP, hero quick-switch strip «Воин Меч» …, «В бой» → map path, quick start «Начать
  забег · карта N», section tiles), `CharacterSelect.tsx` (4 cards: emblem, role tags, talent points
  badge, XP bar, key stats as bars relative to the best class — with gear and talents via
  `permanentStats`, weapon, «Выбрать» / quick links «Экипировка: Класс», «Таланты: Класс»),
  `EquipmentScreen.tsx` (paper doll with SVG silhouette and 4 tier-framed slots — click filters,
  «Снять»; owned grid with slot filter tabs; hover/focus compare tooltip; selection → «Предпросмотр
  снаряжения» with +/− and «Надеть»; final stats table; link to the shop), `TalentsScreen.tsx`
  (class tabs, free points pill, 3 columns of circular nodes joined by a line, rank pips I–III,
  statuses locked / available glow / partial / maxed gold, superpower column violet with the seal
  «доступно с 30 уровня», detail panel «Описание таланта» with ranks and «Изучить ранг X»,
  learn glow 700 ms), `MapPath.tsx` (`mapNodePosition`: map 1 at the bottom, act banners, sine
  winding; SVG trail gold where completed / dashed ahead; nodes with state, ✓, boss crest ♚ and
  modifier icons; centres the selected map on open; side panel with act, duration, difficulty,
  recommended vs class level, rewards, modifiers, boss (??? while locked), best result, «В бой»
  `Играть: карта N`, lock reason «Победите на карте N»), `meta.css`.
- Shop (2.5): `ShopPages.tsx` restyled (kit Tabs «Слоты магазина», tier frames, price badge
  «Купить · ◎ N» with `disabledReason`, «Куплено» / «Надето» stamps, locked overlay «откроется
  после карты N», purchase confirmation = kit `ConfirmModal`). The old `EquipmentPanel`,
  `CharacterPage`, `MapsPage` and `TalentsPanel.tsx` are removed (replaced); Progression keeps its
  data, in kit panels, with links to Equipment / Talents instead of the stale «скоро» card.
- `alpha.css`: 100 dead rule blocks of the old menu removed (script-checked: only selectors whose
  classes no longer occur in the source).

## Decisions

- Hub keeps a hero quick-switch strip and a quick start («Начать забег · карта N») in addition to
  «В бой» → map path, so every old one-click action stays one click away (class choice + start).
- The map's «В бой» lives in the side panel of the selected node only; the e2e opens the node first.
- Gold is shown once (top bar) on every page; the hub card and shop header do not repeat it.
- Talent purchase: the learn button is in the detail panel (no modal); confirmation is the short
  glow animation and a status line. Shop purchases keep a confirm step (now a modal dialog).
- Phase 2 screens were built together and committed as one step (they share the shell and CSS).
- e2e updates (no assertion removed): nav labels; character card text «Опыт 0 / 100» and the
  talent-points badge label; map checks moved from cards to the side panel (same facts: lock
  reason, recommended level, modifiers, hidden boss, disabled start); talents pick a node then use
  the detail panel; shop buy button text «Купить · ◎ 80» and the confirm dialog; equipment via the
  owned grid instead of a select; compare text `Здоровье\s+\+N`; the DEV panel is closed while
  pressing the map's «В бой» (it covers the right side). New checks: hub «В бой» → map path, Esc →
  hub, quick link «Экипировка: Маг» → `Снаряжение: Маг`.

## Verification log

- Phase 2: typecheck ✓, format ✓, `npm test` 1252 ✓, build ✓, `test:production` 2 PASS, QA build +
  `test:qa` PASS, `test:e2e` 3 PASS (incl. phone width 390 px on every page).
- Phase 1: typecheck ✓, format ✓, `npm test` 1252 ✓ (kit 8), build ✓.
