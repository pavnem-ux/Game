# Task 09 / 09.1 — talent catalog gaps and their resolution

## Resolution table (catalog v1.2, Task 09.1)

Catalog v1.2 (`docs/talents.md`, alpha-approved 02.11.2026) answers every gap below in its appendix
G0–G12 / C1–C8. Status is updated as each Task 09.1 phase lands (code + test references are
added when a row is resolved). Engine conflicts found during implementation are listed under
«Engine conflicts (Task 09.1 rule 6)».

| ID  | Node / ranks            | Decision (v1.2 appendix)                                                                                                           | Status                                                                                                                                         |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| G0  | all 168 ranks           | Catalog v1.2: all values approved for alpha (02.11.2026)                                                                           | resolved — `TALENT_CATALOG_APPROVED = true`                                                                                                    |
| G1  | `rogue.b3.n01` I–III    | Poison/Burn tick 1.5 / 2 / 3 per stack, 1 s timer, separate rolls                                                                  | **resolved** — `src/talents/handlers/rogue.ts` (`superpowerProcs`), `tests/talents/rogue-b3.test.ts`                                           |
| G2  | `rogue.b3.n01` I–III    | Poison/Burn duration 4 s, shared group timer                                                                                       | **resolved** — `src/talents/effect-data.ts` (`rogue.b3.n01` duration 4), `tests/talents/rogue-b3.test.ts`                                      |
| G3  | `rogue.b2.n03` I–III    | Shadow copy: 45 behind, follows, max 1, nearest in 180, period 1.2 s, ×0.20, no DoT/synergy/counter                                | **resolved** — `src/talents/handlers/rogue.ts` (shadow copy), `tests/talents/rogue.test.ts`                                                    |
| G4  | `rogue.b2.n04` I–III    | Copy speed ×1.00/1.10/1.20 (interval 1.2/×), damage 0.35/0.50/0.65 × physicalDamage, no crit                                       | **resolved** — `src/talents/handlers/rogue.ts` (`copyInterval`, `noCritical`), `tests/talents/rogue.test.ts`                                   |
| G5  | `rogue.b3.n04` I–III    | Explosion radius 80/100/130, ×1.5/2.0/2.6, one hit per target, target CD 8 s, procs=false                                          | **resolved** — `src/talents/handlers/rogue.ts` (`synthesis`), `tests/talents/rogue-b3.test.ts`                                                 |
| G6  | `warrior.b3.n01` I–III  | Off-hand sword: period 1.4 s, range 100, arc 100°, own timer, ×0.45/0.60/0.75                                                      | pending (Phase 7)                                                                                                                              |
| G7  | `warrior.b3.n02` I–III  | Off-hand interval 1.4/(1+8/15/22%); crit bonus after caps                                                                          | pending (Phase 7)                                                                                                                              |
| G8  | `archer.b3.n01` I–III   | Ballista: invulnerable, untargeted, interval 1.6 s, range 420, nearest (id asc), 60 behind, 600 u/s, damage 20+0.15/0.25/0.35×phys | pending (Phase 9)                                                                                                                              |
| G9  | `archer.b3.n02` I–III   | Interval 1.6/(1+10/18/28%), range 420/462/495.6                                                                                    | pending (Phase 9)                                                                                                                              |
| G10 | `archer.b3.n04` II–III  | Poison from acquired `toxic_volley` ×0.25/×0.40, its duration, procs=false                                                         | pending (Phase 9)                                                                                                                              |
| G11 | `archer.b1.n03` I–III   | New Piercing-Arrow-only falloff 20%/15%/10% per pierce                                                                             | pending (Phase 8)                                                                                                                              |
| G12 | `warrior.b2.n02` II–III | Talent direct-hit reduction ×0.98/×0.96 after resistance, round once, min 1                                                        | **resolved** — EnemyAI `playerDamageMultiplier`, `src/talents/handlers/warrior.ts`, `tests/talents/warrior.test.ts`                            |
| C1  | `mage.b3.n01`–`n04`     | Enhanced = skill in the 5th slot at acquisition; Variant B choice only at acquisition                                              | **resolved** — `RunSkills` (5th slot, enhanced choice), `src/talents/handlers/mage.ts`, `EnhancedSkillDialog`, `tests/talents/mage-b3.test.ts` |
| C2  | `mage.b2.n03` I–III     | One shared barrier slot: stronger replaces, weaker only extends expiry; trigger hit not absorbed                                   | **resolved** — `SkillEngine.grantBarrier`, `src/talents/handlers/mage.ts`, `tests/talents/mage.test.ts`                                        |
| C3  | `warrior.b2.n05` I–III  | Resistance while HP < 30%; heal on crossing ≥30%→<30% from damage, CD 30 s                                                         | **resolved** — `conditionalStats` / `onPlayerHpChanged`, `src/talents/handlers/warrior.ts`, `tests/talents/warrior.test.ts`                    |
| C4  | `warrior.b3.n03` I–III  | Cross-strike ×0.5/0.75/1.0 × physicalDamage, both swords in 2 s, target CD 4/3.5/3 s                                               | pending (Phase 7)                                                                                                                              |
| C5  | `rogue.b3.n03` II–III   | Tie-break Poison→Burn→Bleed; Bleed only with `serrated_blades`; added stack values                                                 | **blocked** (E2) — rank I works: `dotTakenMultiplier`, `tests/talents/rogue-b3.test.ts`                                                        |
| C6  | `warrior.b1.n05` I–III  | Talent cap: maxStacks×1 / 16 / 24 п.п.; 0 without Battle Fury                                                                      | **resolved** — `buffStackBonus`, `src/talents/handlers/warrior.ts`, `tests/talents/warrior.test.ts`                                            |
| C7  | `archer.b3.n01`–`n03`   | Auto-summon, shared 30 s CD, max 2, CD not spent when full, frozen on pause                                                        | pending (Phase 9)                                                                                                                              |
| C8  | `rogue.b2.n05` III      | ×1.15 on the n02 counterattack only                                                                                                | **resolved** — `src/talents/handlers/rogue.ts` (counter ×`counterMultiplier`), `tests/talents/rogue.test.ts` «C8»                              |

