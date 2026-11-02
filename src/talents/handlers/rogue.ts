import { DOT_TYPES, distinctDotTypes, dotStacks, hpBelow } from '../conditions';
import type { DirectHitContext, Point2, TalentClassHandlers, TalentEngine } from '../combat';

/**
 * Task 09.1 Phase 2 — Rogue branches 1–2 (catalog v1.2 + G3/G4/C8). Numbers come from
 * `effect-data.ts`; ranks are totals (a rank's text is its complete effect).
 */
const COPY = 'shadow-copy';

function direct(ctx: DirectHitContext) {
  let percent = 0;
  let critDamage = 0;
  const bleed = dotStacks(ctx.statuses, ctx.targetId, 'bleed');
  // 1.1 Кровавый клинок: dagger direct hits on bleeding targets.
  const n01 = ctx.params('rogue.b1.n01');
  if (n01 && ctx.dagger && bleed > 0) {
    percent += n01.bonus;
    if (n01.stacks && bleed >= n01.stacks) percent += n01.extra;
  }
  // 1.3 Жестокий порез (II/III): direct damage at 5+/10 Bleed stacks.
  const n03 = ctx.params('rogue.b1.n03');
  if (n03?.stacks && bleed >= n03.stacks) percent += n03.direct;
  // 1.4 Охота на слабых: direct damage below 30% HP (+ Bleed at rank II).
  const n04 = ctx.params('rogue.b1.n04');
  if (n04 && hpBelow(ctx.target, n04.hpBelow)) {
    percent += n04.bonus;
    if (n04.bleedExtra && bleed > 0) percent += n04.bleedExtra;
  }
  // 3.2 Алхимическая реакция: direct hits on targets with 2 / 3 distinct DoT types.
  const n32 = ctx.params('rogue.b3.n02');
  if (n32) {
    const types = distinctDotTypes(ctx.statuses, ctx.targetId);
    if (types >= 3 && n32.three) percent += n32.three;
    else if (types >= 2) percent += n32.two;
  }
  // 1.5 Последний удар: dagger crit damage (+ bleeding / below 30% HP).
  const n05 = ctx.params('rogue.b1.n05');
  if (n05 && ctx.dagger) {
    critDamage += n05.critDamage;
    if (n05.bleedExtra && bleed > 0) critDamage += n05.bleedExtra;
    if (n05.lowHpExtra && hpBelow(ctx.target, n05.hpBelow)) critDamage += n05.lowHpExtra;
  }
  return { percent, critDamage };
}

/** G3/G4 shadow copy: one strike on the nearest enemy within the radius of its position. */
function copyStrike(engine: TalentEngine, copy: { x: number; y: number }) {
  const n03 = engine.talents.params('rogue.b2.n03');
  if (!n03) return;
  const n04 = engine.talents.params('rogue.b2.n04');
  const player = engine.playerPosition();
  const facing = engine.facing();
  copy.x = player.x - facing.x * n03.offset;
  copy.y = player.y - facing.y * n03.offset;
  let best: { id: string; d: number } | null = null;
  for (const id of engine.enemiesInCircle(copy, n03.radius)) {
    const pos = engine.enemyPosition(id);
    if (!pos) continue;
    const d = Math.hypot(pos.x - copy.x, pos.y - copy.y);
    if (!best || d < best.d || (d === best.d && id < best.id)) best = { id, d };
  }
  if (!best) return;
  const coefficient = n04 ? n04.coefficient : n03.coefficient;
  engine.talents.proc(() =>
    engine.talentStrike('rogue.b2.n03', best!.id, coefficient, 'physical', ['dagger'], {
      noCritical: true,
    }),
  );
}
function copyInterval(engine: TalentEngine) {
  const n03 = engine.talents.params('rogue.b2.n03')!;
  const speed = engine.talents.params('rogue.b2.n04')?.speed ?? 1;
  return n03.interval / speed;
}

