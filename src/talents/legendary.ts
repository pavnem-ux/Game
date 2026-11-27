import { LEGENDARY_RULES } from '../equipment/config';
import type { LegendaryId } from '../equipment/config';
import type { DamageType } from '../combat-core';
import type { StatusGroupSnapshot } from '../status-effects';
import type { CombatTag } from '../skills/types';
import type { Point2 } from './combat';
import type { TalentRuntime } from './runtime';

/**
 * Task 43 Legendary effects, built on the talent combat layer: the run's `TalentRuntime` gives the
 * cooldowns (keys `legendary:<id>`) and the proc guard, the Skill Engine calls these hooks at the
 * same combat points as the talent dispatcher. An effect is active while its item is equipped by
 * the run's class (the list is fixed at run start).
 *
 * Shared rules: every Legendary-created hit is attributed to `legendary:<id>`, tagged
 * `legendary` + `secondary` and resolved with `procs = false` — it never triggers talents,
 * passives, synergies or other Legendaries. «Direct hit» = basic attacks and skills (no DoT,
 * talent, synergy, pet or Legendary hits). Simulation time only; no randomness.
 */
export interface LegendaryHost {
  talents(): TalentRuntime;
  now(): number;
  player(): {
    readonly currentHp: number;
    readonly maxHp: number;
    readonly resistance: number;
    readonly alive: boolean;
  };
  playerPosition(): Point2;
  enemyPosition(id: string): Point2 | null;
  /** Living enemies within `radius` of `center` (deterministic order). */
  enemiesInCircle(center: Point2, radius: number): string[];
  /** An exact pre-resistance, never-critical hit from the Legendary (`procs = false`). */
  strike(id: LegendaryId, targetId: string, baseDamage: number, damageType: DamageType): void;
  /** The basic weapon's damage per hit right now (coefficient × stat) and its damage type. */
  weaponDamage(): Readonly<{ damage: number; type: DamageType }>;
  barrier(): number;
  grantBarrier(amount: number, duration: number): void;
  /** Heals the player through Combat Core (never revives). */
  heal(amount: number): void;
  slow(targetId: string, strength: number, duration: number): void;
  isEliteOrBoss(id: string): boolean;
  /** Applies one Bleed stack exactly (no talent scaling), attributed to `originId`. */
  applyBleed(targetId: string, rawDamagePerTick: number, duration: number, originId: string): void;
  /** The current attribution (`skill:<id>`, `synergy:<id>`, `talent:<id>`, `pet.<id>` or null). */
  currentSource(): string | null;
}
const R = LEGENDARY_RULES;
const SECONDARY: readonly CombatTag[] = [
  'talent',
  'secondary',
  'synergy',
  'legendary',
  'pet',
  'offhand',
  'ballista',
];
export const legendarySource = (id: LegendaryId) => `legendary:${id}`;

