# Task 12 — Run Pacing, New Enemies, Pickup Radius, Chests

Repo: pavnem-ux/Game. Base: latest `main` with Task 11 merged (coins must exist in
`src/gameplay/coins.ts`; if not, stop and report). Branch `task-12-enemies-chests`.
Progress: `docs/task-12-progress.md`.

## Rules

1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from
   the first unchecked step; resolve uncommitted leftovers first.
2. Per step: test → commit `Task 12: <step> <summary>` → push → tick in progress file.
3. Phases run back-to-back; stop only on a blocker or when done. Follow AGENTS.md: PR to `main`,
   never merge; invariants §4 (Combat Core owns HP/damage/heal, GameplayWorld is the only scheduler,
   seeded RNG only, rewards deduplicated, caps applied once in `composeRunStats`).
4. Reuse code maps from `docs/task-*-progress.md`; don't re-explore.
5. This task is owner-approved to add new tie-order slots listed in 1.4 — no other reordering.
6. Player text in Russian. All numbers in config, marked provisional in docs.

## 1. Spec

### 1.1 Run XP pacing (problem: run level ~100 at 15:00)

- Level cost becomes `20 + 10·(L−1) + a·(L−1)²`, start with a = 0.25. Crystal values unchanged.
- Target with ALL XP collected (accelerated mode + debug auto-collect, reference build, map played at
  its recommended level; maps 1, 10, 25, 40): run level ≈ 70 at 15:00 (±5); record levels at
  5:00 / 10:00 / 15:00. Tune only `a`. Early levels (first ~3 min) must not get noticeably slower.
- Crystals never expire; no XP lost at the crystal cap; level-up healing rule unchanged.

### 1.2 New enemy types (data-driven per-type stats; map multipliers apply on top)

Base = existing melee enemy stats/speed.
| Id | Name | Behaviour | HP | Damage | Speed | Radius | Run XP |
|---|---|---|---|---|---|---|---|
| `swift` | Стремительный бес | existing melee | ×0.4 | ×0.6 | ×1.8 | 11 | 5 |
| `brute` | Каменный тролль | existing melee, attack interval ×1.4 | ×3.5 | ×1.8 | ×0.55 | 22 | 20 |
| `bombard` | Колдун-бомбардир | new `artillery` | ×0.8 | ×1.2 (magical) | ×0.7 | 15 | 12 |

- `artillery`: keeps range like the ranged enemy (attack range 420); every 3.2 s × existing attack
  interval multiplier it marks the player's current position with a red telegraph circle (radius 70);
  after 1.0 s deals magical AoE damage to the player if inside. Does not follow the player after the
  mark. Reuse the boss telegraphed-AoE code if it can be shared; damage only through Combat Core;
  enemy-ai owns the attack. Existing stun/slow/DoT rules apply to all new types.
- Spawn mix (config per act, shares of normal spawns, deterministic distribution like `rangedShare`):
  swift from map 2, brute from map 4, bombard from map 6.
  Act I max 15/8/5%, II 20/10/8%, III 20/12/10%, IV 22/14/12% (swift/brute/bombard); the rest is
  melee/ranged as now. Enemy cap 120 and reserved elite/boss slots unchanged. Elites/bosses unchanged.
- Distinct procedural visuals per type. 08.5 run stats (kills, damage taken by type) include them.

### 1.3 Pickup radius

`XP_RULES.pickupRadius` 42 → 74 (+75%); coins already share it. Check nothing else depends on the
old value (tests, crystal merging).

### 1.4 Chests

- Spawn: every 45 s of simulation time (first at 0:45) while the run is active, one chest at a seeded
  random position 250–450 units from the player, inside the arena, not overlapping another chest.
  Max 3 chests on the map; at the limit the spawn is skipped (timer keeps running). Lifetime 60 s,
  blinking for the last 5 s. Frozen during pause/level-up/revive prompt.
- Type roll: 75% «Деревянный сундук», 25% «Зачарованный сундук» (different look).
- Opened when the player touches it (player radius + chest radius 16; magnet radius does not open).
- Wooden: if HP < Max HP → 50% heal 15% Max HP / 50% gold; at full HP → always gold. Heal goes
  through Combat Core healing (never revives). Gold = coin pile worth max(5, 2% of map victory Gold),
  dropped at the chest, normal coin rules (victory: all, defeat: 50%).
- Enchanted, 25% each:
  - «Магнит»: instantly collects all XP crystals and coins on the map through the normal collection
    path (dedup, no loss, level-ups resolve normally).
  - «Ярость»: damage dealt +20% (physical and magical), 20 s.
  - «Быстрые руки»: attack speed +25%, 20 s.
  - «Лёгкий шаг»: movement speed +20%, 20 s.
    Buffs are temporary run modifiers through `composeRunStats` (caps once); same buff refreshes
    duration, doesn't stack; different buffs stack. Kept on revive, removed at run end.
- New world boundaries: chest spawn (tie order: after reinforcement spawning), chest expiry and buff
  expiry (with skill expirations). Chest open resolves as a pickup at the player-input/collision step.
- HUD: buff icons with remaining time; pickup popup «+15% HP», «+N золота», buff name.
- Run stats: chests spawned/opened by type, buff uptime. Bug reports include active buffs.

### 1.5 Debug (dev/QA only)

Spawn chest of a given type/content, grant any buff, spawn N enemies of a given type, show run-level
timeline overlay, auto-collect toggle (pulls all XP/coins every second; for pacing measurement).

## 2. Phases

### Phase 0 — Setup

- 0.1 Branch from `main`, progress file, draft PR.

### Phase 1 — Pacing & radius

- 1.1 Level cost formula. 1.2 Pickup radius.
- Tests: cost values for L = 1, 10, 30, 50; total XP never lost; pickup at 74 collects, at 75+
  radius + sizes does not.

### Phase 2 — Enemies

- 2.1 Per-type enemy stats config. 2.2 swift + brute. 2.3 `artillery` behaviour + bombard.
  2.4 Spawn mix per act.
- Tests: per-type stats and map scaling; telegraph → damage after 1.0 s only inside radius; mark
  doesn't follow; pause freezes telegraph; spawn shares per act within ±1 enemy over a wave set;
  cap respected; same seed → same spawn sequence; kills give the type's XP once.

### Phase 3 — Chests

- 3.1 Spawn/expiry scheduling. 3.2 Opening + wooden content. 3.3 Enchanted content + buffs.
  3.4 HUD, popups, run stats.
- Tests: spawn times 45/90/135 s; skipped at 3 chests; expiry at 60 s; frozen on pause; type and
  content rolls deterministic per seed; heal ≤ Max HP and no revive; gold follows coin rules;
  magnet collects everything once; buff refresh vs stack; caps; buffs end at run end.

### Phase 4 — Tuning & delivery

- 4.1 Tune `a` (1.1) and record the level table. Record per-act enemy mix and chest income in PR.
- 4.2 Full checks from AGENTS.md §6 (+ e2e). Docs: `docs/ENEMY_AI.md`, `docs/EXPERIENCE_WAVES.md`,
  new `docs/CHESTS.md`, README, checks in `docs/playtest.md` (Russian).
- 4.3 PR description: changes, tie-order additions, tables, test/build results. Don't merge.
