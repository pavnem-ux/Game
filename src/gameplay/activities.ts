import type { RandomSource } from '../combat-core';
import type { Point } from '../weapon-attacks';
import { sameInstant } from '../simulation-boundary';

/**
 * Task 24 — map activities (Shrine of Embers, Dying Lantern, Treasure Thief, Blight Nest).
 * Pure, framework-independent state driven by `GameplayWorld` at its boundaries (see
 * `docs/ACTIVITIES.md`). Progress is "value at t0 + rate": the world samples the player's
 * position and nearby enemies at each fixed control step (the only moments they change for the
 * player), and every completion / failure / expiry is an exact boundary computed from simulation
 * time. Nothing accumulates per rendered frame. All numbers PROVISIONAL.
 */
export type ActivityType = 'shrine' | 'lantern' | 'thief' | 'nest';
export const ACTIVITY_TYPES: readonly ActivityType[] = Object.freeze([
  'shrine',
  'lantern',
  'thief',
  'nest',
]);
export const ACTIVITY_NAMES: Readonly<Record<ActivityType, string>> = Object.freeze({
  shrine: 'Shrine of Embers',
  lantern: 'Dying Lantern',
  thief: 'Treasure Thief',
  nest: 'Blight Nest',
});

export const ACTIVITY_RULES = Object.freeze({
  /** First spawn attempt (simulation seconds), then every interval ± jitter (seeded). */
  firstAt: 50,
  interval: 75,
  jitter: 15,
  /** Activities on the map at once (lit lanterns do not count); at the limit the spawn is skipped. */
  maxActive: 2,
  /** Placement of shrine / lantern / nest: distance from the player and separation. */
  minDistance: 500,
  maxDistance: 900,
  /** Minimum distance to chests and other activities. */
  minSeparation: 300,
  arenaMargin: 120,
  placementTries: 16,
  /** Shrine / lantern not started within this many seconds fade out (no reward). */
  startWindow: 45,
  /** Types by first map (maps 1–10 shrine + thief; 11–20 + lantern; 21–40 + nest). */
  firstMap: Object.freeze({ shrine: 1, thief: 1, lantern: 11, nest: 21 }) as Readonly<
    Record<ActivityType, number>
  >,
  shrine: Object.freeze({
    radius: 90,
    captureTime: 9,
    /** Outside the circle, progress decays at this fraction of the capture speed. */
    decayRate: 0.5,
    spawnInterval: 1.5,
    spawnRingMin: 250,
    spawnRingMax: 350,
  }),
  lantern: Object.freeze({
    activateRadius: 60,
    activateTime: 1,
    defendTime: 30,
    light: 100,
    drainRadius: 70,
    /** Light per second drained by each enemy within `drainRadius`. */
    drainPerEnemy: 2,
    spawnInterval: 2,
    spawnRingMin: 300,
    spawnRingMax: 400,
    goldShare: 0.06,
    ore: 1,
    lateOre: 2,
    lateFromMap: 21,
  }),
  thief: Object.freeze({
    spawnDistance: 350,
    /** Share of the player's base movement speed. */
    speedShare: 0.95,
    hpMultiplier: 6,
    radius: 15,
    lifetime: 20,
    goldShare: 0.08,
    /** The coin burst is split into this many piles around the thief. */
    burstPiles: 6,
    burstRadius: 28,
    oreChance: 0.2,
    ore: 1,
    /** The thief steers away from arena edges closer than this. */
    edgeMargin: 220,
  }),
  nest: Object.freeze({
    hpMultiplier: 25,
    radius: 30,
    spawnInterval: 3,
    spawnRadius: 120,
    lifetime: 90,
  }),
});

/** Activity types that can appear on a campaign map (in roll order). */
export function activityTypesFor(mapId: number): readonly ActivityType[] {
  if (!Number.isInteger(mapId) || mapId < 1) throw new RangeError('Invalid map id.');
  return Object.freeze(ACTIVITY_TYPES.filter((t) => mapId >= ACTIVITY_RULES.firstMap[t]));
}
/** Lantern / thief coin rewards (whole coins, at least 1) from the map's victory Gold. */
export function activityGold(type: 'lantern' | 'thief', victoryGold: number): number {
  const share =
    type === 'lantern' ? ACTIVITY_RULES.lantern.goldShare : ACTIVITY_RULES.thief.goldShare;
  return Math.max(1, Math.round(victoryGold * share));
}
export function lanternOre(mapId: number): number {
  const l = ACTIVITY_RULES.lantern;
  return mapId >= l.lateFromMap ? l.lateOre : l.ore;
}

