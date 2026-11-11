# Task 14 — Sound, Skill-Choice Control, Dash

Repo: pavnem-ux/Game. Base: latest `main` with Task 13 (UI kit) merged; if the kit is missing, stop
and report. Branch `task-14-sound-dash`. Progress: `docs/task-14-progress.md`.

## Rules

1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from
   the first unchecked step; resolve uncommitted leftovers first.
2. Per step: test → commit `Task 14: <step> <summary>` → push → tick in progress file.
3. Phases run back-to-back; stop only on a blocker or when done. Follow AGENTS.md: PR to `main`,
   never merge; invariants §4 (GameplayWorld is the only scheduler, Combat Core owns damage, seeded
   RNG, determinism). No new runtime dependencies, no audio files from other games, no CDN.
4. Reuse code maps from `docs/task-*-progress.md`; don't re-explore.
5. UI uses the Task 13 kit. Player text in Russian. Numbers in config, provisional in docs.

## 1. Spec

### 1.1 Sound (procedural, Web Audio API)

- New presentation-only module (e.g. `src/audio/`): synthesizes all sounds in code (oscillators,
  noise, envelopes, filters). Phaser audio stays disabled (`noAudio`).
- Listens to existing world/UI events; never feeds anything back into the simulation, so sound on/off
  can't change results. Silent in tests/headless.
- AudioContext starts on the first user gesture (browser autoplay policy).
- Sounds: UI hover/click/confirm/buy/error; player hit; enemy hit (physical/magical/DoT variants);
  crit; enemy death; elite/boss death; XP and coin pickup (pitch rises in quick series, resets after
  0.5 s); run level-up; card pick; reroll; banish; synergy unlocked; elite spawn alarm; boss spawn
  horn; boss/bombard telegraph warning; chest spawn and open; buff gained/expired; dash; low HP
  heartbeat (< 25% HP); revive; victory and defeat jingles.
- Music: simple generative ambient loop per act (pad + slow melody, different key/tempo per act),
  boss-phase variant, menu theme. Crossfade 1 s.
- Mixing: voice cap 24; per-sound rate limit (e.g. hits max 8 per 100 ms, pickups max 6 per 100 ms);
  light randomization of pitch/volume; master compressor to avoid clipping.
- Settings (persisted with existing settings, not in the profile save): Общая громкость, Эффекты,
  Музыка (0–100, defaults 80/80/50), «Без звука». Pause lowers music by 50%.

### 1.2 Skill-choice control (level-up offers)

- Reroll stays (3 per run).
- New «Изгнать» (banish): 2 per run; removes one offered skill from the pool for the rest of the run,
  card replaced via the existing reroll rules for that slot. Can't banish an owned skill's upgrade if
  it is the last eligible card.
- New «Пропустить» (skip): unlimited; closes the offer, grants coins = 2% of the map's victory Gold
  (min 3), normal coin rules.
- Counters shown on the offer screen; buttons disabled with tooltip when unavailable. Hotkeys: R
  reroll, B banish mode, S skip, 1–3 pick.
- All through `RunSkills` with the seeded RNG; same seed + same actions ⇒ same offers.
- Run stats/bug reports include rerolls, banishes, skips used and the banished list.

### 1.3 Dash

- Space or Shift: dash 140 units in the current movement direction (last non-zero direction if
  standing; default right) over 0.15 s. Cooldown 3.0 s. Not available while dead, paused, in an offer
  or revive prompt.
- Invulnerability 0.2 s from dash start through the existing Player Survival hit protection
  (no second protection system). Passes through enemies; stops at arena bounds/obstacles.
- Movement is resolved by the GameplayWorld on boundaries (dash start = input sample, dash end and
  cooldown end = new boundaries). Deterministic; frozen on pause.
- Dash does not trigger skills, synergies, talents or pickups by itself (pickups along the path work
  as normal movement collection).
- HUD: cooldown ring near the player or in the skill bar; afterimage trail VFX; dash sound.
- Run stats: dashes used, hits avoided during dash i-frames.

### 1.4 Debug (dev/QA only)

Mute toggle + audio event log overlay; grant rerolls/banishes; dash cooldown override.

## 2. Phases

### Phase 0 — Setup

- 0.1 Branch from `main`, progress file, draft PR.

### Phase 1 — Skill-choice control

- 1.1 Banish + skip in `RunSkills`. 1.2 Offer UI, hotkeys, counters. 1.3 Run stats.
- Tests: counters per run; banished skill never offered again; skip coins follow coin rules (victory
  all / defeat 50%); deterministic offers per seed with the same action sequence.

### Phase 2 — Dash

- 2.1 Dash state + boundaries. 2.2 Invulnerability via Player Survival. 2.3 HUD/VFX.
- Tests: distance/duration; bounds clamp; cooldown; i-frames block damage only inside 0.2 s;
  unavailable states; pause freezes; same seed + inputs ⇒ same positions; large vs small frame steps
  give identical results.

### Phase 3 — Sound

- 3.1 Audio engine (context, mixer, limits, settings). 3.2 SFX set. 3.3 Music. 3.4 Settings UI.
- Tests: event → sound mapping; rate limits and voice cap; volume settings persist; simulation results
  identical with audio on/off; no AudioContext created in tests.

### Phase 4 — Delivery

- 4.1 Full checks from AGENTS.md §6 (+ e2e, `test:production`).
- 4.2 Docs: `docs/AUDIO.md`, updates to `docs/IN_RUN_SKILLS.md` and `docs/PLAYER_SURVIVAL.md`,
  README, checks in `docs/playtest.md` (Russian; include "listen for clipping/too loud" checks).
- 4.3 PR description: changes, controls, test/build results, limitations. Don't merge.
