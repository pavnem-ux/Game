import { hpAbove } from '../conditions';
import type { DirectHitContext, TalentClassHandlers } from '../combat';
import type { CombatTag } from '../../skills/types';

/**
 * Task 09.1 Phase 4 — Mage branches 1–2 (catalog v1.2 + C2). Numbers come from
 * `effect-data.ts`; ranks are totals (a rank's text is its complete effect).
 */
const elementalSkill = (tags: ReadonlySet<CombatTag>) =>
  tags.has('skill') && (tags.has('fire') || tags.has('ice'));
const magicalSkill = (tags: ReadonlySet<CombatTag>) => tags.has('skill') && tags.has('magical');

function direct(ctx: DirectHitContext) {
  let percent = 0;
  let critDamage = 0;
  const { tags } = ctx;
  // 1.1 Стихийный резонанс: fire and ice direct skills.
  const n11 = ctx.params('mage.b1.n01');
  if (n11 && elementalSkill(tags)) percent += n11.bonus;
  // 1.3 Холодная концентрация: ice attacks on slowed targets.
  const n13 = ctx.params('mage.b1.n03');
  if (n13 && tags.has('ice') && ctx.slowed) percent += n13.bonus;
  // 2.2 Магическая точность II/III: crit damage of magical skills (crits only).
  const n22 = ctx.params('mage.b2.n02');
  if (n22?.critDamage && magicalSkill(tags)) critDamage += n22.critDamage;
  // 2.4 Концентрация: active magical skills while the player's HP is above 70%.
  const n24 = ctx.params('mage.b2.n04');
  if (n24 && magicalSkill(tags) && hpAbove(ctx.player, n24.hpAbove)) percent += n24.bonus;
  // C1 enhanced skill: 3.1 II/III and 3.4 (summed with the other talent bonuses).
  if (ctx.enhanced) {
    percent += ctx.params('mage.b3.n01')?.bonus ?? 0;
    const n34 = ctx.params('mage.b3.n04');
    if (n34) {
      percent += n34.bonus;
      critDamage += n34.critDamage ?? 0;
    }
  }
  return { percent, critDamage };
}

export const MAGE_HANDLERS: TalentClassHandlers = {
  direct,
  // 1.1 II/III: AoE radius of fire and ice skills; 3.2: AoE radius of the enhanced skill.
  skillAreaFactor(tags, params, enhanced) {
    const n11 = params('mage.b1.n01');
    let percent = n11?.area && elementalSkill(tags) ? n11.area : 0;
    if (enhanced) percent += params('mage.b3.n02')?.area ?? 0;
    return 1 + percent / 100;
  },
  // 1.2 Жар пламени: Burn applied by Mage skills (damage; II/III also the group duration).
  // 3.2 II/III: DoT damage of the enhanced skill.
  dotFactor(effectType, origin, params) {
    const n12 = params('mage.b1.n02');
    let percent = n12 && effectType === 'burn' && origin.skillId ? n12.burnDamage : 0;
    if (origin.enhanced) percent += params('mage.b3.n02')?.dot ?? 0;
    return 1 + percent / 100;
  },
  dotDuration(effectType, origin, params) {
    const n = params('mage.b1.n02');
    return n?.burnDuration && effectType === 'burn' && origin.skillId
      ? 1 + n.burnDuration / 100
      : 1;
  },
  // 1.3 II/III: Slow of ice skills (+3/+5 p.p. = +0.03/+0.05 of the Slow fraction; the existing
  // Slow cap still applies).
  slowBonus(tags, params) {
    const n = params('mage.b1.n03');
    return n?.slow && tags.has('skill') && tags.has('ice') ? n.slow / 100 : 0;
  },
  // 1.4 Точное сочетание: bonus damage of the already unlocked Thermal Shock / Shattered Ice.
  synergyFactor(synergyId, params) {
    const n = params('mage.b1.n04');
    if (!n) return 1;
    if (synergyId === 'thermal_shock') return 1 + n.thermalShock / 100;
    if (synergyId === 'shattered_ice' && n.shatteredIce) return 1 + n.shatteredIce / 100;
    return 1;
  },
  // 1.5 Повеление стихиям: Wildfire spread radius (+10/20/30) and neighbours (+0/1/2, max 4/5).
  synergySpread(synergyId, base, params) {
    const n = params('mage.b1.n05');
    if (!n || synergyId !== 'wildfire') return base;
    return {
      radius: base.radius + n.radius,
      maxTargets: n.neighbours
        ? Math.min(n.maxNeighbours, base.maxTargets + n.neighbours)
        : base.maxTargets,
    };
  },
  // 3.1 Пятый круг (superpower, C1): one extra real automatic slot.
  extraAutoSlots: (params) => params('mage.b3.n01')?.extraSlots ?? 0,
  // 3.1 III and 3.3 Глубокая практика: the enhanced skill's cooldown, after CDR (summed %).
  cooldownMultiplier(_skillId, enhanced, params) {
    if (!enhanced) return 1;
    const percent = (params('mage.b3.n01')?.cd ?? 0) + (params('mage.b3.n03')?.cd ?? 0);
    return 1 - percent / 100;
  },
  // 2.2 Магическая точность: crit chance of magical skills.
  critChance: (tags, params) => (magicalSkill(tags) ? (params('mage.b2.n02')?.critChance ?? 0) : 0),
  // 2.4 II/III: extra CDR while HP is above 70% (when a cooldown starts).
  cooldownReductionBonus(engine) {
    const n = engine.talents.params('mage.b2.n04');
    return n?.cdr && hpAbove(engine.entity(engine.playerId), n.hpAbove) ? n.cdr : 0;
  },
  // 2.5 Арканное превосходство: magical skill crits shorten that skill's remaining cooldown.
  onSkillCrit(engine, skillId, tags) {
    const n = engine.talents.params('mage.b2.n05');
    if (!n || !magicalSkill(tags) || !engine.talents.tryCooldown('mage.b2.n05', n.icd)) return;
    engine.reduceSkillCooldown(skillId, n.reduce);
  },
  // 2.3 Защитная печать (C2): barrier after real direct damage, node cooldown.
  onPlayerDirectDamage(engine) {
    const n = engine.talents.params('mage.b2.n03');
    if (!n || !engine.talents.tryCooldown('mage.b2.n03', n.cooldown)) return;
    const player = engine.entity(engine.playerId);
    engine.grantBarrier((player.maxHp * n.barrier) / 100, n.duration);
  },
};
