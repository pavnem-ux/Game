import type { RandomSource } from '../combat-core';
import type { RunStatModifiers } from '../skills/stats';
import { NO_MODIFIERS } from '../skills/stats';
import type { Point } from '../weapon-attacks';
import { sameInstant } from '../simulation-boundary';

/**
 * Task 12 §1.4 — chests and their temporary buffs. Pure, framework-independent state driven by
 * `GameplayWorld` at its boundaries (spawn after reinforcement spawning; chest and buff expiry with
 * the skill expirations; opening at the player-input/collision step). All numbers PROVISIONAL.
 */
export const CHEST_RULES = Object.freeze({
  /** Simulation seconds between spawn attempts (first at 0:45). */
  interval: 45,
  minDistance: 250,
  maxDistance: 450,
  /** At the limit the spawn is skipped (the timer keeps running). */
  maxChests: 3,
  lifetime: 60,
  /** The chest blinks for the last seconds of its life. */
  blinkFor: 5,
  /** Opened by touch: player radius + chest radius (the pickup magnet does not open chests). */
  radius: 16,
  /** Positions stay this far from the arena edge. */
  arenaMargin: 40,
  /** Seeded tries for a free position before the spawn is skipped. */
  placementTries: 12,
  enchantedChance: 0.25,
  /** Wooden: below Max HP, this chance heals (else gold); at full HP always gold. */
  woodenHealChance: 0.5,
  healFraction: 0.15,
  /** Gold pile: max(goldMin, goldShare × map victory Gold), dropped at the chest. */
  goldShare: 0.02,
  goldMin: 5,
  buffDuration: 20,
});
export type ChestType = 'wooden' | 'enchanted';
export type BuffId = 'fury' | 'haste' | 'lightStep';
export type ChestContent = 'heal' | 'gold' | 'magnet' | BuffId;
export const CHEST_NAMES: Readonly<Record<ChestType, string>> = Object.freeze({
  wooden: 'Wooden Chest',
  enchanted: 'Enchanted Chest',
});
/** Enchanted contents, 25% each, in roll order. */
export const ENCHANTED_CONTENTS: readonly ChestContent[] = Object.freeze([
  'magnet',
  'fury',
  'haste',
  'lightStep',
]);
export interface BuffDefinition {
  readonly id: BuffId;
  readonly name: string;
  readonly description: string;
  readonly modifiers: Partial<RunStatModifiers>;
}
/**
 * Buffs are temporary run modifiers composed by `composeRunStats` (caps once): «Fury» damage
 * +20% (physical and magical: `damagePercent`), «Quick Hands» attack speed +25 points (base 100),
 * «Light Step» movement speed +20%.
 */
export const BUFFS: Readonly<Record<BuffId, BuffDefinition>> = Object.freeze({
  fury: Object.freeze({
    id: 'fury',
    name: 'Fury',
    description: 'Damage +20%',
    modifiers: Object.freeze({ damagePercent: 20 }),
  }),
  haste: Object.freeze({
    id: 'haste',
    name: 'Quick Hands',
    description: 'Attack speed +25%',
    modifiers: Object.freeze({ attackSpeed: 25 }),
  }),
  lightStep: Object.freeze({
    id: 'lightStep',
    name: 'Light Step',
    description: 'Movement speed +20%',
    modifiers: Object.freeze({ movementSpeedPercent: 20 }),
  }),
});
export const BUFF_IDS: readonly BuffId[] = Object.freeze(['fury', 'haste', 'lightStep']);

