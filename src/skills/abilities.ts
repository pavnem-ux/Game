import type { DamageType } from '../combat-core';
import type { EffectType } from '../status-effects';
import type { AttackStartedEvent, Point } from '../weapon-attacks';
import { getSkill } from './catalog';
import type { HitInfo, PreHit, SkillEngine, ZoneState } from './SkillEngine';
import type { CombatTag, SkillParams } from './types';

/**
 * Behaviours of the 28 class skills. All numbers come from the rank tables in ./catalog; this file
 * contains only targeting and sequencing logic. Every hit goes through SkillEngine.hit/launch so
 * damage, crits, marks, statuses and synergies share one pipeline.
 */
export interface AbilityBehavior {
  canActivate?(e: SkillEngine, p: SkillParams): boolean;
  activate?(e: SkillEngine, p: SkillParams, key: string): void;
  /** Reaction to the player's own direct hits (procs-capable hits only). */
  onPlayerHit?(hit: HitInfo, e: SkillEngine): void;
  onBasicAttack?(event: AttackStartedEvent, e: SkillEngine): void;
  onMarkedDeath?(pre: PreHit, e: SkillEngine): void;
  onMeleeKill?(e: SkillEngine): void;
}

const tagCache = new Map<string, ReadonlySet<CombatTag>>();
function tags(skillId: string, ...extra: CombatTag[]): ReadonlySet<CombatTag> {
  const key = `${skillId}|${extra.join()}`;
  let set = tagCache.get(key);
  if (!set) {
    set = new Set<CombatTag>([...getSkill(skillId).tags, ...extra]);
    tagCache.set(key, set);
  }
  return set;
}
const type = (skillId: string): DamageType =>
  getSkill(skillId).tags.includes('magical') ? 'magical' : 'physical';
function rotate(d: Point, angle: number): Point {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return { x: d.x * c - d.y * s, y: d.x * s + d.y * c };
}
function effect(
  e: SkillEngine,
  targetId: string,
  effectType: EffectType,
  damage: number,
  duration: number,
  stacks = 1,
  chance = 100,
  originId?: string,
) {
  if (damage <= 0 || duration <= 0) return 0;
  return e.applyStatus(
    targetId,
    { effectType, rawDamagePerTick: damage, duration, probabilityPercent: chance },
    stacks,
    originId,
  );
}
/** One attack snapshot (one crit roll) shared by all targets of a single area resolution. */
function areaHit(
  e: SkillEngine,
  skillId: string,
  ids: readonly string[],
  coefficient: number,
  options: {
    procs?: boolean;
    extraTags?: CombatTag[];
    onHit?: (hit: HitInfo) => void;
    filter?: (id: string) => boolean;
  } = {},
): string[] {
  const hitIds: string[] = [];
  if (coefficient <= 0) return hitIds;
  const t = tags(skillId, ...(options.extraTags ?? []));
  const attack = e.attack(t, coefficient, type(skillId));
  for (const id of ids) {
    if (options.filter && !options.filter(id)) continue;
    const hit = e.hit(id, attack, t, { procs: options.procs ?? true, onHit: options.onHit });
    if (hit) hitIds.push(id);
  }
  return hitIds;
}
function fan(base: Point, count: number, spread: number): Point[] {
  return Array.from({ length: count }, (_, i) => rotate(base, (i - (count - 1) / 2) * spread));
}
const posOf = (e: SkillEngine, id: string) => e.body(id);

