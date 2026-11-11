# Task 14 — progress

Spec: [task-14-sound-choice-dash.md](task-14-sound-choice-dash.md) (owner's file; Prettier only added
blank lines). Branch `task-14-sound-dash` from `main` at `4b29dec` (Task 13 UI kit merged:
`src/gameplay-ui/kit/` present). All new numbers are **provisional**.

Current: Phase 2 (dash)

Draft PR: https://github.com/pavnem-ux/Game/pull/13

## Checklist

- [x] 0.1 Branch from `main`, progress file, draft PR
- [x] 1.1 Banish + skip in `RunSkills`
- [x] 1.2 Offer UI, hotkeys, counters
- [x] 1.3 Run stats / bug reports
- [x] Phase 1 tests
- [ ] 2.1 Dash state + boundaries
- [ ] 2.2 Invulnerability via Player Survival
- [ ] 2.3 HUD / VFX
- [ ] Phase 2 tests
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
- Hotkeys 1–3 go to the scene as an index (`offer-key`): the UI snapshot is throttled (~10 Hz), so
  a fast second key press could otherwise name a card of the previous offer.
- Alpha e2e crystal walk (Task 12 setup): waits 40 ms after pressing a movement key before stepping,
  so the scene samples the key (it flaked when a crystal landed just outside the 74 reach).

## Verification log

- Phase 1: typecheck ✓, format ✓, `npm test` 1259 ✓, build ✓, `test:production` 2 PASS, QA + `test:qa` PASS, `test:e2e` 3 PASS (alpha 4/4 repeated).
