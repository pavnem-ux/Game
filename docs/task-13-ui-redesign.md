# Task 13 — Meta UI Redesign (characters, equipment, talents, map path)

Repo: pavnem-ux/Game. Base: latest `main` with Task 11 merged (Task 12 optional). Branch
`task-13-ui`. Progress: `docs/task-13-progress.md`.
Goal: menus that look and feel like a finished game. Presentation only — no gameplay changes.

## Rules

1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from
   the first unchecked step; resolve uncommitted leftovers first.
2. Per step: commit `Task 13: <step> <summary>` → push → tick in progress file.
3. Phases run back-to-back; stop only on a blocker or when done. Follow AGENTS.md: PR to `main`,
   never merge; React only renders state — purchase/equip/talent/unlock logic stays in existing
   pure modules; no new runtime dependencies; no external fonts/images/CDN (original procedural art:
   CSS, inline SVG, canvas).
4. Every existing action must stay reachable and behave the same. Don't weaken e2e tests — update
   selectors where markup changes.
5. In-run HUD and the Phaser scene are out of scope.
6. All text Russian, from the localization file.

## 1. Art direction

- Theme «Последний свет»: dark fairy tale — deep night-blue/ink backgrounds with subtle vignette and
  drifting light motes, warm candle-gold accent, parchment-like panels with thin ornamental borders.
- Design tokens (CSS variables): palette, tier colors (Обычный grey, Добротный green, Редкий blue,
  Эпический purple, Легендарный orange), spacing, radii, shadows, motion durations.
- Typography: system serif stack for headings, system sans for body/numbers; clear hierarchy.
- Motion: hover lift/glow, 150–250 ms transitions, panel slide-in; respect `prefers-reduced-motion`.
- Layout: 1280×720 → 1920×1080, min width 1024; no horizontal scroll.
- Input: mouse + keyboard (Tab focus visible, Enter confirms, Esc goes back).

## 2. Shared UI kit

Button (primary/secondary/danger/disabled), Panel, Tabs, Modal/confirm, Tooltip (stat compare),
ProgressBar (XP, HP), Currency badge (Gold), Tier frame, Class emblem (original inline SVG per class).
One place (`src/gameplay-ui/kit/` or similar); all redesigned screens use it.

## 3. Screens

- **Hub / main menu:** game title with glow, selected class emblem and level, Gold, big «В бой»
  button (opens map path), navigation: Персонаж, Экипировка, Таланты, Магазин, Настройки.
- **Character select:** 4 large class cards (emblem, name, role tags, level, XP bar, key stats as
  bars, talent points badge, equipped weapon). Selected card enlarged/glowing; quick buttons to
  Экипировка and Таланты of that class.
- **Equipment:** paper-doll layout — class silhouette in the centre, 4 slots around it with tier
  frames; owned items grid with tier colors and filters by slot; hover/selection shows a compare
  tooltip (+/- per stat, green/red); equip/unequip; link to the shop. Final stats panel.
- **Talents:** 3 branch columns, nodes as circular icons connected by lines, rank pips I–III,
  states (locked with reason tooltip, available glow, maxed gold), superpower branch visually special
  with «доступно с 30 уровня» seal; available points counter; buy with a short confirm animation.
- **Shop:** restyle to the kit (tier frames, price badges, owned/equipped stamps, locked overlay
  «откроется после карты N»).
- **Map path (linear):** vertical scrolling winding path with 40 nodes; 4 act regions with distinct
  backgrounds and act titles; node states: locked, available (pulsing), completed (best result),
  boss node per map icon, modifiers icons; the current progress node is centred on open; clicking a
  node opens a side panel (name, duration, difficulty, recommended level vs class level, rewards,
  modifiers, boss) with «В бой». Locked nodes show «Победите на карте N».

## 4. Phases

### Phase 0 — Setup

- 0.1 Branch from `main`, progress file, draft PR. Screenshot current screens (Playwright,
  1280×720) into `artifacts/` as the "before" set.

### Phase 1 — Kit

- 1.1 Tokens + background. 1.2 Components (section 2) with unit tests for logic-bearing parts
  (compare tooltip values, disabled states).

### Phase 2 — Screens

- 2.1 Hub. 2.2 Character select. 2.3 Equipment. 2.4 Talents. 2.5 Shop. 2.6 Map path.
- After each screen: e2e for its main action (select class, equip, buy talent, buy item, start map).

### Phase 3 — Polish & delivery

- 3.1 Keyboard/focus pass, reduced-motion pass, 1024/1280/1920 widths.
- 3.2 Full checks from AGENTS.md §6 incl. e2e and `test:production`.
- 3.3 "After" screenshots at 1280×720 and 1920×1080 for every screen; attach to the PR.
- 3.4 Docs: UI section in `docs/PLAYABLE_COMBAT_ALPHA.md`, README. PR description with before/after
  screenshots, test/build results, limitations. Don't merge.