export interface Chest extends Point {
  readonly id: string;
  readonly type: ChestType;
  readonly spawnedAt: number;
  readonly expiresAt: number;
}
export interface ActiveBuff {
  readonly id: BuffId;
  readonly startedAt: number;
  readonly expiresAt: number;
}
export type ChestEvent =
  | { readonly type: 'chest-spawned'; readonly chest: Chest }
  | { readonly type: 'chest-spawn-skipped'; readonly reason: 'limit' | 'no-space' }
  | { readonly type: 'chest-expired'; readonly chest: Chest }
  | {
      readonly type: 'chest-opened';
      readonly chest: Chest;
      readonly content: ChestContent;
      /** heal: HP actually healed; gold: coin pile value; magnet: XP + coins pulled; buff: 0. */
      readonly amount: number;
    }
  | {
      readonly type: 'buff-started';
      readonly buff: BuffId;
      readonly expiresAt: number;
      readonly refreshed: boolean;
    }
  | {
      readonly type: 'buff-ended';
      readonly buff: BuffId;
      /** Seconds the buff was active in this application (refreshes extend one application). */
      readonly uptime: number;
      readonly reason: 'expired' | 'run-ended';
    };

/** Gold pile of a wooden chest on a map with this victory Gold. */
export function chestGold(victoryGold: number): number {
  return Math.max(CHEST_RULES.goldMin, Math.round(victoryGold * CHEST_RULES.goldShare));
}
/** Sum of the active buffs' modifiers (different buffs stack; one buff never stacks with itself). */
export function buffModifiers(buffs: Iterable<BuffId>): RunStatModifiers {
  const m: Record<keyof RunStatModifiers, number> = { ...NO_MODIFIERS };
  for (const id of buffs)
    for (const [key, value] of Object.entries(BUFFS[id].modifiers))
      m[key as keyof RunStatModifiers] += value ?? 0;
  return Object.freeze(m);
}

