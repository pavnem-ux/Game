# Task 09 — content gate: gaps in `docs/talents.md`

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
