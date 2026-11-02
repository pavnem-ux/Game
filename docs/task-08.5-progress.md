# Task 08.5 — progress

Spec: [task-08.5.md](task-08.5.md) (owner's text, Prettier-formatted). Code map: reuse
[task-08-progress.md](task-08-progress.md#code-map) (additions below).

Current: Phase 1 done — waiting for "continue" (next: Phase 2, step 2.1)

Branch `task-08.5-playtest` from `task-08-campaign` (Task 08, PR #4). Draft PR targets
`task-08-campaign` so its diff shows only Task 08.5; retarget after PR #3/#4 are merged.

## Steps

### Phase 0 — Setup

- [x] 0.1 Branch, progress file, draft PR

### Phase 1 — Debug speed

- [x] 1.1 Time scale ×1/×2/×4/×8 on simulation time (same logic, same event order)
- [x] 1.2 God mode (no damage taken) + "kill all on screen" (normal deaths, drops, kill counts)
- [x] Tests: scheduled events fire once and in order at ×8; kill-all updates run stats

### Phase 2 — Run statistics

- [ ] 2.1 Run stats collector from existing combat events
- [ ] 2.2 Results screen stats panel
- [ ] 2.3 Debug overlay: live DPS (5 s) + total damage per source
- [ ] Tests: totals match damage events; stats reset between runs; summary in recentRuns

### Phase 3 — Bug reporting

- [ ] 3.1 Build version label on main menu + pause (build-time injection)
- [ ] 3.2 Error boundary + global handlers, last 5 errors in a separate key
- [ ] 3.3 «Сообщить о проблеме» report download (pause + results)
- [ ] 3.4 Debug: load a report → import its save (validated import)
- [ ] Tests: report fields; crash path leaves save intact

### Phase 4 — Reproducibility

- [ ] 4.1 Seeded RNG for gameplay randomness (audit; record anything not converted)
- [ ] 4.2 Per-run seed: overlay, results, reports; debug start with a seed
- [ ] Tests: same seed + inputs → identical spawn/card sequence for 2 min

### Phase 5 — Game feel

- [ ] 5.1 Floating damage numbers (crit style), pooled, capped
- [ ] 5.2 Enemy hit flash; player damage red vignette/flash
- [ ] 5.3 Screen shake (player damage, boss heavy attacks) + «Тряска экрана» setting
- [ ] Check: FPS with max enemies on Map 10 (debug overlay)

### Phase 6 — Playtest kit & delivery

- [ ] 6.1 `docs/playtest.md` (Russian)
- [ ] 6.2 Full regression + production build; no debug in production
- [ ] 6.3 PR description; mark ready (don't merge)

## Code map (Task 08.5 additions)

- 1.1 `src/engine/time-scale.ts` (`DEBUG_TIME_SCALES`, `frameStep`), scene `time-scale` command
  (presets only), `AlphaState.timeScale` (DEV/QA), panel group «Ускорение забега» ×1/×2/×4/×8;
  tests `tests/engine/time-scale.test.ts`.
- 1.2 `GameplayWorld.debugKillInView(view?)` (shared `killEnemies` with `clearEnemies`), testing
  action `kill-in-view`, scene command `kill-on-screen` (camera `worldView`), panel button
  «Убить всех на экране»; God Mode = existing `QaGameplayWorld.setGodMode` (panel toggle, all
  DEV/QA worlds incl. campaign); tests `tests/campaign/debug-speed.test.ts`.

- Existing pieces this task builds on (from Task 07.x/08):
  - Time scale: `AlphaScene.timeScale` + `time-scale` command (DEV/QA, 1–20, multiplies the
    frame delta of the same `GameplayWorld.update`) — 1.1 restricts/presets it to ×1/2/4/8.
  - God Mode: `src/gameplay/qa.ts` `QaGameplayWorld.godMode` (blocks only player HP loss via a
    Combat Core policy), QA panel toggle — 1.2 exposes it under `/?debug`.
  - `clear-enemies` testing action (`src/gameplay/testing.ts`) — check it uses normal deaths.
  - Seeded RNG: Combat Core RNG + separate spawn RNG already (AGENTS.md §4.5); `seed` option in
    `GameplayOptions`. 4.1 is an audit + gap fixes, not a rewrite.
  - World events `getEvents()` (bounded 160) — the stats collector must consume events per
    frame (or a dedicated listener), never rely on the bounded history.
  - Recent runs: `src/profile/profile.ts` `RecentRun`; schema `src/persistence/saveSchema.ts`.

## Decisions / deviations

- `docs/task-08.5.md` is the owner's spec verbatim, Prettier-formatted (whitespace only) for CI.
- Rule 5 mentions "the existing localization file": the alpha has none — Russian strings are
  inline in components, plus `src/gameplay-ui/save-messages.ts`. Proposal: new Task 08.5 player
  text goes into one new module `src/gameplay-ui/strings-ru.ts`; existing strings stay where they
  are (no unrequested refactor). Owner may redirect.

- 1.1: the scale multiplies the capped frame step (0.05 s × scale), so ×8 = 8× fewer, larger
  `GameplayWorld.update` calls through the same boundaries. Scheduled campaign events fire once,
  in order, at the same instants (up to float accumulation: ×1 may log 239.99999999999997 for
  240). Pre-existing and unchanged: enemy steering is sampled per update, so individual contact
  times/positions differ by a few ms between frame sizes (the same happens with real FPS jitter);
  rewards/deadlines are unaffected. Replaced the Task 08 1–20 slider (owner's ×1/2/4/8 spec).

- 1.2: kill-all kills through Combat Core (periodic damage, MAX_SAFE_INTEGER), so deaths,
  crystals, kill counts, elite/boss kills and boss-defeated are the normal deduplicated ones. The
  run-stats part of the test covers the existing run counters (kills, elite/boss kills,
  rewards); the Phase 2 collector gets its own kill-all test. God Mode was already present
  (Task 07.2) and is reused unchanged. Like `clearEnemies`, the world method itself ships in the
  production bundle but is unreachable there (no controller/UI); `test:production` checks the
  controller/UI markers.

## Blockers / known issues

- Cloudflare Preview cannot be opened by the agent (`*.workers.dev`).
