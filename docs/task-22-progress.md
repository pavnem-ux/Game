# Task 22 — progress

Spec: [task-22-hud-declutter.md](task-22-hud-declutter.md) (owner's file). Branch `task-22-hud` from
`main` at `af39a8c` (Tasks 16–21 merged). Presentation only: simulation, balance and economy
unchanged.

Current: Phase 5

Draft PR: https://github.com/pavnem-ux/Game/pull/20

## Checklist

- [x] 0 Branch, spec, progress file, draft PR, before screenshots
- [x] 1 Top: next-event countdown, info bar trimmed
- [x] 2 Bottom: removed elements, active skills bottom-left, pause menu completeness
- [x] 3 Offer screen: no hints / hotkeys / «Навыки»
- [x] 4.1 Rarity rows (equipment + shop)
- [x] 4.2 Equipped item details → forge deep link
- [x] 4.3 Equip panel placement
- [x] 4.4 Forge mode switch
- [ ] 5 Full checks, after screenshots, playtest, PR

## Decisions

- Before screenshots: `docs/hud/before-{desktop,mobile}-{run,offer,equipment,shop,forge}.jpg`
  (1280×720 and 844×390 with touch).
- Countdown: `nextEventCountdown(campaign.nextEvent, time)` (`src/gameplay-ui/next-event.ts`, pure).
  `campaign.nextEvent` is the world's earliest unfired schedule entry, so 2-elite events (same time)
  and the act's elite interval are already handled; seconds are rounded up; the end marker / no
  event → hidden. It uses simulation time, so it freezes with the world.
- The info bar keeps only the coins and the countdown. The «⚠ Элита через N с» alert is removed (the
  countdown says the same); the «⚠ Элита: <name>!» alert when an elite appears stays. The «Время
  вышло — добейте босса» line was part of the remaining-time element and is removed with it (the boss
  HP bar shows the boss). Campaign e2e updated: countdown present, removed texts absent, countdown
  hidden after the map duration.

- Bottom: the skill bar keeps gold, barrier, dash, pet and buffs; removed the «Навыки» button, the
  «Автоматические N/4 · Пассивные N/6» text, the passive icons and the map-name / wave caption.
  `ActiveSkills` (automatic skills only, 40 px icons, small rank, dimmed overlay with the seconds
  left) sits bottom-left above the weapon card; on short screens (landscape phones, where the weapon
  card is hidden) in the corner. Pointer events off, so joystick touches pass through.
- Pause menu completeness: it already showed active and passive skills with ranks, slot counts,
  cooldowns and synergy levels; it now also shows a run line (map, stage, time left / time up, wave)
  — everything the removed top/bottom elements showed.
- The in-run quick-look overview (opened only by the removed buttons) is deleted with them;
  `alpha-qa` / `skills-ui-browser` checks moved to the pause menu (no test removed: assertions now
  check the buttons are gone and the same data in the pause menu).
- Offer screen: hotkey hint line, the R / B / S / 1–3 handler and the «Навыки» button removed;
  banish hint no longer mentions 1–3. Mouse / touch buttons and Tab / Enter focus remain. Alpha e2e:
  pressing r/b/s/1/2/3/R/B/S leaves `world.skills` unchanged; banish / skip / pick done by clicks.
- Rarity rows: `meta/TierRows.tsx` groups the (already filtered) items by tier with a tier-coloured
  header and count; empty rows are hidden. Starter weapons (tier 0) sit in the «Обычный» row and keep
  their «Стартовое» label. Used by the Экипировка owned list and the Магазин grid (pets tab
  unchanged).
- Equipped item details: a filled paper-doll slot opens «Надетый предмет» (name with level, slot ·
  tier · +level, all current stats incl. the upgrade, «Снять», «Улучшить в кузнице», «Закрыть»); an
  empty slot still filters the owned list. «Улучшить в кузнице» calls `openForge(id, { page:
'equipment', characterClass })`; the forge then shows «← К экипировке», which returns to the same
  class (`campaignStore.forgeBack`). Presentation-only store state `forgeReturn`.
- Equip panel placement: the details / «Надеть» + compare panel renders at the top of the item area
  (above «Ваши предметы»), sticky at every size; on phones with a 60vh cap and its own scroll.
  Checked at 1280×720, 844×390, 390×844: «Надеть» is in the viewport after selecting the last item.
- Forge mode switch: the same «Разделы кузницы» group (kit `Tabs`, `aria-pressed`) moved out of the
  header into a large centred segmented control (`.forge-mode`, 48 px high, gold active segment,
  full width on phones).
- e2e: campaign (desktop) — «Надеть» in the viewport after selecting an item; equipped armor details
  → «Улучшить в кузнице» → forge on «Обычные латы +1» → Питомцы / Предметы → «К экипировке». Mobile
  (844×390, 768×1024, by touch) — the same with the helmet.

## Verification log