export type ActivityPhase = 'waiting' | 'active';
export interface ActivitySnapshot extends Point {
  readonly id: string;
  readonly type: ActivityType;
  readonly name: string;
  readonly phase: ActivityPhase;
  readonly spawnedAt: number;
  /** Fades out at this time if not started (shrine / lantern while waiting), else null. */
  readonly fadesAt: number | null;
  /** 0–1: shrine capture, lantern activation (waiting) / defence time (active), thief / nest time. */
  readonly progress: number;
  /** Lantern Light 0–100 (null for other types). */
  readonly light: number | null;
  /** Thief escape / nest crumble / lantern defence end (null otherwise). */
  readonly endsAt: number | null;
  /** Thief / nest enemy entity (null otherwise). */
  readonly enemyId: string | null;
  /** True while the player stands in the shrine circle / lantern activation range. */
  readonly playerInside: boolean;
}
export type ActivityFailure = 'light' | 'abandoned' | 'escaped' | 'expired' | 'debug';
export type ActivityEvent =
  | { readonly type: 'activity-spawned'; readonly activity: ActivitySnapshot }
  | {
      readonly type: 'activity-spawn-skipped';
      readonly reason: 'limit' | 'no-space' | 'cap';
      readonly activityType: ActivityType | null;
    }
  | { readonly type: 'activity-started'; readonly activity: ActivitySnapshot }
  /** Not started within the start window: it fades out (no reward). */
  | { readonly type: 'activity-faded'; readonly activity: ActivitySnapshot }
  | { readonly type: 'activity-completed'; readonly activity: ActivitySnapshot }
  | {
      readonly type: 'activity-failed';
      readonly activity: ActivitySnapshot;
      readonly reason: ActivityFailure;
    }
  | {
      readonly type: 'activity-reward';
      readonly activityId: string;
      readonly activityType: ActivityType;
      readonly coins: number;
      readonly ore: number;
      readonly chest: 'wooden' | 'enchanted' | null;
    }
  | {
      readonly type: 'activity-enemy-spawned';
      readonly activityId: string;
      readonly enemyId: string | null;
      /** Null = skipped at the enemy cap. */
      readonly position: Point | null;
    };

interface ActivityState {
  readonly id: string;
  readonly type: ActivityType;
  readonly x: number;
  readonly y: number;
  readonly spawnedAt: number;
  phase: ActivityPhase;
  /** Shrine capture seconds / lantern activation seconds / lantern Light, at `valueAt`. */
  value: number;
  valueAt: number;
  /** Change of `value` per second since `valueAt`. */
  rate: number;
  inside: boolean;
  /** Next extra enemy spawn (shrine while inside, lantern defence, nest), null = none. */
  nextEnemyAt: number | null;
  /** Thief escape, nest crumble, lantern defence end. */
  endsAt: number | null;
  enemyId: string | null;
  /** True once the shrine was entered (decay to 0 then fails it). */
  started: boolean;
}

/** What the world reports at a control step for each activity. */
export interface ActivitySample {
  readonly player: Point;
  /** Number of living (non-activity) enemies within `radius` of `center`. */
  readonly enemiesNear: (center: Point, radius: number) => number;
}
export interface ActivityPlacement {
  readonly player: Point;
  readonly mapId: number;
  /** Chest positions (activities keep `minSeparation` from them). */
  readonly chests: readonly Point[];
  /** False when no enemy slot is free below the active cap (thief / nest need one). */
  readonly enemySlotFree: boolean;
}

const tieTime = (a: number, b: number) => a < b || sameInstant(a, b);