## Engine conflicts (Task 09.1 rule 6)

| #   | Node / ranks          | Where                                                                                                                                                  | Problem                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Proposed narrow fix                                                                                                                                                                                                                                                                                                     |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | `rogue.b1.n02` II–III | `src/combat-core/attack.ts:22-37` (one crit roll per snapshot), `src/weapon-attacks/WeaponAttacks.ts:350` (dagger snapshot hits a 100° sector)         | «по врагам с Bleed (5+) дополнительно +2/+3 п.п.» is a per-target crit chance, but a dagger strike rolls crit once for every enemy it hits (Combat Core rule: one crit roll per attack snapshot). A faithful per-target bonus would need a crit rule change.                                                                                                                                                                                                                                                     | Owner picks one: (a) evaluate the condition on the strike's aimed target only (the one targeting chose), or (b) allow a per-target crit roll for talent-conditioned bonuses (Combat Core rule change). Rank I (unconditional +3 п.п.) works.                                                                            |
| E2  | `rogue.b3.n03` II–III | `docs/talents.md:160-162` (catalog text), `src/gameplay/config.ts:110-121` (`defaultOnHit`: the Rogue's basic dagger always applies Bleed 3/tick, 4 s) | (1) «вероятность 20%/30% добавить 1 стак того DoT, которого меньше (CD цели 3/2 с)» has no trigger: neither the rank text nor C5 says when the chance is rolled (each DoT tick? each direct hit? each application?). (2) C5 says the basic dagger has no Bleed without `serrated_blades` and takes the added Bleed stack from that skill, but in the alpha the basic dagger already applies its own Bleed through `defaultOnHit`, so the «Bleed excluded» rule and the Bleed stack source contradict the engine. | Owner confirms: (a) the trigger — proposed: one roll per direct hit on a target that has all 3 DoT types, per-target CD 3/2 s; (b) the Bleed source — proposed: the basic dagger's `defaultOnHit` Bleed counts as the dagger Bleed (no exclusion), its definition gives the added stack. Rank I (+10% DoT taken) works. |

---

## Original Task 09 audit (catalog v1.0, kept for reference)

Audit of [talents.md](talents.md) against Task 09 §1 (56 nodes × 3 ranks = 168 rank effects) and
against the existing game systems (Task 06–08.5 code). Rule 6 applies: nothing below is filled in
by the developer; every item needs an owner decision before its rank can have an effect. Until
then the affected ranks are loaded as **inert** (purchasable per the tree rules, no combat effect),
marked missing in the config.

## Summary

| Check                                    | Result                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| Classes / branches / nodes               | 4 / 12 / 56 — complete (5+5+4 per class, ids `<class>.b<1-3>.n0<1-5>`)            |
| Rank texts I–III                         | 168 / 168 present                                                                 |
| Catalog approval status                  | **Not approved** — the catalog says all numbers are a balancing proposal (see G0) |
| Ranks with a missing/undefined parameter | **28** distinct ranks (blocking, see G1–G12)                                      |
| Ranks needing only a rule clarification  | **26** further distinct ranks (see C1–C8)                                         |
| Fully defined, implementable ranks       | **114** (pending G0 approval)                                                     |

## G0 — catalog status (blocking for all 168 ranks)

The catalog itself states: «Статус числовых параметров: ПРЕДЛОЖЕНИЕ ДЛЯ БАЛАНСИРОВКИ, НЕ
УТВЕРЖДЕНО» and «Полного ранее утверждённого набора 168 числовых эффектов нет… перед передачей в
разработку требуется утверждение». Task 09 calls `docs/talents.md` the approved catalog. **Owner
decision needed:** approve the numbers as they are (then G1–G12/C1–C8 remain), or send a revised
catalog.

## Missing parameters (blocking)

| #   | Node / ranks                                     | Missing                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | `rogue.b3.n01` Три яда смерти — rank I           | Damage per tick of the new Poison/Burn (ranks II/III say 2 and 3; rank I gives none).                                                                                                                                                                                                                |
| G2  | `rogue.b3.n01` — ranks I–III                     | Duration of the Rogue's Poison and Burn groups (Status Effects need a duration; Bleed's is the dagger's own).                                                                                                                                                                                        |
| G3  | `rogue.b2.n03` Теневой двойник — ranks I–III     | What the shadow copy does: attack interval, target selection, position/movement, range, whether it can be hit. Its damage is only defined by the next node (`rogue.b2.n04`); with n03 alone the copy's effect is undefined.                                                                          |
| G4  | `rogue.b2.n04` Удар из тени — ranks I–III        | Base attack speed of the copy (ranks II/III add +10%/+20% to an undefined rate); depends on G3.                                                                                                                                                                                                      |
| G5  | `rogue.b3.n04` Смертельный синтез — rank I       | Explosion radius (ranks II/III give 100/130; rank I gives none — single target or AoE?).                                                                                                                                                                                                             |
| G6  | `warrior.b3.n01` Вторая рука — ranks I–III       | Off-hand sword weapon profile: attack interval / timing, range, sector arc, targeting (spec: own timing). Only the damage coefficient is given.                                                                                                                                                      |
| G7  | `warrior.b3.n02` Ритм двух клинков — ranks I–III | Base off-hand attack speed that +8/15/22% apply to; depends on G6.                                                                                                                                                                                                                                   |
| G8  | `archer.b3.n01` Первая баллиста — ranks I–III    | Ballista HP (spec requires own HP), attack interval, range, targeting rule, placement (where it is summoned), projectile behaviour (speed, pierce). Damage, lifetime and summon CD are given.                                                                                                        |
| G9  | `archer.b3.n02` Инженерный расчёт — ranks I–III  | Base fire rate / range the +% apply to; depends on G8.                                                                                                                                                                                                                                               |
| G10 | `archer.b3.n04` Осадный огонь — ranks II–III     | Whitelist of base-arrow properties a ballista may copy (the catalog's own open question: «требует точного whitelist… Числа… не определяют такой whitelist»).                                                                                                                                         |
| G11 | `archer.b1.n03` Сквозной выстрел — ranks II–III  | «урон после первого пробития снижается на 5%/10% меньше»: Piercing Arrow has **no damage falloff** after a pierce (catalog `archer.ts`: `pierce`, no reduction), so these ranks modify a mechanic that does not exist.                                                                               |
| G12 | `warrior.b2.n02` Непробиваемость — ranks II–III  | «снижение урона от прямых ударов дополнительно 2%/4%»: Combat Core has no damage-reduction stat besides Resistance (spec: no Armor stat, resistance rules unchanged). Needs a rule: where the extra 2%/4% applies (before/after Resistance and rounding, minimum damage 1) and whether it is capped. |

Distinct blocking ranks: `rogue.b3.n01` I–III (G1+G2), `rogue.b2.n03` I–III, `rogue.b2.n04`
I–III, `rogue.b3.n04` I, `warrior.b3.n01` I–III, `warrior.b3.n02` I–III, `archer.b3.n01` I–III,
`archer.b3.n02` I–III, `archer.b3.n04` II–III, `archer.b1.n03` II–III, `warrior.b2.n02` II–III =
**28**.

## Clarifications needed (rule not fully defined)

| #   | Node / ranks                                                     | Question                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `mage.b3.n01` Пятый круг — ranks II–III, and `mage.b3.n02`–`n04` | Which skill is the «усиленный» one before any reassignment: the skill placed in the 5th slot, or a player choice? (Variant B only covers reassignment when gaining a new active skill; the catalog says not to extend it silently.) |
| C2  | `mage.b2.n03` Защитная печать — ranks I–III                      | Interaction with the existing barrier (bonus reward: 20% Max HP, 12 s, a new barrier replaces the old one): does the talent barrier replace, refresh or add?                                                                        |
| C3  | `warrior.b2.n05` Несокрушимый — ranks II–III                     | «при срабатывании»: is the trigger the moment HP drops below 30% (once per crossing, CD 30 s)?                                                                                                                                      |
| C4  | `warrior.b3.n03` Перекрёстный удар — ranks I–III                 | «доп. удар ×0.5/0.75/1.0» — coefficient of which stat (physical damage like other strikes, or the main sword's coefficient)? Damage type physical?                                                                                  |
| C5  | `rogue.b3.n03` Токсическая перегрузка — ranks II–III             | «стак того DoT, которого меньше»: tie-break when two types have equal stacks; damage per tick of the added stack (source's current definition?).                                                                                    |
| C6  | `warrior.b1.n05` Сила ярости — rank I                            | Ranks II/III cap the talent bonus at +16/+24 п.п.; rank I gives no cap (natural limit = Battle Fury max stacks × 1 п.п.?).                                                                                                          |
| C7  | `archer.b3.n01`–`n03` баллисты                                   | Summoning: automatic when the summon CD is ready (like automatic skills), or another trigger?                                                                                                                                       |
| C8  | `rogue.b2.n02` / `rogue.b2.n05`                                  | `rogue.b2.n05` rank III «ответный выпад +15% урона» applies only if `rogue.b2.n02` is owned (it always is, by prerequisite) — confirm it multiplies the n02 coefficient.                                                            |

Distinct clarification-only ranks (not already blocking): C1 11 (`mage.b3.n01` II–III,
`mage.b3.n02`–`n04` I–III), C2 3, C3 2, C4 3, C5 2, C6 1, C7 3 (`archer.b3.n03`; n01/n02 are
already blocking), C8 1 = **26**.

## What happens next (spec 0.3)

Phases 1–4 (data model, persistence, modifier pipeline, UI/debug) are built for all 56 nodes; the
28 blocking ranks are marked `missing` in the config and stay inert; the 26 clarification ranks
are also kept inert until answered. Then work stops and these gaps are reported. Phases 5–6
(effects) need G0 plus the answers above.

## Consistency checks that passed

- Prerequisite text «Следующий узел: после ранга II узла …» matches spec §1.1 for all 44 non-final nodes.
- Superpower marker on `<class>.b3.n01` for all four classes; level-30 gate and activation by rank I match spec §1.1.
- Points: «1 очко за каждый чётный уровень и +1 дополнительно на уровне 30; всего 26» matches `talentPoints()`.
- References to existing content resolve: Bleed/Poison/Burn, Dodge, Resistance, Max HP, Cooldown Reduction, Slow/Stun limits, Battle Fury (`damagePerStack`, `maxStacks`), Final Cut, Thermal Shock, Shattered Ice, Wildfire (`maxTargets` 3 → «не более 4/5» consistent), Multishot extra arrows (`coefficientFactor`), Hunter's Mark (`метка`), Deadly Precision, Piercing Arrow (`pierce`, except G11).
- No talent unlocks a synergy (catalog general rule + `mage.b1.n04` rank III).
- No respec/refund is defined → none implemented (spec §1.1).