export class LegendaryCombat {
  private readonly ids: ReadonlySet<LegendaryId>;
  constructor(
    private readonly host: LegendaryHost,
    ids: readonly LegendaryId[],
  ) {
    this.ids = new Set(ids);
  }
  get any(): boolean {
    return this.ids.size > 0;
  }
  has(id: LegendaryId): boolean {
    return this.ids.has(id);
  }
  /** A direct hit: basic attacks and skills only (never DoT, talent, synergy, pet or Legendary). */
  private direct(tags: ReadonlySet<CombatTag> | undefined): boolean {
    if (!tags || SECONDARY.some((t) => tags.has(t))) return false;
    const source = this.host.currentSource();
    return !source || source.startsWith('skill:');
  }
  // ── direct-hit damage: Warden (5th hit ×2), Frost Warlord (Chilled +20%), Thunder Kite (far +30%)
  private readonly wardenHits = new Map<string, number>();
  private readonly chilledUntil = new Map<string, number>();
  directMultiplier(targetId: string, tags: ReadonlySet<CombatTag> | undefined): number {
    if (!this.any || !this.direct(tags)) return 1;
    let m = 1;
    if (this.has('warden_edge') && this.host.isEliteOrBoss(targetId)) {
      const n = (this.wardenHits.get(targetId) ?? 0) + 1;
      this.wardenHits.set(targetId, n);
      if (n % R.warden.everyHits === 0) m *= R.warden.multiplier;
    }
    if (this.has('frost_warlord_staff') && this.chilled(targetId))
      m *= 1 + R.frost.bonusPercent / 100;
    if (this.has('thunder_kite_bow')) {
      const at = this.host.enemyPosition(targetId);
      const p = this.host.playerPosition();
      if (at && Math.hypot(at.x - p.x, at.y - p.y) > R.kite.distance)
        m *= 1 + R.kite.bonusPercent / 100;
    }
    return m;
  }
  private chilled(targetId: string): boolean {
    const until = this.chilledUntil.get(targetId);
    return until !== undefined && until > this.host.now() - 1e-9;
  }
  /** After a landed direct hit on a living target: Frost Warlord's Chill (Slow, refreshed). */
  onDirectHitLanded(targetId: string, tags: ReadonlySet<CombatTag>): void {
    if (!this.has('frost_warlord_staff') || !this.direct(tags)) return;
    this.chilledUntil.set(targetId, this.host.now() + R.frost.seconds);
    this.host.slow(targetId, R.frost.slow, R.frost.seconds);
  }
  forget(targetId: string): void {
    this.wardenHits.delete(targetId);
    this.chilledUntil.delete(targetId);
  }

  // ── Stride of the Ash Wolf: 3 s of moving → the next attack is a guaranteed crit
  private movingSince: number | null = null;
  private stoppedSince: number | null = null;
  /** The movement input sampled at a control step. A stop of 0.2 s or more resets the 3 s. */
  onMovementSample(moving: boolean): void {
    if (!this.has('ash_wolf_stride')) return;
    const now = this.host.now();
    if (moving) {
      this.stoppedSince = null;
      if (this.movingSince === null) this.movingSince = now;
    } else {
      if (this.stoppedSince === null) this.stoppedSince = now;
      if (now - this.stoppedSince >= R.stride.stopSeconds - 1e-9) this.movingSince = null;
    }
  }
  /**
   * When a player attack snapshot is created: true = it is a guaranteed crit (the 3 s window is
   * spent; the timer restarts from now if the player keeps moving).
   */
  takeGuaranteedCrit(): boolean {
    if (!this.has('ash_wolf_stride') || this.movingSince === null || this.host.talents().inProc)
      return false;
    const now = this.host.now();
    if (now - this.movingSince < R.stride.moveSeconds - 1e-9) return false;
    this.movingSince = this.stoppedSince === null ? now : null;
    return true;
  }

  // ── Millwheel Gauntlets: every 30th basic weapon attack → a shockwave around the player
  private basicAttacks = 0;
  onBasicAttack(): void {
    if (!this.has('millwheel_gauntlets') || this.host.talents().inProc) return;
    this.basicAttacks++;
    if (this.basicAttacks % R.millwheel.everyAttacks !== 0) return;
    const { damage, type } = this.host.weaponDamage();
    const base = (damage * R.millwheel.weaponShare) / 100;
    if (!(base > 0)) return;
    this.host.talents().proc(() => {
      for (const id of this.host.enemiesInCircle(this.host.playerPosition(), R.millwheel.radius))
        this.host.strike('millwheel_gauntlets', id, base, type);
    });
  }

