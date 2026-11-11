# Task 14 — progress

Spec: [task-14-sound-choice-dash.md](task-14-sound-choice-dash.md) (owner's file; Prettier only added
blank lines). Branch `task-14-sound-dash` from `main` at `4b29dec` (Task 13 UI kit merged:
`src/gameplay-ui/kit/` present). All new numbers are **provisional**.

Current: Phase 3 (sound)

Draft PR: https://github.com/pavnem-ux/Game/pull/13

## Checklist

- [x] 0.1 Branch from `main`, progress file, draft PR
- [x] 1.1 Banish + skip in `RunSkills`
- [x] 1.2 Offer UI, hotkeys, counters
- [x] 1.3 Run stats / bug reports
- [x] Phase 1 tests
- [x] 2.1 Dash state + boundaries
- [x] 2.2 Invulnerability via Player Survival
- [x] 2.3 HUD / VFX
- [x] Phase 2 tests
- [ ] 3.1 Audio engine (context, mixer, limits, settings)
- [ ] 3.2 SFX set
- [ ] 3.3 Music
- [ ] 3.4 Settings UI
- [ ] Phase 3 tests
- [ ] 4.1 Full checks (AGENTS.md §6 + e2e, `test:production`)
- [ ] 4.2 Docs (`AUDIO.md`, `IN_RUN_SKILLS.md`, `PLAYER_SURVIVAL.md`, README, `playtest.md`)
- [ ] 4.3 PR description

## Code map (Task 14)

Earlier maps: `docs/task-13-progress.md`, `docs/task-12-progress.md`.

- Offer controls (1.1): `SKILL_RULES.banishesPerRun` 2. `RunSkills`: `banishesLeft`, `banished`
  set (filtered out of `pools()` for the rest of the run), `skipped`; `banishBlockReason(key)`
  (`no-offer` / `not-skill` / `none-left` / `last-upgrade`), `banish(key)` (replaces only that card
  via `offers.replacementCard`: never a card already offered, same category first; an empty offer
  falls back to the bonus offer), `skip()` (closes the offer, next queued offer follows),
  `grantChoiceControls` (debug). Snapshot `banishes`, `banished`, `skips`, `banishBlocked`. Events
  `skill-banished`, `skill-offer-skipped`.
- World: `banishSkillCard`, `skipSkillOffer` (campaign: `coins.grant(skipCoins(map))`, event
  `coins-granted`; `COIN_RULES.skipShare` 0.02, `skipMin` 3 in `src/equipment/economy.ts`),
  `debugGrantChoiceControls`; controller `grant-choices`. Skill-channel events feed `RunStats`
  (`choices {rerolls, banishes, skips, banished}`; bug reports carry run stats).
- UI (1.2): bridge `banish-skill`, `skip-offer`, `offer-key {index, banish}` (hotkeys 1–3 resolved
  by the scene against the world's current offer); `LevelUpDialog` controls row (kit buttons in a
  `.meta-ui` group «Управление выбором»: «Перебросить · осталось N», «Изгнать · осталось N» /
  «Отменить изгнание», «Пропустить · +N монет»; reasons as tooltips), banish mode with dashed
  cards, hotkeys R / B / S / 1–3 (also Russian layout К / И / Ы). Strings `RU.meta.offer`.
- Tests: `tests/skills/offer-controls.test.ts`; alpha e2e banish/skip/hotkeys.
- Dash (2.1–2.3): `DASH_RULES` (140 / 0.15 s / 3 s / 0.2 s) in `src/gameplay/config.ts`. World:
  `requestDash()` (queued; starts at the next input sample in `movePlayer`), `dashBlockReason()`
  (`dead` / `paused` (incl. offers) / `dashing` / `cooldown`), `startDash` (direction = input or
  `facing`, distance cut at the arena bounds along the line), position as a pure function of time
  (`dashPosition`), boundaries `dash-end` (rank −0.5, snaps to the end point) and `dash-ready`
  (rank −0.4) — both only while the player can act; `setDebugDashCooldown`. I-frames:
  `PlayerSurvival.grantProtection(seconds, 'dash')` (additive; extends `directUntil`, event
  `protection-granted`). Hits blocked inside the latest dash window (`dashGuardUntil`) are counted
  (`noteBlockedHit` in `consumeEnemies` and the boss strike). Channel `movement`: `dash-started`,
  `dash-ended`, `dash-ready`, `dash-hit-avoided`; snapshot `dash {active, startedAt, from, to,
readyAt, cooldown, used, hitsAvoided}`; `RunStats.dash {used, hitsAvoided}`.
- Input/HUD: `AlphaScene` Space / Shift → `requestDash` (not in form fields; prevents a focused
  button from also taking Space during play); afterimage ghosts along the dash line (0.4 s) and a
  gold cooldown ring around the player; skill bar «⇢ Рывок» / «⇢ N.N с» (aria «Рывок готов
  (Пробел / Shift)» / «Рывок: N.N с»). Controller `dash`, `dash-cooldown`.
- Tests: `tests/gameplay/dash.test.ts`; alpha e2e Space dash + cooldown label.

## Decisions

- «Can't banish an owned skill's upgrade if it is the last eligible card»: applied literally — an
  upgrade card is blocked when the pools hold ≤ 1 eligible skill; a new skill may still be banished
  (an empty offer then becomes the bonus fallback, like pool exhaustion). Bonus cards are never
  banishable.
- Banish keeps the offer id and the other two cards; the replacement uses the run's seeded skill
  stream, so the same seed + actions give the same offers.
- Skip is allowed in any offer (skills or bonus) and pays coins only in campaign runs (coins exist
  only there). The coins join the collected total (event `coins-granted`), so victory pays them all
  and defeat 50%, like picked-up coins.
- Dash i-frames use the hit protection (direct hostile damage), like a hit's 0.3 s protection; DoT
  ticks are not blocked (they are blocked only by the revival's full protection).
- At the arena edge the dash stops on its line (no sliding along the wall); the duration stays
  0.15 s (shorter distance, same speed until the stop).
- Dash end and cooldown end rank just before the input sample at equal times (−0.5 / −0.4), so the
  input sample at the dash end already moves normally. Mid-dash the position updates on the 60 Hz
  input samples like normal movement.
- Hotkeys 1–3 go to the scene as an index (`offer-key`): the UI snapshot is throttled (~10 Hz), so
  a fast second key press could otherwise name a card of the previous offer.
- Alpha e2e crystal walk (Task 12 setup): waits 40 ms after pressing a movement key before stepping,
  so the scene samples the key (it flaked when a crystal landed just outside the 74 reach).

## Verification log

- Phase 2: typecheck ✓, format ✓, `npm test` 1265 ✓, build ✓, `test:production` 2 PASS, QA + `test:qa` PASS, `test:e2e` 3 PASS.

- Phase 1: typecheck ✓, format ✓, `npm test` 1259 ✓, build ✓, `test:production` 2 PASS, QA + `test:qa` PASS, `test:e2e` 3 PASS (alpha 4/4 repeated).
