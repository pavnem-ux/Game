import { hpBelow } from '../conditions';
import type { DirectHitContext, TalentClassHandlers } from '../combat';

/**
 * Task 09.1 Phase 6 — Warrior branches 1–2 (catalog v1.2 + C3, C6, G12). Numbers come from
 * `effect-data.ts`; ranks are totals (a rank's text is its complete effect).
 */
function direct(ctx: DirectHitContext) {
  let percent = 0;
  const { tags } = ctx;
  // 1.1 Iron Grip: the sword (basic melee weapon); II/III melee attacks hitting 2+ targets.
  const n11 = ctx.params('warrior.b1.n01');
  if (n11) {
    if (tags.has('basic') && tags.has('melee')) percent += n11.bonus;
    if (n11.multi && tags.has('melee') && ctx.targets >= 2) percent += n11.multi;
  }
  // 1.2 Blood and Steel: physical damage while the player's HP is below 60% (II/III: below 40%).
  const n12 = ctx.params('warrior.b1.n02');
  if (n12 && ctx.attack.damageType === 'physical' && hpBelow(ctx.player, n12.hpBelow)) {
    percent += n12.bonus;
    if (n12.lowExtra && hpBelow(ctx.player, n12.lowHpBelow)) percent += n12.lowExtra;
  }
  // 3.4 Flawless Pair II/III: both swords against targets below 30% HP (the main sword here).
  const n34 = ctx.params('warrior.b3.n04');
  if (n34?.lowHp && tags.has('basic') && tags.has('melee') && hpBelow(ctx.target, n34.hpBelow))
    percent += n34.lowHp;
  // 1.4 II/III and 2.4 II/III: damage against stunned targets.
  if (ctx.stunned) {
    percent += ctx.params('warrior.b1.n04')?.stunned ?? 0;
    percent += ctx.params('warrior.b2.n04')?.stunned ?? 0;
  }
  return { percent, critDamage: 0 };
}

export const WARRIOR_HANDLERS: TalentClassHandlers = {
  direct,
  // 3.1 Second Hand (superpower, G6) with 3.2 Twin-Blade Rhythm (G7 speed bonus).
  offhand(params) {
    const n31 = params('warrior.b3.n01');
    return n31
      ? { coefficient: n31.coefficient, speed: params('warrior.b3.n02')?.speed ?? 0 }
      : null;
  },
  // 3.2 II/III: off-hand crit chance (G7: on the composed, capped stat; Core keeps the cap).
  offhandCritChance: (params) => params('warrior.b3.n02')?.critChance ?? 0,
  // 3.4 Flawless Pair: off-hand direct damage (+ both swords below 30% HP at II/III).
  talentWeaponDirect(ctx) {
    const n = ctx.params('warrior.b3.n04');
    if (!n) return 0;
    return n.bonus + (n.lowHp && hpBelow(ctx.target, n.hpBelow) ? n.lowHp : 0);
  },
  // 3.3 Cross Strike (C4): main + off-hand direct hits on one living target within 2 s.
  onSwordHit(engine, hand, targetId) {
    const n = engine.talents.params('warrior.b3.n03');
    if (!n || !engine.talents.params('warrior.b3.n01')) return;
    engine.talents.stamp(`warrior.b3.n03:${hand}:${targetId}`);
    const other = engine.talents.stampedAt(
      `warrior.b3.n03:${hand === 'main' ? 'offhand' : 'main'}:${targetId}`,
    );
    if (other === null || engine.time - other > n.window) return;
    if (!engine.talents.tryCooldown(`warrior.b3.n03:${targetId}`, n.cooldown)) return;
    engine.talents.proc(() =>
      engine.talentStrike('warrior.b3.n03', targetId, n.coefficient, 'physical'),
    );
  },
  // 1.3 Thirst for Battle: a melee kill gives physical damage for a few seconds (refresh, no stacking;
  // a separate buff from Battle Fury).
  onKill(engine, cause) {
    const n = engine.talents.params('warrior.b1.n03');
    if (!n || !cause.direct || !cause.tags.has('melee')) return;
    engine.talents.setBuff('warrior.b1.n03', n.bonus, n.duration, 'physicalDamagePercent');
  },
  // 1.5 Power of Rage (C6): extra Battle Fury % per stack, capped by the talent-only cap.
  buffStackBonus(buffId, stacks, maxStacks, params) {
    const n = params('warrior.b1.n05');
    if (!n || buffId !== 'battle_fury' || stacks <= 0) return 0;
    const cap = n.cap > 0 ? n.cap : maxStacks * n.perStack;
    return Math.min(stacks * n.perStack, cap);
  },
  // 2.2 II/III (G12): talent-only final reduction of enemy direct hits.
  playerDamageTakenMultiplier(params) {
    const n = params('warrior.b2.n02');
    return n?.reduction ? 1 - n.reduction / 100 : 1;
  },
  // 2.3 Retaliating Shield: after real direct damage, the nearest enemy takes a retaliation strike.
  onPlayerDirectDamage(engine) {
    const n = engine.talents.params('warrior.b2.n03');
    if (!n) return;
    const target = engine.nearestEnemy(engine.playerPosition());
    if (!target || !engine.talents.tryCooldown('warrior.b2.n03', n.cooldown)) return;
    engine.talents.proc(() =>
      engine.talentStrike('warrior.b2.n03', target, n.coefficient, 'physical'),
    );
  },
  // 2.4 Heavy Tread: Stun of the Warrior's own skills lasts longer (inside the existing limit).
  stunBonus(tags, params) {
    const n = params('warrior.b2.n04');
    return n && tags.has('skill') ? n.stun : 0;
  },
  // 2.5 Indomitable (C3): Resistance while HP is strictly below 30%.
  conditionalStats(engine): Readonly<Record<string, number>> {
    const n = engine.talents.params('warrior.b2.n05');
    return n && hpBelow(engine.entity(engine.playerId), n.hpBelow)
      ? { resistance: n.resistance }
      : {};
  },
  // C3 II/III: heal once per 30 s when damage takes HP from ≥ 30% to < 30%.
  onPlayerHpChanged(engine, from, to, damage) {
    const n = engine.talents.params('warrior.b2.n05');
    if (!n?.heal || !damage || !(from >= n.hpBelow && to < n.hpBelow)) return;
    const player = engine.entity(engine.playerId);
    if (!player.alive || !engine.talents.tryCooldown('warrior.b2.n05', n.cooldown)) return;
    engine.talents.proc(() => engine.healPlayer((player.maxHp * n.heal) / 100));
  },
};
