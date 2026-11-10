import { hpBelow } from '../conditions';
import type {
  DirectHitContext,
  Point2,
  TalentAutoAction,
  TalentClassHandlers,
  TalentEngine,
} from '../combat';
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

// ── Branch 3 · Осадный инженер (G8, G9, G10, C7) ──
const BALLISTA = 'ballista';
const SUMMON = 'archer.b3.n01:summon';
/** G8/G9 ballista numbers for the current ranks (null without the superpower). */
function ballista(engine: TalentEngine) {
  const n31 = engine.talents.params('archer.b3.n01');
  if (!n31) return null;
  const n32 = engine.talents.params('archer.b3.n02');
  const n33 = engine.talents.params('archer.b3.n03');
  return {
    n31,
    limit: n33?.limit ?? 1,
    lifetime: n31.duration + (n33?.duration ?? 0),
    range: n31.range * (1 + (n32?.range ?? 0) / 100),
    interval: n31.interval / (1 + (n32?.speed ?? 0) / 100),
  };
}
/** Nearest living enemy within `range` of a point (tie: id ascending). */
function nearestFrom(engine: TalentEngine, from: Point2, range: number): string | null {
  let best: { id: string; d: number } | null = null;
  for (const id of engine.enemiesInCircle(from, range)) {
    const p = engine.enemyPosition(id);
    if (!p) continue;
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    if (!best || d < best.d || (d === best.d && id < best.id)) best = { id, d };
  }
  return best?.id ?? null;
}
/** G8: 60 units behind the player, opposite the last non-zero movement (default facing right). */
function behindPlayer(engine: TalentEngine, offset: number): Point2 {
  const p = engine.playerPosition();
  const f = engine.facing();
  return { x: p.x - f.x * offset, y: p.y - f.y * offset };
}
function ballistaShot(engine: TalentEngine, at: Point2) {
  const b = ballista(engine);
  if (!b) return;
  const target = nearestFrom(engine, at, b.range);
  if (!target) return;
  const phys = engine.entity(engine.playerId).physicalDamage;
  const n34 = engine.talents.params('archer.b3.n04');
  // G10: Poison scaled from the acquired Toxic Volley (none without it).
  const poison = n34?.poison ? engine.skillParams('toxic_volley') : null;
  engine.talents.proc(() =>
    engine.talentProjectile(
      'archer.b3.n01',
      at,
      target,
      {
        speed: b.n31.speed,
        radius: b.n31.radius,
        range: b.range,
        baseDamage: b.n31.flat + (b.n31.scale / 100) * phys,
      },
      [BALLISTA],
      poison
        ? (id) =>
            engine.applyStatus(
              id,
              {
                effectType: 'poison',
                rawDamagePerTick: poison.poisonDamage * (n34!.poison / 100),
                duration: poison.poisonDuration,
                probabilityPercent: 100,
              },
              1,
              'talent:archer.b3.n04',
            )
        : undefined,
    ),
  );
}

export const ARCHER_HANDLERS: TalentClassHandlers = {
  direct,
  // C7: automatic summon when a slot is free, the 30 s shared cooldown is ready and an enemy is
  // within range of the ballista's position. A full limit skips without spending the cooldown.
  autoActions(engine): readonly TalentAutoAction[] {
    const b = ballista(engine);
    if (!b) return [];
    return [
      {
        readyAt: engine.talents.readyAt(SUMMON),
        canAct: () =>
          engine.talents.list(BALLISTA).length < b.limit &&
          nearestFrom(engine, behindPlayer(engine, b.n31.offset), b.range) !== null,
        run: () => {
          if (!engine.talents.tryCooldown(SUMMON, b.n31.cooldown)) return;
          const at = behindPlayer(engine, b.n31.offset);
          const act = (e: { x: number; y: number; nextActionAt: number | null }) => {
            ballistaShot(engine, e);
            e.nextActionAt = engine.time + b.interval;
          };
          engine.talents.spawn(BALLISTA, 'archer.b3.n01', b.lifetime, at, act, b.interval);
        },
      },
    ];
  },
  // 3.4 Осадный огонь: the ballista's own hits +10/20/30%.
  talentWeaponDirect(ctx) {
    return ctx.tags.has(BALLISTA) ? (ctx.params('archer.b3.n04')?.bonus ?? 0) : 0;
  },
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