/** 3.1 superpower: basic dagger hits roll Poison and Burn separately (G1 tick, G2 4 s). */
function superpowerProcs(engine: TalentEngine, targetId: string) {
  const n = engine.talents.params('rogue.b3.n01');
  if (!n) return;
  for (const effectType of ['poison', 'burn'] as const)
    if (engine.entity(targetId).alive && engine.talents.roll(n.chance))
      engine.applyStatus(
        targetId,
        { effectType, rawDamagePerTick: n.tick, duration: n.duration, probabilityPercent: 100 },
        1,
        'talent:rogue.b3.n01',
      );
}
/** 3.4 Смертельный синтез (G5): 10 Poison + 10 Burn + 10 Bleed → one explosion per target CD. */
function synthesis(engine: TalentEngine, targetIds: readonly string[]) {
  const n = engine.talents.params('rogue.b3.n04');
  if (!n) return;
  for (const id of targetIds) {
    if (!engine.entity(id).alive) continue;
    if (DOT_TYPES.some((t) => dotStacks(engine.statuses, id, t) < n.stacks)) continue;
    const center = engine.enemyPosition(id);
    if (!center || !engine.talents.tryCooldown(`rogue.b3.n04:${id}`, n.cooldown)) continue;
    const hit = new Set<string>();
    engine.talents.proc(() => {
      for (const target of engine.enemiesInCircle(center, n.radius))
        if (!hit.has(target)) {
          hit.add(target); // at most one hit per enemy per explosion
          engine.talentStrike('rogue.b3.n04', target, n.coefficient, 'physical');
        }
    });
  }
}

export const ROGUE_HANDLERS: TalentClassHandlers = {
  onBasicHit: superpowerProcs,
  onStatusesApplied: synthesis,
  // 3.3 Токсическая перегрузка rank I: +10% DoT damage taken with 3 DoT types (II/III blocked E2).
  dotTakenMultiplier(engine, targetId) {
    const n = engine.talents.params('rogue.b3.n03');
    return n && distinctDotTypes(engine.statuses, targetId) >= 3 ? 1 + n.dotTaken / 100 : 1;
  },
  direct,
  // 1.2 Скрытая точность rank I: dagger crit chance (ranks II/III are blocked, see gaps G-R1).
  critChance: (tags, params) =>
    tags.has('dagger') ? (params('rogue.b1.n02')?.critChance ?? 0) : 0,
  // 1.3 Жестокий порез: Bleed applied by daggers deals more per tick.
  dotFactor(effectType, origin, params) {
    const n03 = params('rogue.b1.n03');
    return effectType === 'bleed' && origin.dagger && n03 ? 1 + n03.bleedDamage / 100 : 1;
  },
  // 1.4 rank III: Final Cut's bonus damage.
  synergyFactor(synergyId, params) {
    const n04 = params('rogue.b1.n04');
    return synergyId === 'final_cut' && n04?.finalCut ? 1 + n04.finalCut / 100 : 1;
  },
  onPlayerDodged(engine, attackerId) {
    const rt = engine.talents;
    // 2.2 Ответный выпад (+ 2.5 rank III ×1.15, C8): counter on the dodged attacker.
    const n02 = rt.params('rogue.b2.n02');
    if (n02 && engine.entity(attackerId).alive && rt.tryCooldown('rogue.b2.n02', n02.cooldown)) {
      const c8 = rt.params('rogue.b2.n05')?.counterMultiplier ?? 1;
      rt.proc(() =>
        engine.talentStrike('rogue.b2.n02', attackerId, n02.coefficient * c8, 'physical', [
          'dagger',
        ]),
      );
    }
    // 2.3 Теневой двойник: chance to create the (single) shadow copy.
    const n03 = rt.params('rogue.b2.n03');
    if (n03 && rt.list(COPY).length === 0 && rt.ready('rogue.b2.n03') && rt.roll(n03.chance)) {
      rt.startCooldown('rogue.b2.n03', n03.cooldown);
      const player = engine.playerPosition();
      const facing = engine.facing();
      const at: Point2 = {
        x: player.x - facing.x * n03.offset,
        y: player.y - facing.y * n03.offset,
      };
      rt.spawn(
        COPY,
        'rogue.b2.n03',
        n03.lifetime,
        at,
        (copy) => {
          copyStrike(engine, copy);
          copy.nextActionAt = engine.time + copyInterval(engine);
        },
        copyInterval(engine),
      );
    }
    // 2.5 Неуловимый: movement speed after a dodge (refresh, don't stack).
    const n05 = rt.params('rogue.b2.n05');
    if (n05) rt.setBuff('rogue.b2.n05', n05.speedPercent, n05.duration, 'movementSpeedPercent');
  },
};
