# Talent combat effects (Task 09.1)

Spec: [task-09.1-talent-effects.md](task-09.1-talent-effects.md). Catalog: [talents.md](talents.md)
(v1.2, alpha-approved, byte-identical to the owner's file). Gap resolution and engine conflicts:
[talents-gaps.md](talents-gaps.md). Step log, code map and per-phase decisions:
[task-09-progress.md](task-09-progress.md).

## Status

| Class   | Ranks | Ready | Blocked                                    |
| ------- | ----- | ----- | ------------------------------------------ |
| Rogue   | 42    | 38    | `b1.n02` II–III (E1), `b3.n03` II–III (E2) |
| Mage    | 42    | 42    | —                                          |
| Warrior | 42    | 42    | —                                          |
| Archer  | 42    | 40    | `b1.n05` II–III (E3)                       |
| Total   | 168   | 162   | 6                                          |

A rank is active in combat only when it is `ready` (implemented and tested). Blocked ranks stay
inert (a blocked rank II/III of a node is inert as a whole, because catalog ranks are totals) and
the talent screen marks them «пока не действует в бою». `tests/talents/coverage.test.ts` enforces
this: no `pending` rank, exactly E1–E3 blocked, every behaviour parameter read by its handler.

## Architecture

- **Data:** `src/talents/effect-data.ts` — per node and rank the catalog numbers as `stat` effects
  (composed with run modifiers by `composeRunStats`, caps once) or `behavior` params.
- **Runtime:** `src/talents/runtime.ts` (owned by the Skill Engine, simulation time only): active
  rank/params, seeded `talents` RNG stream, cooldowns, refresh-not-stack buffs, the proc guard,
  entities (shadow copy, ballistae), stamps/counters. `anyActive` short-circuits every hook for
  talent-free runs.
- **Dispatcher:** `src/talents/combat.ts` (`TalentCombat`) — called at existing combat points
  (hit multiplier, crit chance at snapshot creation, DoT factor/duration, AoE/zone factors, Slow/
  Stun bonuses, dodge/hit/kill/HP reactions, auto actions). Handlers per class in
  `src/talents/handlers/`.
- **No second scheduler:** talent timers are boundaries of the Skill Engine (and the off-hand sword
  a secondary weapon on the existing weapon scheduler). Tie order is unchanged; talent entries sort
  after existing Skill Engine entries of the same priority.

## Shared combat rules

- Direct-damage bonuses apply only to the player's direct hits, never to DoT, talent, synergy or
  other secondary hits, unless a node says so. Talent % bonuses of one hit are summed, then applied
  once; crit-damage bonuses use the snapshot's own crit multiplier and apply to crits only.
- Every talent-created hit has a `talent:<nodeId>` source (own run-stats row), `procs=false`, never
  triggers talent procs, passives or synergies (proc guard + tags `talent`/`secondary`).
- Crit chance is rolled once per attack snapshot (Combat Core); this is why the per-target crit
  ranks E1/E3 are blocked.
- Death clears talent entities; revival continues the same world (cooldowns keep running on
  simulation time; the off-hand sword resumes, a ballista is re-summoned by its rule).

## Additive engine APIs (all backward compatible)

- Combat Core `AttackRequest.noCritical`.
- Weapon Attacks: `attackModifier` option, `DamageModifierContext.targetCount` (melee targets are
  selected before resolution), `equipSecondaryWeapon` / `getSecondaryWeaponState`.
- Status Effects option `damageMultiplier(group)`.
- Enemy AI option `playerDamageMultiplier(attack)` (G12).
- Run Skills: `enableExtraAutoSlot`, `autoSlots`, enhanced skill (`enhancedSkillId`,
  `chooseEnhanced`), `grantWithEvents`; offers take the run's slot maximum.
- Gameplay World: `chooseEnhancedSkill(id)`; snapshot `talentEntities`; bonus Barrier follows the C2
  single-slot rule.

## G11 — Piercing Arrow falloff (the only new mechanic)

Only with `archer.b1.n03`: Piercing Arrow gets +1/+2/+3 targets and loses 20/15/10% per target it
already hit (multipliers 1.0, 0.8, 0.64 … at rank I). The first target's damage and every other
projectile are unchanged; without the talent Piercing Arrow behaves exactly as before.

Balance impact (provisional, rank I vs. no talent, Piercing Arrow rank I with pierce 2): the base
arrow hits 3 targets for 1 + 1 + 1 = 3.0× its damage; with rank I it hits 4 targets for 1 + 0.8 +
0.64 + 0.512 = 2.95× — about the same total, spread over one more target. Rank II (5 targets, 15%)
gives 1 + 0.85 + 0.72 + 0.61 + 0.52 = 3.71×; rank III (6 targets, 10%) 1 + 0.9 + 0.81 + 0.73 + 0.66

- 0.59 = 4.69×. The gain only appears against lines of 4+ enemies.

## Limits and what was not verified

- All numbers are provisional alpha values from the catalog; no balance pass was done.
- Damage previews in the skill UI show skill coefficients and stats; conditional talent bonuses
  (on-hit conditions, procs) are not part of the preview.
- The live browser smoke (DEV preset, Map 1) confirmed the Warrior off-hand, the Mage 5th slot and
  enhanced choice, and Archer ballistae. Rogue Poison/Burn procs were confirmed by world tests; at
  level 30 early-map enemies die in one dagger hit, so the statuses were not visible live.
- Cloudflare Preview: to be checked by the owner.

## Changelog

- 09.1 Phase 0: catalog v1.2, rank status model `pending`/`ready`/`blocked`, resolution table.
- Phase 1: shared talent runtime (conditions, cooldowns, buffs, proc guard, entities).
- Phase 2: Rogue b1–b2 (G3, G4, C8); E1 blocked.
- Phase 3: Rogue b3 (G1, G2, G5); E2 blocked.
- Phase 4: Mage b1–b2 (C2).
- Phase 5: Mage b3 (C1 fifth slot and enhanced skill, UI dialog).
- Phase 6: Warrior b1–b2 (C3, C6, G12).
- Phase 7: Warrior b3 (G6, G7, C4 off-hand sword).
- Phase 8: Archer b1–b2 (G11); E3 blocked; talent-free fast path.
- Phase 9: Archer b3 (G8, G9, G10, C7 ballistae); entity rendering.
- Phase 10: coverage test, full regression, playtest smoke checklist, docs.
