import { hpBelow } from '../conditions';
import type { DirectHitContext, TalentClassHandlers } from '../combat';
import type { CombatTag } from '../../skills/types';

/**
 * Task 09.1 Phase 8 — Archer branches 1–2 (catalog v1.2 + G11). Numbers come from
 * `effect-data.ts`; ranks are totals (a rank's text is its complete effect).
 */
/** «Стрелы»: the player's physical projectile hits (bow, arrow skills, Multishot arrows). */
const arrow = (tags: ReadonlySet<CombatTag>) => tags.has('projectile') && tags.has('physical');
const FOCUS = 'archer.b1.n04';
const CROSSFIRE = 'archer.b2.n05';

function direct(ctx: DirectHitContext) {
  let percent = 0;
  let critDamage = 0;
  const { tags } = ctx;
  if (arrow(tags)) {
    // 1.1 II/III: crit damage of arrows.
    critDamage += ctx.params('archer.b1.n01')?.critDamage ?? 0;
    // 1.2 Слабая точка: arrows on marked targets (+ poisoned and marked at II/III).
    const n12 = ctx.params('archer.b1.n02');
    if (n12 && ctx.marked) {
      percent += n12.bonus;
      if (n12.poisoned && (ctx.statuses.getGroup(ctx.targetId, 'poison')?.stacks.length ?? 0) > 0)
        percent += n12.poisoned;
    }
    // 1.4 Хладнокровие: the shot after 3 direct shots on this target within the window.
    const n14 = ctx.params(FOCUS);
    if (n14 && ctx.talents.stampedAt(`${FOCUS}:primed:${ctx.targetId}`) !== null)
      percent += n14.bonus;
    // 2.4 Манёвренная стрельба: physical arrows while the player moves.
    const n24 = ctx.params('archer.b2.n04');
    if (n24 && ctx.moving) percent += n24.bonus;
    // 2.5 Перекрёстный огонь: the next arrow after an arrow kill.
    percent += ctx.talents.buffValue(CROSSFIRE);
  }
  // 1.5 Идеальный выстрел rank I: crit damage against targets below 30% HP (II/III blocked E3).
  const n15 = ctx.params('archer.b1.n05');
  if (n15 && hpBelow(ctx.target, n15.hpBelow)) critDamage += n15.critDamage;
  return { percent, critDamage };
}

export const ARCHER_HANDLERS: TalentClassHandlers = {
  direct,
  // 1.1 Меткий глаз: crit chance of direct arrows.
  critChance: (tags, params) => (arrow(tags) ? (params('archer.b1.n01')?.critChance ?? 0) : 0),
  // 1.3 Сквозной выстрел (G11): Piercing Arrow +1/2/3 targets; 2.2: Multishot arrows +5/10/15 p.p.
  skillParamBonus(skillId, param, params) {
    if (skillId === 'piercing_arrow' && param === 'pierce')
      return params('archer.b1.n03')?.pierce ?? 0;
    if (skillId === 'multishot' && param === 'coefficientFactor')
      return (params('archer.b2.n02')?.factor ?? 0) / 100;
    return 0;
  },
  pierceFalloff(skillId, params) {
    const n = params('archer.b1.n03');
    return n && skillId === 'piercing_arrow' ? n.falloff / 100 : 0;
  },
  // 2.1 II/III: range of the basic bow.
  weaponRangeFactor: (params) => 1 + (params('archer.b2.n01')?.range ?? 0) / 100,
  // 2.3 Широкая зона: AoE radius of the Archer's active skills; II/III zone duration.
  skillAreaFactor(tags, params) {
    const n = params('archer.b2.n03');
    return n && tags.has('skill') ? 1 + n.area / 100 : 1;
  },
  zoneDurationFactor(tags, params) {
    const n = params('archer.b2.n03');
    return n?.zone && tags.has('skill') ? 1 + n.zone / 100 : 1;
  },
  onDirectHit(engine, hit) {
    if (!arrow(hit.tags)) return;
    const t = engine.talents;
    // 1.4: the primed shot consumes the bonus; otherwise count direct shots in the window.
    const n14 = t.params(FOCUS);
    if (n14) {
      const primed = `${FOCUS}:primed:${hit.targetId}`;
      if (t.stampedAt(primed) !== null) {
        t.clearStamp(primed);
        t.forget(`${FOCUS}:${hit.targetId}`);
      } else if (
        t.count(`${FOCUS}:${hit.targetId}`, n14.window) >= 3 &&
        t.tryCooldown(`${FOCUS}:${hit.targetId}`, n14.cooldown)
      ) {
        t.stamp(primed);
        t.forget(`${FOCUS}:${hit.targetId}`);
      }
    }
    // 2.5: an arrow kill arms the next arrow; the boosted arrow itself never re-arms it.
    const n25 = t.params(CROSSFIRE);
    if (n25) {
      const boosted = t.buffValue(CROSSFIRE) > 0;
      if (boosted) t.clearBuff(CROSSFIRE);
      if (hit.killed && !boosted) t.setBuff(CROSSFIRE, n25.bonus, n25.duration);
    }
  },
};
