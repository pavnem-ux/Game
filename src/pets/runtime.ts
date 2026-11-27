import { PET_CONFIG, PET_FOLLOW } from './config';
import type { PetId } from './config';
import { petAura, petLevelFactor, petParams } from './logic';

/**
 * Task 20 pet runtime (framework-free). One pet per run, created at world start (or by the debug
 * spawn) and removed at run end. It is not a Combat Core entity: it can't be targeted, damaged or
 * collided with. Its timed actions are boundaries of the Skill Engine (the world's skill-action
 * slot), so they run on simulation time only — they freeze with the world (pause, level-up,
 * death) and never depend on the frame rate.
 *
 * Position: the pet's simulation anchor is `player − facing × 40` (the same pure rule as the
 * ballista's «behind the player»); the renderer smooths the sprite towards it. Ranges and the
 * owlet's projectile origin use this anchor.
 *
 * Every pet hit/heal is secondary: attributed to `pet.<id>`, resolved with `procs=false` (no
 * synergies, passives, talents or on-hit effects except the listed fox Burn).
 */
export interface Point2 {
  readonly x: number;
  readonly y: number;
}
export type PetDamageType = 'physical' | 'magical';
export interface PetHost {
  now(): number;
  playerAlive(): boolean;
  playerPosition(): Point2;
  facing(): Point2;
  playerMaxHp(): number;
  /** Current physical / magical damage of the player. */
  playerDamage(): Readonly<{ physical: number; magical: number }>;
  /** Living enemies within `radius` of a point (stable order). */
  enemiesInCircle(center: Point2, radius: number): readonly string[];
  enemyPosition(id: string): Point2 | null;
  /** Instant secondary hit: exact pre-resistance `baseDamage`, no crit, `procs=false`. */
  petStrike(source: string, targetId: string, baseDamage: number, type: PetDamageType): boolean;
  /** Secondary projectile from `origin` at the target's current position (same rules). */
  petProjectile(
    source: string,
    origin: Point2,
    targetId: string,
    spec: Readonly<{ speed: number; radius: number; range: number; baseDamage: number }>,
    type: PetDamageType,
  ): void;
  /** Applies a status exactly as given (no player modifiers), attributed to `source`. */
  petStatus(
    source: string,
    targetId: string,
    effect: Readonly<{ effectType: 'burn'; rawDamagePerTick: number; duration: number }>,
    stacks: number,
  ): void;
  /** Heals the player through Combat Core (clamped; never revives). Returns HP healed. */
  healPlayer(amount: number): number;
  /** The single shared barrier slot (Task 09.1 C2 rules). */
  grantBarrier(amount: number, duration: number): void;
  /** World event for run statistics / rendering. */
  recordPet(event: PetEvent): void;
}
export type PetEvent = Readonly<{
  type: 'pet-action';
  petId: PetId;
  /** shot / dash hit an enemy, heal / barrier on the player, or `idle` (no target in range). */
  action: 'shot' | 'dash' | 'heal' | 'barrier' | 'idle';
  /** Damage dealt is reported by Core events; this is the heal / barrier amount (0 otherwise). */
  amount: number;
  from: Point2;
  to: Point2 | null;
  targetId: string | null;
}>;
export interface PetSnapshot {
  readonly id: PetId;
  readonly level: number;
  readonly x: number;
  readonly y: number;
  /** Timed pets: next action time and the interval (HUD cooldown ring); null for aura pets. */
  readonly nextActionAt: number | null;
  readonly interval: number | null;
  readonly lastAction: PetEvent | null;
}
/** Run-modifier contribution of an aura pet (joins composeRunStats once). */
export interface PetModifiers {
  readonly resistance: number;
  readonly attackSpeed: number;
  readonly movementSpeedPercent: number;
}
const NONE: PetModifiers = Object.freeze({
  resistance: 0,
  attackSpeed: 0,
  movementSpeedPercent: 0,
});