export class RunActivities {
  private readonly activities = new Map<string, ActivityState>();
  /** Lanterns defended successfully: they stay lit until the run ends. */
  private readonly lit: Point[] = [];
  private sequence = 0;
  private nextSpawn: number = ACTIVITY_RULES.firstAt;
  private lastType: ActivityType | null = null;
  constructor(
    private readonly random: RandomSource,
    private readonly arenaSize: number,
  ) {}
  get nextSpawnAt(): number {
    return this.nextSpawn;
  }
  get activeCount(): number {
    return this.activities.size;
  }
  litLanterns(): readonly Point[] {
    return Object.freeze([...this.lit]);
  }
  getActivities(now: number): readonly ActivitySnapshot[] {
    return Object.freeze([...this.activities.values()].map((a) => this.snapshot(a, now)));
  }
  getActivity(id: string, now: number): ActivitySnapshot | null {
    const a = this.activities.get(id);
    return a ? this.snapshot(a, now) : null;
  }
  /** Activity whose thief / nest is this enemy (null if none). */
  byEnemy(enemyId: string): ActivitySnapshot | null {
    for (const a of this.activities.values())
      if (a.enemyId === enemyId) return this.snapshot(a, a.valueAt);
    return null;
  }
  /** True if the enemy is an activity's Blight Nest (immune to Slow / Stun). */
  isNest(enemyId: string): boolean {
    for (const a of this.activities.values())
      if (a.type === 'nest' && a.enemyId === enemyId) return true;
    return false;
  }
  /** Enemy ids of living thieves / nests (excluded from lantern drain and from normal targeting rules). */
  activityEnemyIds(): ReadonlySet<string> {
    const ids = new Set<string>();
    for (const a of this.activities.values()) if (a.enemyId) ids.add(a.enemyId);
    return ids;
  }

  // ── Scheduling and placement ──

