/**
 * Task 08.5 §5 game-feel helpers (presentation only, framework-free and testable). Nothing here
 * reads or changes the simulation: the scene feeds recorded world events in and draws the
 * result. Fixed-size storage; no allocations per hit.
 */
export type FloatingKind = 'normal' | 'crit' | 'player' | 'dodge';
export interface FloatingNumber {
  active: boolean;
  kind: FloatingKind;
  x: number;
  y: number;
  /** Damage shown (rounded); 0 for dodge. */
  value: number;
  born: number;
  life: number;
  /** Deterministic sideways offset so stacked numbers do not overlap exactly. */
  drift: number;
  /** Text built once at spawn (no per-frame string allocation). */
  text: string;
}
/** Shown for a dodge (player-facing, Russian). */
export const DODGE_TEXT = 'Уклон';
export function floatingText(kind: FloatingKind, value: number): string {
  if (kind === 'dodge') return DODGE_TEXT;
  const v = Math.round(value);
  return kind === 'crit' ? `${v}!` : kind === 'player' ? `−${v}` : `${v}`;
}
export const FLOATING_LIMITS = Object.freeze({
  /** Most numbers visible at once; the oldest is reused when full. */
  capacity: 40,
  life: Object.freeze({ normal: 0.6, crit: 0.9, player: 0.8, dodge: 0.6 }),
  /** Pixels a number rises over its life. */
  rise: 26,
});

/** Ring buffer of preallocated entries (pooled; capped on screen). */
export class FloatingNumbers {
  readonly entries: readonly FloatingNumber[];
  private next = 0;
  private spawned = 0;
  constructor(readonly capacity: number = FLOATING_LIMITS.capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('Invalid capacity.');
    this.entries = Array.from({ length: capacity }, () => ({
      active: false,
      kind: 'normal' as FloatingKind,
      x: 0,
      y: 0,
      value: 0,
      born: 0,
      life: 0,
      drift: 0,
      text: '',
    }));
  }
  spawn(kind: FloatingKind, x: number, y: number, value: number, now: number): FloatingNumber {
    const e = this.entries[this.next] as FloatingNumber;
    this.next = (this.next + 1) % this.capacity;
    // Golden-ratio spread in [-1, 1): visual variety without any random source.
    const spread = ((this.spawned++ * 0.618033988749895) % 1) * 2 - 1;
    e.active = true;
    e.kind = kind;
    e.x = x;
    e.y = y;
    e.value = Math.round(value);
    e.born = now;
    e.life = FLOATING_LIMITS.life[kind];
    e.drift = spread * 10;
    e.text = floatingText(kind, value);
    return e;
  }
  /** Calls `draw` for every live number with its progress in [0, 1); expires old ones. */
  forEachActive(
    now: number,
    draw: (entry: FloatingNumber, progress: number, index: number) => void,
  ): number {
    let count = 0;
    for (let i = 0; i < this.capacity; i++) {
      const e = this.entries[i] as FloatingNumber;
      if (!e.active) continue;
      const progress = (now - e.born) / e.life;
      if (progress >= 1 || progress < 0) {
        e.active = false;
        continue;
      }
      count++;
      draw(e, progress, i);
    }
    return count;
  }
  clear(): void {
    for (const e of this.entries as FloatingNumber[]) e.active = false;
  }
}

/** Short white flash on damaged enemies; bounded by the number of living enemies. */
export class HitFlashes {
  private readonly until = new Map<string, number>();
  constructor(readonly duration = 0.12) {}
  hit(entityId: string, now: number): void {
    this.until.set(entityId, now + this.duration);
  }
  /** Flash strength in [0, 1] (1 right after the hit). */
  strength(entityId: string, now: number): number {
    const end = this.until.get(entityId);
    if (end === undefined) return 0;
    const left = end - now;
    if (left <= 0) {
      this.until.delete(entityId);
      return 0;
    }
    return Math.min(1, left / this.duration);
  }
  clear(): void {
    this.until.clear();
  }
}

export interface ShakeRequest {
  /** Milliseconds. */
  readonly duration: number;
  /** Phaser camera shake intensity (fraction of the viewport). */
  readonly intensity: number;
}
export const SHAKES = Object.freeze({
  playerHit: Object.freeze({ duration: 90, intensity: 0.0025 }),
  bossHeavy: Object.freeze({ duration: 220, intensity: 0.006 }),
});
/** Boss abilities that count as heavy attacks for screen shake. */
export const HEAVY_BOSS_KINDS: ReadonlySet<string> = new Set(['circle_aoe', 'charge']);

/** Which world event shakes the screen (null = none). Pure; the setting is checked by the caller. */
export function shakeFor(event: {
  readonly type: string;
  readonly targetId?: string;
  readonly appliedDamage?: number;
  readonly kind?: string;
}): ShakeRequest | null {
  if (
    (event.type === 'damage' || event.type === 'periodic-damage') &&
    event.targetId === 'player' &&
    (event.appliedDamage ?? 0) > 0
  )
    return event.type === 'damage' ? SHAKES.playerHit : null; // DoT ticks do not shake
  if (event.type === 'boss-ability-executed' && event.kind && HEAVY_BOSS_KINDS.has(event.kind))
    return SHAKES.bossHeavy;
  return null;
}