  // ── Crown of the Barrow King: HP drops below 30% → barrier 30% max HP (cooldown 60 s)
  onPlayerHpChanged(beforePercent: number, nowPercent: number, damage: boolean): void {
    if (!this.has('barrow_crown') || !damage || this.host.talents().inProc) return;
    if (!(beforePercent >= R.crown.hpBelow && nowPercent < R.crown.hpBelow)) return;
    const p = this.host.player();
    if (!p.alive) return;
    if (!this.host.talents().tryCooldown(legendarySource('barrow_crown'), R.crown.cooldown)) return;
    this.host
      .talents()
      .proc(() =>
        this.host.grantBarrier((p.maxHp * R.crown.barrier) / 100, R.crown.barrierSeconds),
      );
  }

  // ── Bark of the Old Leshy: when hit, thorns of 150% resistance within 120 (once per 1 s)
  onPlayerDirectDamage(): void {
    if (!this.has('leshy_bark') || this.host.talents().inProc) return;
    const p = this.host.player();
    const base = (p.resistance * R.bark.resistanceShare) / 100;
    if (!p.alive || !(base > 0)) return;
    if (!this.host.talents().tryCooldown(legendarySource('leshy_bark'), R.bark.cooldown)) return;
    this.host.talents().proc(() => {
      for (const id of this.host.enemiesInCircle(this.host.playerPosition(), R.bark.radius))
        this.host.strike('leshy_bark', id, base, 'physical');
    });
  }

  // ── Heart of the Mourner: healing above max HP becomes a barrier (up to 20% max HP)
  onPlayerHealed(requested: number, healed: number): void {
    if (!this.has('mourner_heart')) return;
    const overflow = requested - healed;
    const p = this.host.player();
    if (!(overflow > 1e-9) || !p.alive) return;
    const cap = (p.maxHp * R.heart.maxBarrier) / 100;
    const current = this.host.barrier();
    const next = Math.min(cap, current + overflow);
    if (next > current + 1e-9) this.host.grantBarrier(next, R.heart.barrierSeconds);
  }

  // ── Ring of the Water Tsar: each crystal heals 0.3% max HP, at most 3% max HP per second
  private ringHeals: { at: number; amount: number }[] = [];
  onCrystalsCollected(count: number): void {
    if (!this.has('water_tsar_ring') || !(count > 0)) return;
    const p = this.host.player();
    if (!p.alive) return;
    const now = this.host.now();
    this.ringHeals = this.ringHeals.filter((h) => h.at > now - 1 + 1e-9);
    const used = this.ringHeals.reduce((s, h) => s + h.amount, 0);
    const budget = (p.maxHp * R.ring.maxPerSecond) / 100 - used;
    const amount = Math.min(budget, (p.maxHp * R.ring.healPerCrystal * count) / 100);
    if (!(amount > 1e-9)) return;
    this.ringHeals.push({ at: now, amount });
    this.host.heal(amount);
  }

  // ── Fangs of the Mire Serpent: a dying enemy's Bleed spreads to the 2 nearest within 250
  /**
   * `group` is the dead enemy's Bleed as it was removed. Only the player's own (not Legendary-
   * spread) stacks spread, with their strength and the group's remaining duration.
   */
  onBleedTargetDied(group: StatusGroupSnapshot, position: Point2): void {
    if (!this.has('mire_serpent_fangs') || this.host.talents().inProc) return;
    const remaining = group.expiresAt - this.host.now();
    const stacks = group.stacks.filter(
      (s) => s.rawDamagePerTick > 0 && !s.originId?.startsWith('legendary:'),
    );
    if (!(remaining > 1e-9) || !stacks.length) return;
    const near = this.host
      .enemiesInCircle(position, R.mire.radius)
      .filter((id) => id !== group.targetId)
      .map((id) => {
        const at = this.host.enemyPosition(id)!;
        return { id, d: Math.hypot(at.x - position.x, at.y - position.y) };
      })
      .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1))
      .slice(0, R.mire.targets);
    this.host.talents().proc(() => {
      for (const { id } of near)
        for (const s of stacks)
          this.host.applyBleed(
            id,
            s.rawDamagePerTick,
            remaining,
            legendarySource('mire_serpent_fangs'),
          );
    });
  }
}