export class PetRunner {
  readonly params: Readonly<Record<string, number>>;
  private nextActionAt: number | null;
  private lastAction: PetEvent | null = null;
  private readonly source: string;
  constructor(
    readonly id: PetId,
    readonly level: number,
    private readonly host: PetHost,
  ) {
    if (!(id in PET_CONFIG)) throw new RangeError(`Unknown pet: ${id}.`);
    petLevelFactor(level); // validates 1–5
    this.params = petParams(id, level);
    this.source = `pet.${id}`;
    const interval = PET_CONFIG[id].interval;
    // The first action comes one full interval after the pet appears (no instant opener).
    this.nextActionAt = interval === null ? null : host.now() + interval;
  }
  /** Simulation anchor: 40 units behind the player (opposite the facing direction). */
  position(): Point2 {
    const p = this.host.playerPosition();
    const f = this.host.facing();
    return { x: p.x - f.x * PET_FOLLOW.offset, y: p.y - f.y * PET_FOLLOW.offset };
  }
  /** Next timed action (null = aura-only pet). */
  get due(): number | null {
    return this.nextActionAt;
  }
  modifiers(): PetModifiers {
    return petAura(this.id, this.level);
  }
  /** Kitten: extra share of collected coins (%), 0 for the other pets. */
  get coinPercent(): number {
    return this.id === 'kitten' ? this.params.coinPercent : 0;
  }
  /** Kitten: pickup-radius multiplier for crystals and coins (1 for the other pets). */
  get pickupScale(): number {
    return this.id === 'kitten' ? 1 + this.params.pickupRadiusPercent / 100 : 1;
  }
  /** Resolves the due action (called by the Skill Engine at the boundary) and reschedules. */
  act(): void {
    if (this.nextActionAt === null) return;
    const interval = PET_CONFIG[this.id].interval!;
    this.nextActionAt = this.host.now() + interval;
    if (!this.host.playerAlive()) return;
    const from = this.position();
    let event: PetEvent;
    switch (this.id) {
      case 'firefly': {
        const healed = this.host.healPlayer(
          (this.host.playerMaxHp() * this.params.healPercent) / 100,
        );
        event = this.event('heal', healed, from, null, null);
        break;
      }
      case 'hedgehog': {
        const amount = (this.host.playerMaxHp() * this.params.barrierPercent) / 100;
        this.host.grantBarrier(amount, this.params.barrierDuration);
        event = this.event('barrier', amount, from, null, null);
        break;
      }
      case 'owlet':
      case 'fox': {
        const target = this.nearest(from, this.params.range);
        if (!target) {
          event = this.event('idle', 0, from, null, null);
          break;
        }
        const dmg = this.host.playerDamage();
        // «Player damage» = the higher of physical / magical; the fox always deals magical damage.
        const type: PetDamageType =
          this.id === 'fox' ? 'magical' : dmg.magical > dmg.physical ? 'magical' : 'physical';
        const base = (Math.max(dmg.physical, dmg.magical) * this.params.damagePercent) / 100;
        if (this.id === 'owlet') {
          this.host.petProjectile(
            this.source,
            from,
            target.id,
            {
              speed: this.params.speed,
              radius: this.params.radius,
              range: this.params.range * 1.25,
              baseDamage: base,
            },
            type,
          );
          event = this.event('shot', 0, from, target.at, target.id);
        } else {
          const landed = this.host.petStrike(this.source, target.id, base, type);
          if (landed)
            this.host.petStatus(
              this.source,
              target.id,
              {
                effectType: 'burn',
                rawDamagePerTick: this.params.burnPerTick,
                duration: this.params.burnDuration,
              },
              this.params.burnStacks,
            );
          event = this.event('dash', 0, from, target.at, target.id);
        }
        break;
      }
      default:
        return;
    }
    this.lastAction = event;
    this.host.recordPet(event);
  }
  snapshot(): PetSnapshot {
    const at = this.position();
    return Object.freeze({
      id: this.id,
      level: this.level,
      x: at.x,
      y: at.y,
      nextActionAt: this.nextActionAt,
      interval: PET_CONFIG[this.id].interval,
      lastAction: this.lastAction,
    });
  }
  /** Nearest living enemy within `range` of `from` (ties: id ascending). */
  private nearest(from: Point2, range: number): { id: string; at: Point2 } | null {
    let best: { id: string; at: Point2; d: number } | null = null;
    for (const id of this.host.enemiesInCircle(from, range)) {
      const p = this.host.enemyPosition(id);
      if (!p) continue;
      const d = Math.hypot(p.x - from.x, p.y - from.y);
      if (d > range) continue;
      if (!best || d < best.d || (d === best.d && id < best.id)) best = { id, at: p, d };
    }
    return best ? { id: best.id, at: best.at } : null;
  }
  private event(
    action: PetEvent['action'],
    amount: number,
    from: Point2,
    to: Point2 | null,
    targetId: string | null,
  ): PetEvent {
    return Object.freeze({
      type: 'pet-action' as const,
      petId: this.id,
      action,
      amount,
      from: Object.freeze({ ...from }),
      to: to ? Object.freeze({ x: to.x, y: to.y }) : null,
      targetId,
    });
  }
}