export class RunChests {
  private readonly chests = new Map<string, Chest>();
  private readonly buffs = new Map<BuffId, ActiveBuff>();
  private sequence = 0;
  private nextSpawn: number = CHEST_RULES.interval;
  constructor(
    private readonly random: RandomSource,
    private readonly arenaSize: number,
  ) {}
  get nextSpawnAt(): number {
    return this.nextSpawn;
  }
  getChests(): readonly Chest[] {
    return Object.freeze([...this.chests.values()]);
  }
  getBuffs(): readonly ActiveBuff[] {
    return Object.freeze([...this.buffs.values()]);
  }
  activeBuffIds(): readonly BuffId[] {
    return Object.freeze([...this.buffs.keys()]);
  }
  /** Earliest chest or buff expiry (null if none). */
  nextExpiryAt(): number | null {
    let at: number | null = null;
    for (const c of this.chests.values()) if (at === null || c.expiresAt < at) at = c.expiresAt;
    for (const b of this.buffs.values()) if (at === null || b.expiresAt < at) at = b.expiresAt;
    return at;
  }
  /**
   * The scheduled spawn at `now` (== nextSpawnAt): one chest of a rolled type at a seeded position
   * 250–450 units from the player, inside the arena, not overlapping another chest. Skipped at the
   * 3-chest limit; the timer advances either way.
   */
  spawnDue(now: number, player: Point): ChestEvent {
    this.nextSpawn = now + CHEST_RULES.interval;
    return this.spawnAt(now, player);
  }
  /** Spawns one chest now (also the debug path); forced type for debug. */
  spawnAt(now: number, player: Point, forcedType?: ChestType): ChestEvent {
    if (this.chests.size >= CHEST_RULES.maxChests)
      return Object.freeze({ type: 'chest-spawn-skipped', reason: 'limit' });
    const type: ChestType =
      forcedType ?? (this.random() < CHEST_RULES.enchantedChance ? 'enchanted' : 'wooden');
    const position = this.place(player);
    if (!position) return Object.freeze({ type: 'chest-spawn-skipped', reason: 'no-space' });
    const chest = Object.freeze({
      id: `chest-${++this.sequence}`,
      type,
      x: position.x,
      y: position.y,
      spawnedAt: now,
      expiresAt: now + CHEST_RULES.lifetime,
    });
    this.chests.set(chest.id, chest);
    return Object.freeze({ type: 'chest-spawned', chest });
  }
  /**
   * Task 24 (additive): a reward chest of `type` exactly at `position` (an activity reward). It is
   * placed even at the 3-chest limit — a reward is never lost — and uses the normal lifetime,
   * opening and content table. Draws nothing from the chest stream.
   */
  placeReward(now: number, position: Point, type: ChestType): ChestEvent {
    if (type !== 'wooden' && type !== 'enchanted') throw new TypeError('Invalid chest type.');
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
      throw new RangeError('Invalid chest position.');
    const chest = Object.freeze({
      id: `chest-${++this.sequence}`,
      type,
      x: position.x,
      y: position.y,
      spawnedAt: now,
      expiresAt: now + CHEST_RULES.lifetime,
    });
    this.chests.set(chest.id, chest);
    return Object.freeze({ type: 'chest-spawned', chest });
  }
  private place(player: Point): Point | null {
    const r = CHEST_RULES,
      lo = r.arenaMargin,
      hi = this.arenaSize - r.arenaMargin;
    for (let i = 0; i < r.placementTries; i++) {
      const angle = this.random() * Math.PI * 2;
      const distance = r.minDistance + this.random() * (r.maxDistance - r.minDistance);
      const p = {
        x: player.x + Math.cos(angle) * distance,
        y: player.y + Math.sin(angle) * distance,
      };
      if (p.x < lo || p.x > hi || p.y < lo || p.y > hi) continue;
      let free = true;
      for (const c of this.chests.values())
        if (Math.hypot(c.x - p.x, c.y - p.y) < r.radius * 2) free = false;
      if (free) return Object.freeze(p);
    }
    return null;
  }
  /** Chests and buffs whose expiry is `now`, removed; events in that order. */
  expireDue(now: number): ChestEvent[] {
    const out: ChestEvent[] = [];
    for (const c of [...this.chests.values()])
      if (c.expiresAt < now || sameInstant(c.expiresAt, now)) {
        this.chests.delete(c.id);
        out.push(Object.freeze({ type: 'chest-expired', chest: c }));
      }
    for (const b of [...this.buffs.values()])
      if (b.expiresAt < now || sameInstant(b.expiresAt, now)) {
        this.buffs.delete(b.id);
        out.push(this.ended(b, b.expiresAt, 'expired'));
      }
    return out;
  }
  /** Chests the player's body touches (player radius + chest radius), in id order. */
  touched(player: Point & { readonly radius: number }): readonly Chest[] {
    return [...this.chests.values()].filter(
      (c) => Math.hypot(c.x - player.x, c.y - player.y) <= player.radius + CHEST_RULES.radius,
    );
  }
  /** Removes an opened chest and rolls its content (seeded). */
  open(chest: Chest, belowMaxHp: boolean, forced?: ChestContent): ChestContent {
    if (!this.chests.delete(chest.id)) throw new Error(`Unknown chest: ${chest.id}.`);
    if (forced) return forced;
    if (chest.type === 'wooden')
      return belowMaxHp && this.random() < CHEST_RULES.woodenHealChance ? 'heal' : 'gold';
    const i = Math.min(
      ENCHANTED_CONTENTS.length - 1,
      Math.floor(this.random() * ENCHANTED_CONTENTS.length),
    );
    return ENCHANTED_CONTENTS[i];
  }
  /** Starts a buff, or refreshes its duration (the same buff never stacks). */
  grantBuff(id: BuffId, now: number): ChestEvent {
    const current = this.buffs.get(id);
    const expiresAt = now + CHEST_RULES.buffDuration;
    this.buffs.set(id, Object.freeze({ id, startedAt: current?.startedAt ?? now, expiresAt }));
    return Object.freeze({ type: 'buff-started', buff: id, expiresAt, refreshed: !!current });
  }
  /** Run end: every buff is removed (and the chests stop mattering). */
  endRun(now: number): ChestEvent[] {
    const out = [...this.buffs.values()].map((b) =>
      this.ended(b, Math.min(now, b.expiresAt), 'run-ended'),
    );
    this.buffs.clear();
    return out;
  }
  private ended(b: ActiveBuff, at: number, reason: 'expired' | 'run-ended'): ChestEvent {
    return Object.freeze({
      type: 'buff-ended',
      buff: b.id,
      uptime: Math.max(0, at - b.startedAt),
      reason,
    });
  }
}