export const ABILITIES: Readonly<Record<string, AbilityBehavior>> = Object.freeze({
  // ─────────────── Mage ───────────────
  fireball: {
    canActivate: (e, p) => e.nearest(p.range) !== null,
    activate(e, p, key) {
      const target = e.nearest(p.range)!;
      const t = tags('fireball');
      e.launch(
        {
          origin: e.player,
          direction: e.directionTo(posOf(e, target)!),
          speed: p.speed,
          radius: p.radius,
          range: p.range + 60,
        },
        e.attack(t, p.coefficient, 'magical'),
        {
          key,
          tags: t,
          procs: true,
          onHit(hit, engine) {
            effect(engine, hit.targetId, 'burn', p.burnDamage, p.burnDuration, p.burnStacks);
            const center = hit.pre.position ?? engine.player;
            const r = engine.area(p.explosionRadius);
            const ids = engine.inCircle(center, r).filter((id) => id !== hit.targetId);
            const hits = areaHit(engine, 'fireball', ids, p.explosionCoefficient, {
              extraTags: ['area'],
              onHit: (h) =>
                effect(engine, h.targetId, 'burn', p.burnDamage, p.burnDuration, p.burnStacks),
            });
            engine.recordArea('fireball', 'circle', center, r, hits.length + 1);
            for (const direction of fan(
              { x: 1, y: 0 },
              p.embers,
              (Math.PI * 2) / Math.max(1, p.embers),
            )) {
              const et = tags('fireball', 'secondary');
              engine.launch(
                { origin: center, direction, speed: 380, radius: 4, range: p.emberRange },
                engine.attack(et, p.emberCoefficient, 'magical'),
                { key: `${key}:ember`, tags: et, procs: false },
              );
            }
          },
        },
      );
    },
  },
  flame_burst: {
    canActivate: (e, p) => e.anyWithin(p.triggerRange),
    activate(e, p) {
      const r = e.area(p.radius);
      const burn = (h: HitInfo) => effect(e, h.targetId, 'burn', p.burnDamage, p.burnDuration);
      const first = new Set(
        areaHit(e, 'flame_burst', e.inCircle(e.player, r), p.coefficient, { onHit: burn }),
      );
      e.recordArea('flame_burst', 'circle', e.player, r, first.size);
      if (p.pulses > 1)
        e.schedule(p.outerDelay, () => {
          const outer = r * p.outerRadiusFactor;
          // Controlled hit frequency: the outer pulse never hits an enemy hit by the inner pulse.
          const hits = areaHit(
            e,
            'flame_burst',
            e.inCircle(e.player, outer, r),
            p.outerCoefficient,
            {
              onHit: burn,
              filter: (id) => !first.has(id),
            },
          );
          e.recordArea('flame_burst', 'ring', e.player, outer, hits.length, { innerRadius: r });
        });
    },
  },
  inferno: {
    canActivate: (e, p) => e.anyWithin(p.castRange),
    activate(e, p, key) {
      const r = e.area(p.radius);
      e.zone({
        key: 'inferno',
        center: e.cluster(p.castRange, r)!,
        radius: r,
        duration: p.duration,
        tickInterval: p.tickInterval,
        onTick(z, engine) {
          areaHit(engine, 'inferno', engine.inCircle(z.center, z.radius), p.tickCoefficient, {
            onHit: (h) => {
              if (engine.roll(p.burnChance))
                effect(engine, h.targetId, 'burn', p.burnDamage, p.burnDuration);
            },
          });
        },
        onEnd(z, engine) {
          if (p.finalCoefficient <= 0) return;
          // Final burst is a secondary hit: it cannot start a synergy/proc chain.
          const hits = areaHit(
            engine,
            'inferno',
            engine.inCircle(z.center, z.radius),
            p.finalCoefficient,
            {
              procs: false,
              extraTags: ['secondary'],
            },
          );
          engine.recordArea(`${key}:final`, 'circle', z.center, z.radius, hits.length);
        },
      });
    },
  },
  frost_nova: {
    canActivate: (e, p) => e.anyWithin(p.triggerRange),
    activate(e, p) {
      const pulse = (coefficient: number) => {
        const r = e.area(p.radius);
        const hits = areaHit(e, 'frost_nova', e.inCircle(e.player, r), coefficient, {
          onHit: (h) => e.slow(h.targetId, p.slow, p.slowDuration),
        });
        e.recordArea('frost_nova', 'circle', e.player, r, hits.length);
      };
      pulse(p.coefficient);
      if (p.secondCoefficient > 0) e.schedule(p.secondDelay, () => pulse(p.secondCoefficient));
    },
  },
  ice_shards: {
    canActivate: (e, p) => e.nearest(p.range) !== null,
    activate(e, p, key) {
      const target = e.nearest(p.range)!;
      const t = tags('ice_shards');
      for (const direction of fan(e.directionTo(posOf(e, target)!), p.count, p.spread))
        e.launch(
          {
            origin: e.player,
            direction,
            speed: p.speed,
            radius: p.radius,
            range: p.range + 40,
            pierce: p.pierce,
          },
          e.attack(t, p.coefficient, 'magical'),
          { key, tags: t, procs: true },
        );
    },
  },
  blizzard: {
    canActivate: (e, p) => e.anyWithin(p.castRange),
    activate(e, p) {
      const r = e.area(p.radius);
      e.zone({
        key: 'blizzard',
        center: e.cluster(p.castRange, r)!,
        radius: r,
        duration: p.duration,
        tickInterval: p.tickInterval,
        onTick(z: ZoneState, engine) {
          const ids = engine.inCircle(z.center, z.radius);
          const tick = z.tickIndex - 1;
          const strong = p.pulseEvery > 0 && tick % p.pulseEvery === 0;
          // Strong pulse damages only enemies that were already slowed before this tick.
          const slowedBefore = new Set(ids.filter((id) => engine.preHit(id).slowed));
          areaHit(engine, 'blizzard', ids, p.tickCoefficient, {
            onHit: (h) => engine.slow(h.targetId, p.slow, p.slowDuration),
          });
          if (strong) {
            const hits = areaHit(engine, 'blizzard', [...slowedBefore], p.pulseCoefficient);
            engine.recordArea('blizzard:pulse', 'circle', z.center, z.radius, hits.length);
          }
        },
      });
    },
  },
  // ─────────────── Warrior ───────────────
  ground_slam: {
    canActivate: (e, p) => e.nearest(p.range) !== null,
    activate(e, p) {
      const origin = { x: e.player.x, y: e.player.y };
      const direction = e.directionTo(posOf(e, e.nearest(p.range)!)!);
      const hits = areaHit(
        e,
        'ground_slam',
        e.inCone(origin, direction, p.range, p.arc),
        p.coefficient,
        {
          onHit: (h) => e.stun(h.targetId, p.stun),
        },
      );
      e.recordArea('ground_slam', 'cone', origin, p.range, hits.length, {
        direction,
        arcDegrees: p.arc,
      });
      if (p.followCoefficient > 0)
        e.schedule(p.followDelay, () => {
          const h = areaHit(
            e,
            'ground_slam',
            e.inCone(origin, direction, p.followRange, p.followArc),
            p.followCoefficient,
          );
          e.recordArea('ground_slam:wave', 'cone', origin, p.followRange, h.length, {
            direction,
            arcDegrees: p.followArc,
          });
        });
    },
  },
  whirlwind: {
    canActivate: (e, p) => e.anyWithin(p.triggerRange),
    activate(e, p, key) {
      const pulse = () => {
        const r = e.area(p.radius);
        const hits = areaHit(e, 'whirlwind', e.inCircle(e.player, r), p.coefficient, {
          // Hit limit per enemy per activation.
          filter: (id) => e.counted(key, id) < p.hitLimit,
          onHit: (h) => e.count(key, h.targetId),
        });
        e.recordArea('whirlwind', 'circle', e.player, r, hits.length);
      };
      pulse();
      for (let i = 1; i < p.pulses; i++) e.schedule(p.pulseDelay * i, pulse);
    },
  },
  shield_bash: {
    canActivate: (e, p) => e.nearest(p.range) !== null,
    activate(e, p) {
      const target = e.nearest(p.range)!;
      const t = tags('shield_bash');
      const at = posOf(e, target)!;
      e.hit(target, e.attack(t, p.coefficient, 'physical'), t, {
        onHit: (h) => {
          const stunned = e.stun(h.targetId, p.stun);
          if (p.adjacentRange > 0) {
            const other = e.nearest(p.adjacentRange, at, new Set([target]));
            if (other) e.stun(other, p.stun);
          }
          if (stunned && p.shockCoefficient > 0) {
            const r = e.area(p.shockRadius);
            const hits = areaHit(e, 'shield_bash', e.inCircle(at, r), p.shockCoefficient, {
              procs: false,
              extraTags: ['secondary', 'area'],
              filter: (id) => id !== target,
            });
            e.recordArea('shield_bash:shock', 'circle', at, r, hits.length);
          }
        },
      });
      e.recordArea('shield_bash', 'circle', at, 26, 1);
    },
  },
  earthquake: {
    canActivate: (e, p) => e.anyWithin(p.triggerRange),
    activate(e, p) {
      const wave = (coefficient: number, label: string) => {
        const r = e.area(p.radius);
        const hits = areaHit(e, 'earthquake', e.inCircle(e.player, r), coefficient);
        e.recordArea(label, 'circle', e.player, r, hits.length);
      };
      wave(p.coefficient, 'earthquake');
      if (p.rippleCoefficient > 0)
        e.schedule(p.rippleDelay, () => wave(p.rippleCoefficient, 'earthquake:ripple'));
    },
  },
  cleave: {
    canActivate: (e, p) => e.nearest(p.range) !== null,
    activate(e, p) {
      const origin = { x: e.player.x, y: e.player.y };
      const direction = e.directionTo(posOf(e, e.nearest(p.range)!)!);
      const slash = (coefficient: number, label: string) => {
        const hits = areaHit(e, 'cleave', e.inCone(origin, direction, p.range, p.arc), coefficient);
        e.recordArea(label, 'cone', origin, p.range, hits.length, { direction, arcDegrees: p.arc });
      };
      slash(p.coefficient, 'cleave');
      // Each target gets at most two hits per activation: the sweep and the crossing slash.
      if (p.crossCoefficient > 0)
        e.schedule(p.crossDelay, () => slash(p.crossCoefficient, 'cleave:cross'));
    },
  },
  war_cry: {
    canActivate: (e, p) => e.anyWithin(p.triggerRange),
    activate(e, p) {
      e.setBuff('war_cry', 1, 0, e.time + p.duration);
      if (p.disruptRadius > 0) {
        const r = e.area(p.disruptRadius);
        for (const id of e.inCircle(e.player, r)) e.slow(id, p.disruptSlow, p.disruptDuration);
        e.recordArea('war_cry', 'circle', e.player, r, 0);
      }
      if (p.counterCoefficient > 0) {
        const r = e.area(p.counterRadius);
        const ids = e.inCircle(e.player, r);
        if (ids.length) {
          const hits = areaHit(e, 'war_cry', ids, p.counterCoefficient, {
            extraTags: ['physical', 'melee', 'area'],
          });
          e.recordArea('war_cry:counter', 'circle', e.player, r, hits.length);
        }
      }
    },
  },
  battle_fury: {
    onMeleeKill(e) {
      const p = e.params('battle_fury');
      const current = e.buff('battle_fury');
      const stacks = Math.min(p.maxStacks, (current?.stacks ?? 0) + 1);
      // Ranks I–II keep the original expiry; rank III+ refreshes and extends it.
      const expiresAt = current && !p.refresh ? current.expiresAt : e.time + p.duration;
      e.setBuff('battle_fury', stacks, 0, expiresAt);
    },
    onPlayerHit(hit, e) {
      const p = e.params('battle_fury');
      const fury = e.buff('battle_fury');
      if (p.empowerMultiplier <= 1 || !fury || fury.stacks < p.maxStacks || !hit.tags.has('melee'))
        return;
      if (!e.host.core.getEntity(hit.targetId).alive) return;
      // Empowered strike: an extra secondary instance worth (multiplier − 1) of the hit.
      e.setBuff('battle_fury', fury.stacks - 1, 0, fury.expiresAt);
      const t = new Set<CombatTag>(['physical', 'melee', 'secondary']);
      e.hit(
        hit.targetId,
        e.attack(t, hit.attack.coefficient * (p.empowerMultiplier - 1), 'physical'),
        t,
        {
          procs: false,
        },
      );
    },
  },
  // ─────────────── Archer ───────────────
  arrow_rain: {
    canActivate: (e, p) => e.anyWithin(p.castRange),
    activate(e, p, key) {
      const r = e.area(p.radius);
      e.zone({
        key: 'arrow_rain',
        center: e.cluster(p.castRange, r)!,
        radius: r,
        duration: p.duration,
        tickInterval: p.tickInterval,
        onTick(z, engine) {
          const ids = engine
            .inCircle(z.center, z.radius)
            .map((id) => ({
              id,
              d: Math.hypot(posOf(engine, id)!.x - z.center.x, posOf(engine, id)!.y - z.center.y),
            }))
            .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1))
            .slice(0, p.arrows);
          const t = tags('arrow_rain');
          ids.forEach(({ id }, i) =>
            engine.hit(id, engine.attack(t, p.tickCoefficient, 'physical'), t, {
              projectileKey: `${key}:${z.tickIndex}:${i}`,
            }),
          );
        },
        onEnd(z, engine) {
          if (p.finalCoefficient <= 0) return;
          const fr = engine.area(p.finalRadius);
          const hits = areaHit(
            engine,
            'arrow_rain',
            engine.inCircle(z.center, fr),
            p.finalCoefficient,
            {
              procs: false,
              extraTags: ['secondary'],
            },
          );
          engine.recordArea('arrow_rain:final', 'circle', z.center, fr, hits.length);
        },
      });
    },
  },
  toxic_volley: {
    canActivate: (e, p) => e.nearest(p.range) !== null,
    activate(e, p, key) {
      const target = e.nearest(p.range)!;
      const t = tags('toxic_volley');
      const directions = fan(e.directionTo(posOf(e, target)!), p.count, p.spread);
      directions.forEach((direction, i) => {
        const last = i === directions.length - 1 && p.patchRadius > 0;
        e.launch(
          { origin: e.player, direction, speed: p.speed, radius: p.radius, range: p.range + 40 },
          e.attack(t, p.coefficient, 'physical'),
          {
            key,
            tags: t,
            procs: true,
            onHit: (hit, engine) =>
              effect(
                engine,
                hit.targetId,
                'poison',
                p.poisonDamage,
                p.poisonDuration,
                1,
                p.poisonChance,
              ),
            ...(last
              ? {
                  onEnd(position: Point, engine: SkillEngine) {
                    const r = engine.area(p.patchRadius);
                    engine.zone({
                      key: 'toxic_volley:patch',
                      center: position,
                      radius: r,
                      duration: p.patchDuration,
                      tickInterval: p.patchTick,
                      onTick(z, en) {
                        for (const id of en.inCircle(z.center, z.radius))
                          effect(en, id, 'poison', p.patchPoisonDamage, p.poisonDuration);
                      },
                    });
                  },
                }
              : {}),
          },
        );
      });
    },
  },
  piercing_arrow: {
    canActivate: (e, p) => e.nearest(p.range) !== null,
    activate(e, p, key) {
      const target = e.nearest(p.range)!;
      const t = tags('piercing_arrow');
      let lastHit: { id: string; at: Point } | null = null;
      e.launch(
        {
          origin: e.player,
          direction: e.directionTo(posOf(e, target)!),
          speed: p.speed,
          radius: p.radius,
          range: p.range,
          pierce: p.pierce,
        },
        e.attack(t, p.coefficient, 'physical'),
        {
          key,
          tags: t,
          procs: true,
          onHit: (hit) => {
            lastHit = { id: hit.targetId, at: hit.pre.position ?? e.player };
          },
          onEnd: (_position, engine) => {
            const final = lastHit as { id: string; at: Point } | null;
            if (!final || p.splashCoefficient <= 0) return;
            // Secondary splash at the final pierced target; no chaining.
            const r = engine.area(p.splashRadius);
            const hits = areaHit(
              engine,
              'piercing_arrow',
              engine.inCircle(final.at, r),
              p.splashCoefficient,
              {
                procs: false,
                extraTags: ['secondary', 'area'],
                filter: (id) => id !== final.id,
              },
            );
            engine.recordArea('piercing_arrow:splash', 'circle', final.at, r, hits.length);
          },
        },
      );
    },
  },
  split_shot: {
    canActivate: (e, p) => e.nearest(p.range) !== null,
    activate(e, p, key) {
      const target = e.nearest(p.range)!;
      const t = tags('split_shot');
      const direction = e.directionTo(posOf(e, target)!);
      e.launch(
        { origin: e.player, direction, speed: p.speed, radius: p.radius, range: p.range },
        e.attack(t, p.coefficient, 'physical'),
        {
          key,
          tags: t,
          procs: true,
          onHit(hit, engine) {
            const center = hit.pre.position;
            if (!center) return;
            const body = engine.body(hit.targetId);
            const offset = (body?.radius ?? 14) + p.radius + 1;
            // Sub-projectiles start outside the primary target, never split again and, as secondary
            // hits, never trigger synergies or passive reactions.
            for (const d of fan(direction, p.splits, p.splitSpread)) {
              const st = tags('split_shot', 'secondary');
              engine.launch(
                {
                  origin: { x: center.x + d.x * offset, y: center.y + d.y * offset },
                  direction: d,
                  speed: p.speed,
                  radius: p.radius,
                  range: p.splitRange,
                },
                engine.attack(st, p.splitCoefficient, 'physical'),
                {
                  key: `${key}:split`,
                  tags: st,
                  procs: false,
                  onHit: (h, en) => {
                    if (p.splitPoisonDamage > 0 && h.pre.effects.has('poison'))
                      effect(en, h.targetId, 'poison', p.splitPoisonDamage, p.splitPoisonDuration);
                  },
                },
              );
            }
          },
        },
      );
    },
  },
  poison_trap: {
    canActivate: (e, p) => e.anyWithin(p.castRange),
    activate(e, p, key) {
      const r = e.area(p.triggerRadius);
      e.zone({
        key: 'poison_trap',
        center: e.cluster(p.castRange, r)!,
        radius: r,
        duration: p.lifetime,
        tickInterval: 0.1,
        armTime: p.armTime,
        onTick(z, engine) {
          const ids = engine.inCircle(z.center, z.radius);
          if (!ids.length) return;
          const hits = areaHit(engine, 'poison_trap', ids, p.coefficient, {
            onHit: (h) =>
              effect(
                engine,
                h.targetId,
                'poison',
                p.poisonDamage,
                p.poisonDuration,
                p.poisonStacks,
              ),
          });
          engine.recordArea(key, 'circle', z.center, z.radius, hits.length);
          if (p.cloudRadius > 0) {
            const cr = engine.area(p.cloudRadius);
            engine.zone({
              key: 'poison_trap:cloud',
              center: z.center,
              radius: cr,
              duration: p.cloudDuration,
              tickInterval: p.cloudTick,
              onTick(c, en) {
                for (const id of en.inCircle(c.center, c.radius))
                  effect(en, id, 'poison', p.cloudPoisonDamage, p.poisonDuration);
              },
            });
          }
          engine.endZone(z);
        },
      });
    },
  },
  hunters_mark: {
    canActivate: (e, p) => e.nearest(p.range) !== null,
    activate(e, p) {
      e.mark(e.nearest(p.range)!, 'hunter', p.duration);
    },
    onMarkedDeath(pre, e) {
      const p = e.params('hunters_mark');
      if (p.spreadRange <= 0 || !pre.position || !pre.mark) return;
      const remaining = pre.mark.expiresAt - e.time;
      const next = e.nearest(p.spreadRange, pre.position, new Set([pre.targetId]));
      if (next && remaining > 0) e.mark(next, 'hunter', remaining, true);
    },
    onPlayerHit(hit, e) {
      const p = e.params('hunters_mark');
      if (
        p.bonusArrowCoefficient <= 0 ||
        hit.pre.mark?.kind !== 'hunter' ||
        !e.ready('hunters_mark:arrow')
      )
        return;
      const body = e.body(hit.targetId);
      if (!body) return;
      e.startCooldown('hunters_mark:arrow', p.bonusArrowCooldown);
      const t = tags('hunters_mark', 'physical', 'projectile', 'secondary');
      e.launch(
        { origin: e.player, direction: e.directionTo(body), speed: 700, radius: 4, range: 700 },
        e.attack(t, p.bonusArrowCoefficient, 'physical'),
        { key: 'hunters_mark:arrow', tags: t, procs: false },
      );
    },
  },
  multishot: {
    onBasicAttack(event, e) {
      if (e.rank('multishot') === 0 || !event.projectileId) return;
      const p = e.params('multishot');
      const weapon = e.host.weapons.getWeaponState(e.host.playerId).weapon;
      if (weapon.pattern !== 'projectile') return;
      const used = new Set([event.targetId]);
      const t = new Set<CombatTag>(['physical', 'projectile']);
      for (let i = 1; i <= p.extraArrows; i++) {
        let direction: Point | null = null;
        if (p.distinctTargets) {
          const other = e.nearest(weapon.attackRange, e.player, used);
          if (other) {
            used.add(other);
            direction = e.directionTo(e.body(other)!, event.origin);
          }
        }
        // Without a distinct target, alternate sides so copies diverge instead of stacking.
        direction ??= rotate(event.direction, (i % 2 ? 1 : -1) * Math.ceil(i / 2) * p.spread);
        e.launch(
          {
            origin: event.origin,
            direction,
            speed: weapon.projectile.speed,
            radius: weapon.projectile.radius,
            range: weapon.projectile.maxTravelDistance,
          },
          e.attack(t, weapon.damageCoefficient * p.coefficientFactor, 'physical'),
          { key: 'multishot', tags: t, procs: true },
        );
      }
    },
  },
  // ─────────────── Rogue ───────────────
  blade_flurry: {
    canActivate: (e, p) => e.nearest(p.range) !== null,
    activate(e, p) {
      const target = e.nearest(p.range)!;
      const t = tags('blade_flurry');
      for (let k = 0; k < p.hits; k++) {
        const strike = () => {
          const body = e.body(target);
          // The rogue never moves; out-of-reach or dead targets end the flurry quietly.
          if (
            !body ||
            Math.hypot(body.x - e.player.x, body.y - e.player.y) > p.range + body.radius + 40
          )
            return;
          const last = k === p.hits - 1;
          e.hit(target, e.attack(t, p.coefficient, 'physical', last ? p.lastHitCritBonus : 0), t);
          e.recordArea('blade_flurry', 'circle', body, body.radius + 8, 1);
        };
        if (k === 0) strike();
        else e.schedule(k * p.hitInterval, strike);
      }
    },
  },
  fan_of_knives: {
    canActivate: (e, p) => e.anyWithin(p.triggerRange),
    activate(e, p, key) {
      const t = tags('fan_of_knives');
      for (const direction of fan({ x: 1, y: 0 }, p.count, (Math.PI * 2) / p.count))
        e.launch(
          {
            origin: e.player,
            direction,
            speed: p.speed,
            radius: p.radius,
            range: p.range,
            pierce: p.pierce,
          },
          e.attack(t, p.coefficient, 'physical'),
          { key, tags: t, procs: true, limit: { key, max: p.maxHitsPerEnemy } },
        );
    },
  },
  lacerate: {
    canActivate: (e, p) => e.nearest(p.range) !== null,
    activate(e, p) {
      const target = e.nearest(p.range)!;
      const t = tags('lacerate');
      // Rank V: bonus per Bleed stack already on the target (stack cap bounds the bonus).
      const stacks = e.effectStacks(target, 'bleed');
      e.hit(target, e.attack(t, p.coefficient, 'physical'), t, {
        multiplier: 1 + (p.perStackBonusPercent * stacks) / 100,
        onHit: (h) => {
          effect(e, h.targetId, 'bleed', p.bleedDamage, p.bleedDuration);
          if (p.extraBleedChance > 0 && e.roll(p.extraBleedChance))
            effect(e, h.targetId, 'bleed', p.bleedDamage, p.bleedDuration);
        },
      });
      const body = e.body(target);
      if (body) e.recordArea('lacerate', 'circle', body, body.radius + 10, 1);
    },
  },
  shadow_strike: {
    canActivate: (e, p) => e.nearest(p.range) !== null,
    activate(e, p, key) {
      const target = e.nearest(p.range)!;
      const t = tags('shadow_strike');
      let first = true;
      e.launch(
        {
          origin: e.player,
          direction: e.directionTo(e.body(target)!),
          speed: p.speed,
          radius: p.radius,
          range: p.range + 40,
          pierce: p.pierce,
        },
        e.attack(t, p.coefficient, 'physical'),
        {
          key,
          tags: t,
          procs: true,
          onHit(hit, engine) {
            if (!first || p.followCoefficient <= 0 || !engine.ready('shadow_strike:follow')) return;
            first = false;
            engine.startCooldown('shadow_strike:follow', p.followCooldown);
            const victim = hit.targetId;
            engine.schedule(p.followDelay, () => {
              const body = engine.body(victim);
              if (!body) return;
              const st = tags('shadow_strike', 'secondary');
              engine.launch(
                {
                  origin: engine.player,
                  direction: engine.directionTo(body),
                  speed: p.speed,
                  radius: p.radius,
                  range: p.range + 80,
                },
                engine.attack(st, p.followCoefficient, 'physical'),
                { key: `${key}:follow`, tags: st, procs: false },
              );
            });
          },
        },
      );
    },
  },
  blood_blades: {
    canActivate: (e, p) => e.nearest(p.range) !== null,
    activate(e, p, key) {
      const target = e.nearest(p.range)!;
      const t = tags('blood_blades');
      for (const direction of fan(e.directionTo(e.body(target)!), p.count, p.spread)) {
        let splashed = false;
        e.launch(
          { origin: e.player, direction, speed: p.speed, radius: p.radius, range: p.range + 40 },
          e.attack(t, p.coefficient, 'physical'),
          {
            key,
            tags: t,
            procs: true,
            onHit(hit, engine) {
              effect(
                engine,
                hit.targetId,
                'bleed',
                p.bleedDamage,
                p.bleedDuration,
                1,
                p.bleedChance,
              );
              if (
                p.splashRadius <= 0 ||
                splashed ||
                !hit.pre.effects.has('bleed') ||
                !hit.pre.position
              )
                return;
              splashed = true; // one-time splash per blade
              const r = engine.area(p.splashRadius);
              for (const id of engine.inCircle(hit.pre.position, r))
                if (id !== hit.targetId)
                  effect(engine, id, 'bleed', p.bleedDamage, p.bleedDuration);
              engine.recordArea('blood_blades:splash', 'circle', hit.pre.position, r, 0);
            },
          },
        );
      }
    },
  },
  death_mark: {
    canActivate: (e, p) => e.lowestHp(p.range) !== null,
    activate(e, p) {
      e.mark(e.lowestHp(p.range)!, 'death', p.duration);
    },
    onMarkedDeath(pre, e) {
      const p = e.params('death_mark');
      if (p.jumpRange <= 0 || !pre.position || !pre.mark || pre.mark.jumped) return;
      const remaining = pre.mark.expiresAt - e.time;
      const next = e.nearest(p.jumpRange, pre.position, new Set([pre.targetId]));
      if (next && remaining > 0) e.mark(next, 'death', remaining, true);
    },
    onPlayerHit(hit, e) {
      const p = e.params('death_mark');
      if (p.executeCoefficient <= 0 || hit.pre.mark?.kind !== 'death') return;
      const target = e.host.core.getEntity(hit.targetId);
      if (!target.alive || (target.currentHp / target.maxHp) * 100 >= p.executeThresholdPercent)
        return;
      const key = `death_mark:execute:${hit.targetId}`;
      if (!e.ready(key)) return;
      e.startCooldown(key, p.executeCooldown);
      const t = tags('death_mark', 'physical', 'secondary');
      e.hit(hit.targetId, e.attack(t, p.executeCoefficient, 'physical'), t, { procs: false });
    },
  },
  serrated_blades: {
    onPlayerHit(hit, e) {
      if (!hit.tags.has('basic') || !hit.tags.has('dagger')) return;
      if (!e.host.core.getEntity(hit.targetId).alive) return;
      const p = e.params('serrated_blades');
      effect(e, hit.targetId, 'bleed', p.bleedDamage, p.bleedDuration, 1, p.bleedChance);
      if (p.critExtraStack > 0 && hit.attack.critical)
        effect(e, hit.targetId, 'bleed', p.bleedDamage, p.bleedDuration, p.critExtraStack);
    },
  },
});
