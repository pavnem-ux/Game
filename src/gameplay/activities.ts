import type { RandomSource } from '../combat-core';
import type { Point } from '../weapon-attacks';
import { sameInstant } from '../simulation-boundary';

/**
 * Task 24 — map activities (Shrine of Embers, Dying Lantern, Treasure Thief, Blight Nest); Task 38
 * adds Snare Circle, Cursed Altar, Lantern Chain and Three Seals (the last two are made of several
 * linked points sharing one state and timer). Pure, framework-independent state driven by
 * `GameplayWorld` at its boundaries (see `docs/ACTIVITIES.md`). Progress is "value at t0 + rate":
 * the world samples the player's position and nearby enemies at each fixed control step (the only
 * moments they change for the player), and every completion / failure / expiry is an exact
 * boundary computed from simulation time. Nothing accumulates per rendered frame. All numbers
 * PROVISIONAL.
 */
export type ActivityType =
  | 'shrine'
  | 'lantern'
  | 'thief'
  | 'nest'
  | 'snare'
  | 'altar'
  | 'chain'
  | 'seals';
export const ACTIVITY_TYPES: readonly ActivityType[] = Object.freeze([
  'shrine',
  'lantern',
  'thief',
  'nest',
  'snare',
  'altar',
  'chain',
  'seals',
]);
export const ACTIVITY_NAMES: Readonly<Record<ActivityType, string>> = Object.freeze({
  shrine: 'Shrine of Embers',
  lantern: 'Dying Lantern',
  thief: 'Treasure Thief',
  nest: 'Blight Nest',
  snare: 'Snare Circle',
  altar: 'Cursed Altar',
  chain: 'Lantern Chain',
  seals: 'Three Seals',
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
  /** Shrine / lantern / altar / chain / seals not started within this many seconds fade out. */
  startWindow: 45,
  /**
   * Types by first map (maps 1–10 shrine + thief + snare, 6+ altar; 11+ lantern + chain; 21+ nest
   * + seals).
   */
  firstMap: Object.freeze({
    shrine: 1,
    thief: 1,
    lantern: 11,
    nest: 21,
    snare: 1,
    altar: 6,
    chain: 11,
    seals: 21,
  }) as Readonly<Record<ActivityType, number>>,
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
  /** Task 38: lure enemies into the circle; it snaps on them. */
  snare: Object.freeze({
    radius: 110,
    lifetime: 40,
    /** Threshold = clamp(round(enemies within `countRadius` of the player × share), min, max). */
    countRadius: 600,
    thresholdShare: 0.4,
    minThreshold: 6,
    maxThreshold: 20,
    /** Seconds the circle flashes between reaching the threshold and snapping. */
    telegraph: 0.6,
    /** Snap damage as a share of Max HP (normal enemies die). */
    eliteShare: 0.25,
    bossShare: 0.1,
    /** Bonus (threshold reached only): one coin pile worth this share of the victory Gold. */
    goldShare: 0.03,
  }),
  /** Task 38: pay a quarter of Max HP for a long Fury. */
  altar: Object.freeze({
    radius: 60,
    acceptTime: 1.5,
    /** Cost as a share of the player's Max HP (removed from current HP; never lethal). */
    hpCost: 0.25,
    /** Fury of the chest strength, this many times the chest duration. */
    furyDurationMultiplier: 2,
  }),
  /** Task 38: light the first lantern, then race to the second one. */
  chain: Object.freeze({
    radius: 60,
    activateTime: 1,
    nextMinDistance: 600,
    nextMaxDistance: 800,
    /** Timer = ceil(distance / base movement speed × factor) seconds. */
    timeFactor: 1.5,
    /** After the timer, the dimmed lantern still gives a Wooden Chest for this many seconds. */
    lateWindow: 20,
  }),
  /** Task 38: break two (or three) seals, then open the chest. */
  seals: Object.freeze({
    count: 3,
    distance: 250,
    radius: 60,
    breakTime: 3,
    /** Outside a seal, its progress decays at this fraction of the break speed. */
    decayRate: 0.5,
    /** Enemies per broken seal, on a ring just beyond it (away from the chest). */
    burst: 5,
    burstDistance: 90,
    burstSpread: 0.45,
    unlockAt: 2,
    /** After the unlock, the last seal stays this many seconds. */
    lastSealTime: 15,
    /** Total lifetime after the first seal is touched. */
    lifetime: 90,
    /** Touching the chest: player within this distance of its centre. */
    chestRadius: 40,
    goldShare: Object.freeze({ 2: 0.06, 3: 0.1 }) as Readonly<Record<2 | 3, number>>,
    ore: Object.freeze({ 2: 1, 3: 2 }) as Readonly<Record<2 | 3, number>>,
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
  return shareOf(victoryGold, share);
}
/** Whole coins (at least 1) worth `share` of the victory Gold. */
export function shareOf(victoryGold: number, share: number): number {
  return Math.max(1, Math.round(victoryGold * share));
}
export function lanternOre(mapId: number): number {
  const l = ACTIVITY_RULES.lantern;
  return mapId >= l.lateFromMap ? l.lateOre : l.ore;
}
/** Task 38: the Snare Circle's enemy threshold from the enemies near the player at its spawn. */
export function snareThreshold(enemiesNearPlayer: number): number {
  const s = ACTIVITY_RULES.snare;
  return Math.min(
    s.maxThreshold,
    Math.max(s.minThreshold, Math.round(Math.max(0, enemiesNearPlayer) * s.thresholdShare)),
  );
}
/** Task 38: the Lantern Chain timer for a given distance (seconds, whole). */
export function chainTimer(distance: number, baseMoveSpeed: number): number {
  return Math.ceil((distance / baseMoveSpeed) * ACTIVITY_RULES.chain.timeFactor);
}

/**
 * waiting: not started (snare: luring) · active: started · armed: snare telegraph · dimmed: Lantern
 * Chain after its timer · unlocked: Three Seals chest can be opened.
 */
export type ActivityPhase = 'waiting' | 'active' | 'armed' | 'dimmed' | 'unlocked';
/** Task 38: one linked point of a multi-point activity (a seal, the chain's second lantern). */
export interface ActivityPointSnapshot extends Point {
  /** 0–1 progress of this point (seal break). */
  readonly progress: number;
  /** idle: in play · broken: seal broken · gone: the last seal faded. */
  readonly state: 'idle' | 'broken' | 'gone';
  readonly playerInside: boolean;
}
export interface ActivitySnapshot extends Point {
  readonly id: string;
  readonly type: ActivityType;
  readonly name: string;
  readonly phase: ActivityPhase;
  readonly spawnedAt: number;
  /** Fades out at this time if not started (shrine / lantern / altar / chain / seals), else null. */
  readonly fadesAt: number | null;
  /**
   * 0–1: shrine capture, lantern activation (waiting) / defence time (active), thief / nest time,
   * snare lure count / threshold, altar acceptance, chain activation / timer, seals broken / 3.
   */
  readonly progress: number;
  /** Lantern Light 0–100 (null for other types). */
  readonly light: number | null;
  /**
   * Thief escape / nest crumble / lantern defence end / snare lifetime or snap / chain timer or
   * late window / seals lifetime (null otherwise).
   */
  readonly endsAt: number | null;
  /** Thief / nest enemy entity (null otherwise). */
  readonly enemyId: string | null;
  /** True while the player stands in the shrine circle / lantern / altar / chain target / chest. */
  readonly playerInside: boolean;
  /** Task 38: linked points (seals; the chain's second lantern once lit), else empty. */
  readonly points: readonly ActivityPointSnapshot[];
  /** Task 38: Snare Circle — enemies inside at the last sample and the threshold (else null). */
  readonly count: number | null;
  readonly threshold: number | null;
  /** Task 38: Cursed Altar — the player cannot pay (current HP at or below the cost). */
  readonly blocked: boolean;
  /** Task 38: Three Seals — seals broken so far (0 otherwise). */
  readonly broken: number;
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
      /** Task 38: Cursed Altar — the buff granted and the HP paid. */
      readonly buff?: 'fury';
      readonly hpPaid?: number;
      /** Task 38: Snare Circle — enemies caught by the snap. */
      readonly caught?: number;
    }
  | {
      readonly type: 'activity-enemy-spawned';
      readonly activityId: string;
      readonly enemyId: string | null;
      /** Null = skipped at the enemy cap. */
      readonly position: Point | null;
    }
  /** Task 38: a seal broke (the world spawns its enemy burst away from the chest). */
  | {
      readonly type: 'activity-seal-broken';
      readonly activityId: string;
      readonly seal: number;
      readonly position: Point;
      readonly chest: Point;
      readonly broken: number;
    };

interface PointState {
  readonly x: number;
  readonly y: number;
  /** Seal break seconds at `valueAt`. */
  value: number;
  valueAt: number;
  rate: number;
  inside: boolean;
  state: 'idle' | 'broken' | 'gone';
}
interface ActivityState {
  readonly id: string;
  readonly type: ActivityType;
  readonly x: number;
  readonly y: number;
  readonly spawnedAt: number;
  phase: ActivityPhase;
  /** Shrine / altar / chain / lantern activation seconds, or lantern Light, at `valueAt`. */
  value: number;
  valueAt: number;
  /** Change of `value` per second since `valueAt`. */
  rate: number;
  inside: boolean;
  /** Next extra enemy spawn (shrine while inside, lantern defence, nest), null = none. */
  nextEnemyAt: number | null;
  /** Thief escape, nest crumble, lantern defence end, snare / chain / seals deadlines. */
  endsAt: number | null;
  enemyId: string | null;
  /** True once the shrine was entered / the lantern or chain lit / a seal touched. */
  started: boolean;
  /** Task 38 linked points (seals, the chain's second lantern). */
  points: PointState[];
  /** Snare: enemies inside at the last sample, and the threshold. */
  count: number;
  threshold: number;
  /** Altar: the player could not pay at the last sample. */
  blocked: boolean;
  /** Chain target / seals chest touched at this time (resolves now), else null. */
  touchedAt: number | null;
  /** Chain: the timer's length (progress). */
  timer: number;
  /** Seals: broken count and the last seal's fade time. */
  broken: number;
  lastSealAt: number | null;
}

/** What the world reports at a control step for each activity. */
export interface ActivitySample {
  readonly player: Point;
  /** Number of living (non-activity) enemies within `radius` of `center`. */
  readonly enemiesNear: (center: Point, radius: number) => number;
  /** Task 38: the player's HP (Cursed Altar cost check); absent = always affordable. */
  readonly playerHp?: Readonly<{ current: number; max: number }>;
}
/** Task 38: what the world reports when results resolve (exact at that instant). */
export interface ActivityResolveContext {
  /** Snare: enemies inside at the snap / lifetime end (absent = the last sample). */
  readonly enemiesNear?: (center: Point, radius: number) => number;
  /** Altar: the player can still pay at the instant of acceptance (absent = yes). */
  readonly canPay?: () => boolean;
}
export interface ActivityPlacement {
  readonly player: Point;
  readonly mapId: number;
  /** Chest positions (activities keep `minSeparation` from them). */
  readonly chests: readonly Point[];
  /** False when no enemy slot is free below the active cap (thief / nest need one). */
  readonly enemySlotFree: boolean;
  /** Task 38: living enemies within the snare's count radius of the player (absent = 0). */
  readonly enemiesNearPlayer?: number;
}

const tieTime = (a: number, b: number) => a < b || sameInstant(a, b);
/** Progress `value` has reached `target` (shrine capture, lantern activation). */
const reached = (value: number, target: number) => value >= target || sameInstant(value, target);
const NO_POINTS: readonly ActivityPointSnapshot[] = Object.freeze([]);
/** Activities whose `value` is an activation time held while the player stays inside. */
const holdTime = (a: ActivityState): number | null =>
  a.type === 'lantern' && a.phase === 'waiting'
    ? ACTIVITY_RULES.lantern.activateTime
    : a.type === 'altar'
      ? ACTIVITY_RULES.altar.acceptTime
      : a.type === 'chain' && a.phase === 'waiting'
        ? ACTIVITY_RULES.chain.activateTime
        : null;

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
    /** Task 38: the player's base movement speed (Lantern Chain timer). */
    private readonly baseMoveSpeed = 185,
  ) {}
  get nextSpawnAt(): number {
    return this.nextSpawn;
  }
  /** Activities on the map (a multi-point activity counts once). */
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
    // Three Seals: the seal ring (seeded rotation) must fit inside the arena margin as a whole.
    const footprint: Point[] = [];
    if (type === 'seals') {
      const rotation = this.random() * Math.PI * 2;
      for (let i = 0; i < r.seals.count; i++) {
        const angle = rotation + (i * Math.PI * 2) / r.seals.count;
        footprint.push({
          x: Math.cos(angle) * r.seals.distance,
          y: Math.sin(angle) * r.seals.distance,
        });
      }
    }
    const position = near
      ? this.placeNear(placement.player, type === 'thief' ? r.thief.spawnDistance : 160, footprint)
      : type === 'thief'
        ? this.placeAt(placement.player, r.thief.spawnDistance, r.thief.spawnDistance, [], [])
        : this.placeAt(placement.player, r.minDistance, r.maxDistance, placement.chests, footprint);
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
        type === 'thief'
          ? now + r.thief.lifetime
          : type === 'nest'
            ? now + r.nest.lifetime
            : type === 'snare'
              ? now + r.snare.lifetime
              : null,
      enemyId: null,
      // The snare needs nothing from the player to run: it is "started" from its spawn.
      started: active || type === 'snare',
      points: footprint.map((o) => ({
        x: position.x + o.x,
        y: position.y + o.y,
        value: 0,
        valueAt: now,
        rate: 0,
        inside: false,
        state: 'idle' as const,
      })),
      count: 0,
      threshold: type === 'snare' ? snareThreshold(placement.enemiesNearPlayer ?? 0) : 0,
      blocked: false,
      touchedAt: null,
      timer: 0,
      broken: 0,
      lastSealAt: null,
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
  /** The centre and every linked point (offsets from it) inside the arena margin. */
  private fits(p: Point, footprint: readonly Point[]): boolean {
    return this.inArena(p) && footprint.every((o) => this.inArena({ x: p.x + o.x, y: p.y + o.y }));
  }
  private placeAt(
    player: Point,
    min: number,
    max: number,
    chests: readonly Point[],
    footprint: readonly Point[],
  ): Point | null {
    const r = ACTIVITY_RULES;
    for (let i = 0; i < r.placementTries; i++) {
      const angle = this.random() * Math.PI * 2;
      const distance = min + this.random() * (max - min);
      const p = {
        x: player.x + Math.cos(angle) * distance,
        y: player.y + Math.sin(angle) * distance,
      };
      if (!this.fits(p, footprint)) continue;
      if (min !== max) {
        // Separation from chests, other activities (all their points) and lit lanterns.
        const others: Point[] = [...chests, ...this.lit];
        for (const a of this.activities.values()) others.push(a, ...a.points);
        const mine = [p, ...footprint.map((o) => ({ x: p.x + o.x, y: p.y + o.y }))];
        if (
          mine.some((m) => others.some((o) => Math.hypot(o.x - m.x, o.y - m.y) < r.minSeparation))
        )
          continue;
      }
      return Object.freeze(p);
    }
    return null;
  }
  private placeNear(player: Point, distance: number, footprint: readonly Point[]): Point | null {
    for (let i = 0; i < ACTIVITY_RULES.placementTries; i++) {
      const angle = this.random() * Math.PI * 2;
      const p = {
        x: player.x + Math.cos(angle) * distance,
        y: player.y + Math.sin(angle) * distance,
      };
      if (this.fits(p, footprint)) return Object.freeze(p);
    }
    // Debug: a multi-point activity next to a wall may not fit at this distance — try the centre.
    if (footprint.length) {
      const c = { x: this.arenaSize / 2, y: this.arenaSize / 2 };
      if (this.fits(c, footprint)) return Object.freeze(c);
    }
    return null;
  }
  /** Lantern Chain: the second lantern 600–800 from the first, inside the arena (seeded tries). */
  private placeChainTarget(from: Point): Point | null {
    const c = ACTIVITY_RULES.chain;
    for (let i = 0; i < ACTIVITY_RULES.placementTries * 2; i++) {
      const angle = this.random() * Math.PI * 2;
      const d = c.nextMinDistance + this.random() * (c.nextMaxDistance - c.nextMinDistance);
      const p = { x: from.x + Math.cos(angle) * d, y: from.y + Math.sin(angle) * d };
      if (this.inArena(p)) return Object.freeze(p);
    }
    return null;
  }

  // ── Progress (value at t0 + rate) ──

  /** Brings `value` (and linked points) to `now` with the current rate (never past the limits). */
  private settle(a: ActivityState, now: number) {
    for (const p of a.points) {
      if (p.state !== 'idle' || now <= p.valueAt) continue;
      p.value = Math.min(
        ACTIVITY_RULES.seals.breakTime,
        Math.max(0, p.value + p.rate * (now - p.valueAt)),
      );
      p.valueAt = now;
    }
    if (now <= a.valueAt) return;
    a.value += a.rate * (now - a.valueAt);
    a.valueAt = now;
    const hold = holdTime(a);
    if (a.type === 'shrine')
      a.value = Math.min(ACTIVITY_RULES.shrine.captureTime, Math.max(0, a.value));
    else if (hold !== null) a.value = Math.min(hold, Math.max(0, a.value));
    else if (a.type === 'lantern') a.value = Math.max(0, a.value);
  }
  /**
   * Control-step sample (the player just moved): updates who is inside and the rates. Returns
   * `activity-started` when a shrine is entered / a seal touched for the first time, or a snare
   * reaches its threshold.
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
      } else if (a.type === 'snare') {
        a.count = input.enemiesNear(a, r.snare.radius);
        if (a.phase === 'waiting' && a.count >= a.threshold) {
          a.phase = 'armed';
          a.endsAt = now + r.snare.telegraph;
          out.push(Object.freeze({ type: 'activity-started', activity: this.snapshot(a, now) }));
        }
      } else if (a.type === 'altar') {
        const hp = input.playerHp;
        a.blocked = !!hp && hp.current <= hp.max * r.altar.hpCost;
        const inside = d <= r.altar.radius;
        if ((!inside || a.blocked) && !reached(a.value, r.altar.acceptTime)) a.value = 0;
        a.inside = inside;
        a.rate = inside && !a.blocked ? 1 : 0;
      } else if (a.type === 'seals') {
        for (const p of a.points) {
          if (p.state !== 'idle') {
            p.inside = false;
            continue;
          }
          const inside = Math.hypot(input.player.x - p.x, input.player.y - p.y) <= r.seals.radius;
          p.inside = inside;
          p.rate = inside ? 1 : p.value > 0 ? -r.seals.decayRate : 0;
          if (inside && !a.started) {
            a.started = true;
            a.phase = 'active';
            a.endsAt = now + r.seals.lifetime;
            out.push(Object.freeze({ type: 'activity-started', activity: this.snapshot(a, now) }));
          }
        }
        a.inside = d <= r.seals.chestRadius;
        if (a.phase === 'unlocked' && a.inside && a.touchedAt === null) a.touchedAt = now;
      } else if ((a.type === 'lantern' || a.type === 'chain') && a.phase === 'waiting') {
        const radius = a.type === 'lantern' ? r.lantern.activateRadius : r.chain.radius;
        const time = a.type === 'lantern' ? r.lantern.activateTime : r.chain.activateTime;
        const inside = d <= radius;
        // Leaving resets the activation, unless it completed on this very step (resolves next).
        if (!inside && !reached(a.value, time)) a.value = 0;
        a.inside = inside;
        a.rate = inside ? 1 : 0;
      } else if (a.type === 'chain') {
        const target = a.points[0];
        a.inside =
          Math.hypot(input.player.x - target.x, input.player.y - target.y) <= r.chain.radius;
        target.inside = a.inside;
        if (a.inside && a.touchedAt === null) a.touchedAt = now;
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
  /** When a value rising at `rate` from `value` reaches `target` (null if it does not rise). */
  private static rise(valueAt: number, value: number, rate: number, target: number) {
    if (reached(value, target)) return valueAt;
    return rate > 0 ? valueAt + (target - value) / rate : null;
  }
  private dueAt(a: ActivityState): number | null {
    const r = ACTIVITY_RULES;
    const min = (...ts: (number | null)[]) => {
      let at: number | null = null;
      for (const t of ts) if (t !== null && (at === null || t < at)) at = t;
      return at;
    };
    if (a.type === 'thief' || a.type === 'nest' || a.type === 'snare') return a.endsAt;
    if (a.type === 'shrine') {
      if (!a.started) return a.spawnedAt + r.startWindow;
      // Capture already complete (the player may have left on that very control step): due now.
      if (reached(a.value, r.shrine.captureTime)) return a.valueAt;
      if (a.rate > 0) return a.valueAt + (r.shrine.captureTime - a.value) / a.rate;
      // Decayed to 0 (possibly resampled exactly at that instant, which zeroes the rate): the
      // abandon failure is due now — it must not be lost.
      if (a.value <= 0) return a.valueAt;
      if (a.rate < 0) return a.valueAt + a.value / -a.rate;
      return null;
    }
    const hold = holdTime(a);
    if (hold !== null)
      // Lantern / chain activation, altar acceptance (or the fade-out).
      return min(a.spawnedAt + r.startWindow, RunActivities.rise(a.valueAt, a.value, a.rate, hold));
    if (a.type === 'chain') return min(a.touchedAt, a.endsAt);
    if (a.type === 'seals') {
      if (!a.started) return a.spawnedAt + r.startWindow;
      const breaks = a.points.map((p) =>
        p.state === 'idle'
          ? RunActivities.rise(p.valueAt, p.value, p.rate, r.seals.breakTime)
          : null,
      );
      return min(a.touchedAt, a.lastSealAt, a.endsAt, ...breaks);
    }
    const end = a.endsAt!;
    // Light already at 0 (e.g. the drainers left on the very step it ran out): failure is due.
    if (a.value <= 0) return Math.min(end, a.valueAt);
    if (a.rate < 0) return Math.min(end, a.valueAt + a.value / -a.rate);
    return end;
  }
  /**
   * Everything due at `now`, in id order: shrine capture / decay-out, lantern activation, defence
   * success, Light out, fade-outs, thief escape, nest crumble; snare snap, altar acceptance, chain
   * lighting / dimming / arrival, seal breaks and the seals chest. Finished activities are removed.
   */
  resolveDue(now: number, context: ActivityResolveContext = {}): ActivityEvent[] {
    const out: ActivityEvent[] = [];
    const r = ACTIVITY_RULES;
    for (const a of [...this.activities.values()]) {
      const due = this.dueAt(a);
      if (due === null || !tieTime(due, now)) continue;
      if (a.type === 'snare' || a.type === 'altar' || a.type === 'chain' || a.type === 'seals') {
        this.resolveTask38(a, now, context, out);
        continue;
      }
      // Read before settling: a capture / activation already reached stays reached.
      const done =
        a.type === 'shrine'
          ? reached(a.value, r.shrine.captureTime)
          : a.type === 'lantern' &&
            a.phase === 'waiting' &&
            reached(a.value, r.lantern.activateTime);
      this.settle(a, now);
      if (a.type === 'thief') out.push(this.finish(a, now, 'escaped'));
      else if (a.type === 'nest') out.push(this.finish(a, now, 'expired'));
      else if (a.type === 'shrine') {
        if (!a.started) out.push(this.fade(a, now));
        else if (done || a.rate > 0) {
          a.value = r.shrine.captureTime;
          out.push(this.finish(a, now, null));
        } else out.push(this.finish(a, now, 'abandoned'));
      } else if (a.phase === 'waiting') {
        if (
          done ||
          (a.rate > 0 && tieTime(a.valueAt + (r.lantern.activateTime - a.value) / a.rate, now))
        ) {
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
  /** Task 38 results of one activity due at `now` (a success wins a tie with its deadline). */
  private resolveTask38(
    a: ActivityState,
    now: number,
    context: ActivityResolveContext,
    out: ActivityEvent[],
  ): void {
    const r = ACTIVITY_RULES;
    const hold = holdTime(a);
    // Read before settling: an activation / acceptance already reached stays reached.
    const done =
      hold !== null &&
      (reached(a.value, hold) ||
        (a.rate > 0 && tieTime(a.valueAt + (hold - a.value) / a.rate, now)));
    const T = r.seals.breakTime;
    const breaking = a.points.map(
      (p) =>
        a.type === 'seals' &&
        p.state === 'idle' &&
        (reached(p.value, T) || (p.rate > 0 && tieTime(p.valueAt + (T - p.value) / p.rate, now))),
    );
    this.settle(a, now);
    if (a.type === 'snare') {
      // Snap: by the threshold (armed, with the bonus) or at the end of the lifetime if at least
      // one enemy is inside at that instant; otherwise it fades with no effect.
      if (a.phase === 'armed') out.push(this.finish(a, now, null));
      else {
        a.count = context.enemiesNear ? context.enemiesNear(a, r.snare.radius) : a.count;
        out.push(a.count > 0 ? this.finish(a, now, null) : this.fade(a, now));
      }
      return;
    }
    if (a.type === 'altar') {
      if (done) {
        if (context.canPay && !context.canPay()) {
          // Too weak at the instant of acceptance: refused, progress back to 0.
          a.blocked = true;
          a.value = 0;
          a.rate = 0;
          if (tieTime(a.spawnedAt + r.startWindow, now)) out.push(this.fade(a, now));
          return;
        }
        a.value = r.altar.acceptTime;
        out.push(this.finish(a, now, null));
      } else out.push(this.fade(a, now));
      return;
    }
    if (a.type === 'chain') {
      if (a.phase === 'waiting') {
        if (!done) {
          out.push(this.fade(a, now));
          return;
        }
        const target = this.placeChainTarget(a);
        if (!target) {
          out.push(this.fade(a, now));
          return;
        }
        a.started = true;
        a.phase = 'active';
        a.value = r.chain.activateTime;
        a.rate = 0;
        a.timer = chainTimer(Math.hypot(target.x - a.x, target.y - a.y), this.baseMoveSpeed);
        a.endsAt = now + a.timer;
        a.points = [
          {
            x: target.x,
            y: target.y,
            value: 0,
            valueAt: now,
            rate: 0,
            inside: false,
            state: 'idle',
          },
        ];
        out.push(Object.freeze({ type: 'activity-started', activity: this.snapshot(a, now) }));
      } else if (a.touchedAt !== null && tieTime(a.touchedAt, now))
        out.push(this.finish(a, now, null));
      else if (a.phase === 'active') {
        a.phase = 'dimmed';
        a.endsAt = now + r.chain.lateWindow;
      } else out.push(this.finish(a, now, 'expired'));
      return;
    }
    // Three Seals.
    if (!a.started) {
      out.push(this.fade(a, now));
      return;
    }
    a.points.forEach((p, i) => {
      if (!breaking[i]) return;
      p.state = 'broken';
      p.value = T;
      p.rate = 0;
      p.inside = false;
      a.broken++;
      if (a.broken >= r.seals.unlockAt && a.phase !== 'unlocked') {
        a.phase = 'unlocked';
        a.lastSealAt = now + r.seals.lastSealTime;
      }
      if (!a.points.some((q) => q.state === 'idle')) a.lastSealAt = null;
      out.push(
        Object.freeze({
          type: 'activity-seal-broken',
          activityId: a.id,
          seal: i,
          position: Object.freeze({ x: p.x, y: p.y }),
          chest: Object.freeze({ x: a.x, y: a.y }),
          broken: a.broken,
        }),
      );
    });
    if (a.lastSealAt !== null && tieTime(a.lastSealAt, now)) {
      for (const p of a.points) if (p.state === 'idle') p.state = 'gone';
      a.lastSealAt = null;
    }
    if (a.touchedAt !== null && tieTime(a.touchedAt, now)) out.push(this.finish(a, now, null));
    else if (tieTime(a.endsAt!, now)) out.push(this.finish(a, now, 'expired'));
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
  /**
   * Debug: complete or fail an activity now (the world pays a completion like a normal one). A
   * forced snare snaps with its bonus; a forced chain gives the Enchanted Chest; forced seals
   * count as all three broken.
   */
  force(id: string, now: number, outcome: 'complete' | 'fail'): ActivityEvent | null {
    const a = this.activities.get(id);
    if (!a) return null;
    this.settle(a, now);
    if (outcome === 'fail') return this.finish(a, now, 'debug');
    if (a.type === 'lantern') this.lit.push(Object.freeze({ x: a.x, y: a.y }));
    if (a.type === 'snare') a.phase = 'armed';
    if (a.type === 'chain') {
      a.phase = 'active';
      if (!a.points.length)
        a.points = [
          { x: a.x, y: a.y, value: 0, valueAt: now, rate: 0, inside: false, state: 'idle' },
        ];
    }
    if (a.type === 'seals') {
      for (const p of a.points) p.state = 'broken';
      a.broken = a.points.length;
      a.phase = 'unlocked';
    }
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
    const hold = holdTime(a);
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    if (a.type === 'shrine') {
      value = Math.min(r.shrine.captureTime, Math.max(0, value));
      progress = value / r.shrine.captureTime;
    } else if (hold !== null) {
      value = Math.min(hold, Math.max(0, value));
      progress = value / hold;
    } else if (a.type === 'lantern') {
      light = Math.max(0, value);
      progress = clamp01(1 - (a.endsAt! - now) / r.lantern.defendTime);
    } else if (a.type === 'snare')
      progress = a.phase === 'armed' ? 1 : clamp01(a.count / Math.max(1, a.threshold));
    else if (a.type === 'chain') {
      const span = a.phase === 'dimmed' ? r.chain.lateWindow : a.timer;
      progress = span > 0 ? clamp01(1 - (a.endsAt! - now) / span) : 1;
    } else if (a.type === 'seals') progress = a.broken / r.seals.count;
    else {
      const life = a.type === 'thief' ? r.thief.lifetime : r.nest.lifetime;
      progress = clamp01((now - a.spawnedAt) / life);
    }
    const points = a.points.length
      ? Object.freeze(
          a.points.map((p) => {
            const v =
              p.state === 'idle'
                ? Math.min(
                    r.seals.breakTime,
                    Math.max(0, p.value + p.rate * Math.max(0, now - p.valueAt)),
                  )
                : r.seals.breakTime;
            return Object.freeze({
              x: p.x,
              y: p.y,
              progress: a.type === 'seals' ? v / r.seals.breakTime : 0,
              state: p.state,
              playerInside: p.inside,
            });
          }),
        )
      : NO_POINTS;
    return Object.freeze({
      id: a.id,
      type: a.type,
      name: ACTIVITY_NAMES[a.type],
      x: a.x,
      y: a.y,
      phase: a.phase,
      spawnedAt: a.spawnedAt,
      fadesAt: !a.started ? a.spawnedAt + r.startWindow : null,
      progress,
      light,
      endsAt: a.endsAt,
      enemyId: a.enemyId,
      playerInside: a.inside,
      points,
      count: a.type === 'snare' ? a.count : null,
      threshold: a.type === 'snare' ? a.threshold : null,
      blocked: a.blocked,
      broken: a.broken,
    });
  }
}