  /**
   * The scheduled spawn at `now` (== nextSpawnAt). The next attempt is `interval ± jitter`
   * later (seeded) whatever happens; at the 2-activity limit the spawn is skipped.
   */
  spawnDue(now: number, placement: ActivityPlacement): ActivityEvent {
    const r = ACTIVITY_RULES;
    this.nextSpawn = now + r.interval + (this.random() * 2 - 1) * r.jitter;
    if (this.activities.size >= r.maxActive)
      return Object.freeze({ type: 'activity-spawn-skipped', reason: 'limit', activityType: null });
    return this.spawn(now, placement, this.rollType(placement.mapId), false);
  }
  /** Debug path: spawn a given type next to the player (ignores the limit). */
  spawnNear(now: number, placement: ActivityPlacement, type: ActivityType): ActivityEvent {
    return this.spawn(now, placement, type, true);
  }
  private rollType(mapId: number): ActivityType {
    const available = activityTypesFor(mapId);
    const pool =
      available.length > 1 && this.lastType !== null
        ? available.filter((t) => t !== this.lastType)
        : available;
    return pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))];
  }
  private spawn(
    now: number,
    placement: ActivityPlacement,
    type: ActivityType,
    near: boolean,
  ): ActivityEvent {
    const r = ACTIVITY_RULES;
    if ((type === 'thief' || type === 'nest') && !placement.enemySlotFree)
      return Object.freeze({ type: 'activity-spawn-skipped', reason: 'cap', activityType: type });
    const position = near
      ? this.placeNear(placement.player, type === 'thief' ? r.thief.spawnDistance : 160)
      : type === 'thief'
        ? this.placeAt(placement.player, r.thief.spawnDistance, r.thief.spawnDistance, [])
        : this.placeAt(placement.player, r.minDistance, r.maxDistance, placement.chests);
    if (!position)
      return Object.freeze({
        type: 'activity-spawn-skipped',
        reason: 'no-space',
        activityType: type,
      });
    this.lastType = type;
    const active = type === 'thief' || type === 'nest';
    const state: ActivityState = {
      id: `activity-${++this.sequence}`,
      type,
      x: position.x,
      y: position.y,
      spawnedAt: now,
      phase: active ? 'active' : 'waiting',
      value: 0,
      valueAt: now,
      rate: 0,
      inside: false,
      nextEnemyAt: type === 'nest' ? now + r.nest.spawnInterval : null,
      endsAt:
        type === 'thief' ? now + r.thief.lifetime : type === 'nest' ? now + r.nest.lifetime : null,
      enemyId: null,
      started: active,
    };
    this.activities.set(state.id, state);
    return Object.freeze({ type: 'activity-spawned', activity: this.snapshot(state, now) });
  }
  /** The world registered the thief / nest enemy of a spawned activity. */
  attachEnemy(activityId: string, enemyId: string): void {
    const a = this.activities.get(activityId);
    if (!a || (a.type !== 'thief' && a.type !== 'nest')) throw new Error('No thief/nest activity.');
    a.enemyId = enemyId;
  }
  private inArena(p: Point): boolean {
    const lo = ACTIVITY_RULES.arenaMargin,
      hi = this.arenaSize - ACTIVITY_RULES.arenaMargin;
    return p.x >= lo && p.x <= hi && p.y >= lo && p.y <= hi;
  }
  private placeAt(player: Point, min: number, max: number, chests: readonly Point[]): Point | null {
    const r = ACTIVITY_RULES;
    for (let i = 0; i < r.placementTries; i++) {
      const angle = this.random() * Math.PI * 2;
      const distance = min + this.random() * (max - min);
      const p = {
        x: player.x + Math.cos(angle) * distance,
        y: player.y + Math.sin(angle) * distance,
      };
      if (!this.inArena(p)) continue;
      if (min !== max) {
        const others = [...chests, ...this.activities.values(), ...this.lit];
        if (others.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < r.minSeparation)) continue;
      }
      return Object.freeze(p);
    }
    return null;
  }
  private placeNear(player: Point, distance: number): Point | null {
    for (let i = 0; i < ACTIVITY_RULES.placementTries; i++) {
      const angle = this.random() * Math.PI * 2;
      const p = {
        x: player.x + Math.cos(angle) * distance,
        y: player.y + Math.sin(angle) * distance,
      };
      if (this.inArena(p)) return Object.freeze(p);
    }
    return null;
  }

  // ── Progress (value at t0 + rate) ──

  /** Brings `value` to `now` with the current rate (never past the limits). */
  private settle(a: ActivityState, now: number) {
    if (now <= a.valueAt) return;
    a.value += a.rate * (now - a.valueAt);
    a.valueAt = now;
    if (a.type === 'shrine')
      a.value = Math.min(ACTIVITY_RULES.shrine.captureTime, Math.max(0, a.value));
    else if (a.type === 'lantern' && a.phase === 'waiting')
      a.value = Math.min(ACTIVITY_RULES.lantern.activateTime, Math.max(0, a.value));
    else if (a.type === 'lantern') a.value = Math.max(0, a.value);
  }
  /**
   * Control-step sample (the player just moved): updates who is inside and the rates. Returns
   * `activity-started` when a shrine is entered for the first time.
   */
  sample(now: number, input: ActivitySample): ActivityEvent[] {
    const out: ActivityEvent[] = [];
    const r = ACTIVITY_RULES;
    for (const a of this.activities.values()) {
      if (a.type === 'thief' || a.type === 'nest') continue;
      this.settle(a, now);
      const d = Math.hypot(input.player.x - a.x, input.player.y - a.y);
      if (a.type === 'shrine') {
        const inside = d <= r.shrine.radius;
        if (inside && !a.inside) {
          a.nextEnemyAt = now + r.shrine.spawnInterval;
          if (!a.started) {
            a.started = true;
            a.phase = 'active';
            out.push(Object.freeze({ type: 'activity-started', activity: this.snapshot(a, now) }));
          }
        } else if (!inside && a.inside) a.nextEnemyAt = null;
        a.inside = inside;
        a.rate = inside ? 1 : a.value > 0 ? -r.shrine.decayRate : 0;
      } else if (a.phase === 'waiting') {
        const inside = d <= r.lantern.activateRadius;
        if (!inside) a.value = 0; // leaving resets the activation
        a.inside = inside;
        a.rate = inside ? 1 : 0;
      } else {
        a.inside = d <= r.lantern.activateRadius;
        const n = input.enemiesNear(a, r.lantern.drainRadius);
        a.rate = -n * r.lantern.drainPerEnemy;
      }
    }
    return out;
  }
  /** Earliest completion / failure / fade / activation / escape / crumble (null if none). */
  nextResolveAt(): number | null {
    let at: number | null = null;
    const take = (t: number | null) => {
      if (t !== null && (at === null || t < at)) at = t;
    };
    for (const a of this.activities.values()) take(this.dueAt(a));
    return at;
  }
  private dueAt(a: ActivityState): number | null {
    const r = ACTIVITY_RULES;
    if (a.type === 'thief' || a.type === 'nest') return a.endsAt;
    if (a.type === 'shrine') {
      if (!a.started) return a.spawnedAt + r.startWindow;
      if (a.rate > 0) return a.valueAt + (r.shrine.captureTime - a.value) / a.rate;
      // Decayed to 0 (possibly resampled exactly at that instant, which zeroes the rate): the
      // abandon failure is due now — it must not be lost.
      if (a.value <= 0) return a.valueAt;
      if (a.rate < 0) return a.valueAt + a.value / -a.rate;
      return null;
    }
    if (a.phase === 'waiting') {
      const fade = a.spawnedAt + r.startWindow;
      if (a.rate > 0)
        return Math.min(fade, a.valueAt + (r.lantern.activateTime - a.value) / a.rate);
      return fade;
    }
    const end = a.endsAt!;
    // Light already at 0 (e.g. the drainers left on the very step it ran out): failure is due.
    if (a.value <= 0) return Math.min(end, a.valueAt);
    if (a.rate < 0) return Math.min(end, a.valueAt + a.value / -a.rate);
    return end;
  }
  /**
   * Everything due at `now`, in id order: shrine capture / decay-out, lantern activation, defence
   * success, Light out, fade-outs, thief escape, nest crumble. Finished activities are removed.
   */
  resolveDue(now: number): ActivityEvent[] {
    const out: ActivityEvent[] = [];
    const r = ACTIVITY_RULES;
    for (const a of [...this.activities.values()]) {
      const due = this.dueAt(a);
      if (due === null || !tieTime(due, now)) continue;
      this.settle(a, now);
      if (a.type === 'thief') out.push(this.finish(a, now, 'escaped'));
      else if (a.type === 'nest') out.push(this.finish(a, now, 'expired'));
      else if (a.type === 'shrine') {
        if (!a.started) out.push(this.fade(a, now));
        else if (a.rate > 0) {
          a.value = r.shrine.captureTime;
          out.push(this.finish(a, now, null));
        } else out.push(this.finish(a, now, 'abandoned'));
      } else if (a.phase === 'waiting') {
        if (a.rate > 0 && tieTime(a.valueAt + (r.lantern.activateTime - a.value) / a.rate, now)) {
          // Activation completes first when both fall on the same instant.
          a.phase = 'active';
          a.started = true;
          a.value = r.lantern.light;
          a.valueAt = now;
          a.rate = 0;
          a.endsAt = now + r.lantern.defendTime;
          a.nextEnemyAt = now + r.lantern.spawnInterval;
          out.push(Object.freeze({ type: 'activity-started', activity: this.snapshot(a, now) }));
        } else out.push(this.fade(a, now));
      } else if (tieTime(a.endsAt!, now)) {
        // Defence time reached (Light reaching 0 at the very same instant still counts).
        this.lit.push(Object.freeze({ x: a.x, y: a.y }));
        out.push(this.finish(a, now, null));
      } else out.push(this.finish(a, now, 'light'));
    }
    return out;
  }
  private fade(a: ActivityState, now: number): ActivityEvent {
    this.activities.delete(a.id);
    return Object.freeze({ type: 'activity-faded', activity: this.snapshot(a, now) });
  }
  private finish(a: ActivityState, now: number, failure: ActivityFailure | null): ActivityEvent {
    this.activities.delete(a.id);
    const activity = this.snapshot(a, now);
    return failure
      ? Object.freeze({ type: 'activity-failed', activity, reason: failure })
      : Object.freeze({ type: 'activity-completed', activity });
  }
  /** The thief / nest enemy died: the activity is completed (once). Null if not an activity enemy. */
  enemyDied(enemyId: string, now: number): ActivityEvent | null {
    for (const a of this.activities.values())
      if (a.enemyId === enemyId) return this.finish(a, now, null);
    return null;
  }
  /** The thief / nest enemy disappeared without dying (escape/crumble removes it; debug clear). */
  dropEnemy(enemyId: string, now: number): ActivityEvent | null {
    for (const a of this.activities.values())
      if (a.enemyId === enemyId) return this.finish(a, now, 'debug');
    return null;
  }
  /** Debug: complete or fail an activity now (the world pays a completion like a normal one). */
  force(id: string, now: number, outcome: 'complete' | 'fail'): ActivityEvent | null {
    const a = this.activities.get(id);
    if (!a) return null;
    this.settle(a, now);
    if (outcome === 'fail') return this.finish(a, now, 'debug');
    if (a.type === 'lantern') this.lit.push(Object.freeze({ x: a.x, y: a.y }));
    return this.finish(a, now, null);
  }

  // ── Extra enemy spawns (shrine while inside, lantern defence, living nest) ──

  nextEnemySpawnAt(): number | null {
    let at: number | null = null;
    for (const a of this.activities.values())
      if (a.nextEnemyAt !== null && (at === null || a.nextEnemyAt < at)) at = a.nextEnemyAt;
    return at;
  }
  /**
   * Spawn requests due at `now` (id order): center and ring. Each activity's next spawn is one
   * interval later; the world places the enemy (seeded) or skips it at the cap.
   */
  enemySpawnsDue(now: number): readonly Readonly<{
    activityId: string;
    center: Point;
    ringMin: number;
    ringMax: number;
  }>[] {
    const r = ACTIVITY_RULES;
    const out: { activityId: string; center: Point; ringMin: number; ringMax: number }[] = [];
    for (const a of this.activities.values()) {
      if (a.nextEnemyAt === null || !tieTime(a.nextEnemyAt, now)) continue;
      const spec =
        a.type === 'shrine'
          ? {
              interval: r.shrine.spawnInterval,
              min: r.shrine.spawnRingMin,
              max: r.shrine.spawnRingMax,
            }
          : a.type === 'lantern'
            ? {
                interval: r.lantern.spawnInterval,
                min: r.lantern.spawnRingMin,
                max: r.lantern.spawnRingMax,
              }
            : { interval: r.nest.spawnInterval, min: r.nest.radius + 20, max: r.nest.spawnRadius };
      a.nextEnemyAt = now + spec.interval;
      out.push(
        Object.freeze({
          activityId: a.id,
          center: Object.freeze({ x: a.x, y: a.y }),
          ringMin: spec.min,
          ringMax: spec.max,
        }),
      );
    }
    return Object.freeze(out);
  }
  /** Seeded point on a ring around `center`, inside the arena (null after the tries). */
  ringPoint(center: Point, min: number, max: number, margin = 20): Point | null {
    for (let i = 0; i < ACTIVITY_RULES.placementTries; i++) {
      const angle = this.random() * Math.PI * 2;
      const d = min + this.random() * (max - min);
      const p = { x: center.x + Math.cos(angle) * d, y: center.y + Math.sin(angle) * d };
      if (
        p.x >= margin &&
        p.y >= margin &&
        p.x <= this.arenaSize - margin &&
        p.y <= this.arenaSize - margin
      )
        return Object.freeze(p);
    }
    return null;
  }
  /** Seeded roll in [0, 1) from the activity stream (thief ore chance). */
  roll(): number {
    return this.random();
  }
  /** Run end: unfinished activities simply stop (no reward, no failure); lit lanterns stay drawn. */
  endRun(): void {
    this.activities.clear();
  }

  private snapshot(a: ActivityState, now: number): ActivitySnapshot {
    const r = ACTIVITY_RULES;
    const elapsed = Math.max(0, now - a.valueAt);
    let value = a.value + a.rate * elapsed;
    let progress = 0,
      light: number | null = null;
    if (a.type === 'shrine') {
      value = Math.min(r.shrine.captureTime, Math.max(0, value));
      progress = value / r.shrine.captureTime;
    } else if (a.type === 'lantern' && a.phase === 'waiting') {
      value = Math.min(r.lantern.activateTime, Math.max(0, value));
      progress = value / r.lantern.activateTime;
    } else if (a.type === 'lantern') {
      light = Math.max(0, value);
      progress = Math.min(1, Math.max(0, 1 - (a.endsAt! - now) / r.lantern.defendTime));
    } else {
      const life = a.type === 'thief' ? r.thief.lifetime : r.nest.lifetime;
      progress = Math.min(1, Math.max(0, (now - a.spawnedAt) / life));
    }
    return Object.freeze({
      id: a.id,
      type: a.type,
      name: ACTIVITY_NAMES[a.type],
      x: a.x,
      y: a.y,
      phase: a.phase,
      spawnedAt: a.spawnedAt,
      fadesAt:
        !a.started || (a.type === 'lantern' && a.phase === 'waiting')
          ? a.spawnedAt + r.startWindow
          : null,
      progress,
      light,
      endsAt: a.endsAt,
      enemyId: a.enemyId,
      playerInside: a.inside,
    });
  }
}
