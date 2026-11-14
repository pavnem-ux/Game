# Task 22 — progress

Spec: [task-22-hud-declutter.md](task-22-hud-declutter.md) (owner's file). Branch `task-22-hud` from
`main` at `af39a8c` (Tasks 16–21 merged). Presentation only: simulation, balance and economy
unchanged.

Current: Phase 2

Draft PR: https://github.com/pavnem-ux/Game/pull/20

## Checklist

- [x] 0 Branch, spec, progress file, draft PR, before screenshots
- [x] 1 Top: next-event countdown, info bar trimmed
- [ ] 2 Bottom: removed elements, active skills bottom-left, pause menu completeness
- [ ] 3 Offer screen: no hints / hotkeys / «Навыки»
- [ ] 4.1 Rarity rows (equipment + shop)
- [ ] 4.2 Equipped item details → forge deep link
- [ ] 4.3 Equip panel placement
- [ ] 4.4 Forge mode switch
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

## Verification log
