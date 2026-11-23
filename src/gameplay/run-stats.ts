import type { WorldEvent } from './types';
import { ACTIVITY_TYPES } from './activities';
import type { ActivityType } from './activities';

/** Task 24 / 38: a zero count per activity type. */
const zeroActivities = (): Record<ActivityType, number> =>
  Object.fromEntries(ACTIVITY_TYPES.map((t) => [t, 0])) as Record<ActivityType, number>;

/**
 * Task 08.5 §2.1 run statistics. Framework-free and read-only: it consumes the world's own
 * recorded events (combat, weapon, progression) and never changes the simulation. One collector
 * per world, so every run starts empty. Memory is bounded: per-source/per-type maps are small,
 * attack/enemy lookups keep only recent entries and timelines are capped.
 */
export type EnemyType =
  | 'melee'
  | 'ranged'
  | 'swift'
  | 'brute'
  | 'bombard'
  | 'elite-melee'
  | 'elite-ranged'
  | 'boss';
export interface RunStatsResolver {
  readonly playerId: string;
  /** Skill/synergy attribution of an attack snapshot (`skill:<id>`, `synergy:<id>`). */
  attackSource(attackId: string): string | undefined;
  /** Enemy type of a living (registered) enemy; null = not an enemy. */
  enemyType(entityId: string): EnemyType | null;
  /** Player HP after the event being consumed (the world records after Core resolved it). */
  playerHp(): Readonly<{ hp: number; maxHp: number }>;
}
export interface DamageBySource {
  readonly source: string;
  readonly damage: number;
  readonly hits: number;
}
export interface RunStatsSnapshot {
  readonly damageDealt: number;
  /** Highest first. Source ids: `weapon:<id>`, `skill:<id>`, `synergy:<id>`, `talent:<nodeId>`, `pet.<id>`, `status:<effect>`, `debug`. */
  readonly bySource: readonly DamageBySource[];
  readonly damageTaken: number;
  readonly takenByType: readonly Readonly<{ type: EnemyType | 'unknown'; damage: number }>[];
  readonly kills: number;
  readonly killsByType: readonly Readonly<{ type: EnemyType; count: number }>[];
  readonly eliteKills: number;
  readonly bossKills: number;
  /** Each run level reached, with the simulation time (level 1 at 0). */
  readonly levelTimeline: readonly Readonly<{ level: number; time: number }>[];
  /** First player death (null = never died). */
  readonly deathTime: number | null;
  readonly deathTimes: readonly number[];
  readonly reviveUsed: boolean;
  readonly reviveTime: number | null;
  /** Times the player's HP dropped below 20% of Max HP (each drop counted once). */
  readonly lowHpMoments: number;
  readonly lowHpTimes: readonly number[];
  /** Damage dealt per second over the last 5 s of simulation time. */
  readonly dps: number;
  /** Task 20: the pet's own support — HP healed (firefly) and barrier granted (hedgehog). */
  readonly petSupport: Readonly<{ healing: number; barrier: number; actions: number }>;
  /** Task 14: dashes used and direct hits avoided during dash i-frames. */
  readonly dash: Readonly<{ used: number; hitsAvoided: number }>;
  /** Task 14: level-up offer controls used this run and the skills banished (in order). */
  readonly choices: Readonly<{
    rerolls: number;
    banishes: number;
    skips: number;
    banished: readonly string[];
  }>;
  /** Task 12: chests spawned / opened / expired by type, contents opened and buff uptime (s). */
  readonly chests: Readonly<{
    spawned: Readonly<Record<'wooden' | 'enchanted', number>>;
    opened: Readonly<Record<'wooden' | 'enchanted', number>>;
    expired: number;
    contents: Readonly<Record<string, number>>;
    buffUptime: Readonly<Record<'fury' | 'haste' | 'lightStep', number>>;
  }>;
  /**
   * Task 24: map activities by type — spawned, completed and failed (failed includes faded out,
   * escaped, crumbled, Light out and abandoned). Unfinished activities at run end count in none.
   */
  readonly activities: Readonly<{
    spawned: Readonly<Record<ActivityType, number>>;
    completed: Readonly<Record<ActivityType, number>>;
    failed: Readonly<Record<ActivityType, number>>;
  }>;
}
export const RUN_STATS_LIMITS = Object.freeze({
  lowHpThreshold: 0.2,
  dpsWindow: 5,
  dpsBucket: 0.25,
  recentAttacks: 512,
  knownEnemies: 1024,
  timeline: 100,
  lowHpTimes: 50,
});
const DEBUG_EFFECTS = new Set(['debug', 'test', 'debug-kill', 'test-clear']);
const BUCKETS = Math.round(RUN_STATS_LIMITS.dpsWindow / RUN_STATS_LIMITS.dpsBucket);

function remember<K, V>(map: Map<K, V>, key: K, value: V, limit: number) {
  map.delete(key);
  map.set(key, value);
  if (map.size > limit) map.delete(map.keys().next().value!);
}

export class RunStats {
  private readonly dealt = new Map<string, { damage: number; hits: number }>();
  private readonly taken = new Map<EnemyType | 'unknown', number>();
  private readonly chestSpawned = { wooden: 0, enchanted: 0 };
  private rerollsUsed = 0;
  private dashesUsed = 0;
  private dashAvoided = 0;
  private skipsUsed = 0;
  private readonly banishedIds: string[] = [];
  private readonly chestOpened = { wooden: 0, enchanted: 0 };
  private readonly activitySpawned = zeroActivities();
  private readonly activityCompleted = zeroActivities();
  private readonly activityFailed = zeroActivities();
  private chestExpired = 0;
  private readonly chestContents: Record<string, number> = {};
  private readonly buffUptime = { fury: 0, haste: 0, lightStep: 0 };
  private readonly buffActive = new Map<
    'fury' | 'haste' | 'lightStep',
    { startedAt: number; expiresAt: number }
  >();
  private readonly killed = new Map<EnemyType, number>();
  private readonly vanished = new Map<string, true>();
  private readonly weaponByAttack = new Map<string, string>();
  private readonly types = new Map<string, EnemyType>();
  private readonly timeline: { level: number; time: number }[] = [{ level: 1, time: 0 }];
  private readonly deaths: number[] = [];
  private readonly lowTimes: number[] = [];
  private readonly bucketIndex = new Array<number>(BUCKETS).fill(-1);
  private readonly bucketDamage = new Array<number>(BUCKETS).fill(0);
  private damageDealt = 0;
  private readonly pet = { healing: 0, barrier: 0, actions: 0 };
  private damageTaken = 0;
  private lowMoments = 0;
  private low = false;
  private revive: number | null = null;
  private version = 0;
  private cache: { version: number; bucket: number; snapshot: RunStatsSnapshot } | null = null;

  constructor(private readonly resolve: RunStatsResolver) {}

  /** Consume one recorded world event (called by the world for every recorded event). */
  consume(entry: WorldEvent): void {
    const { event, time } = entry;
    switch (event.type) {
      case 'impact':
        remember(
          this.weaponByAttack,
          event.attack.id,
          event.weaponId,
          RUN_STATS_LIMITS.recentAttacks,
        );
        return;
      case 'damage': {
        if (event.targetId === this.resolve.playerId) {
          this.addTaken(this.typeOf(event.sourceId), event.appliedDamage);
          this.checkLowHp(time);
        } else if (this.typeOf(event.targetId) !== 'unknown') {
          const source =
            this.resolve.attackSource(event.attackId) ??
            this.weaponSource(this.weaponByAttack.get(event.attackId));
          this.addDealt(source, event.appliedDamage, time);
        }
        return;
      }
      case 'periodic-damage': {
        const { sources, effectId } = event.periodic;
        // Task 24: an escaping thief / crumbling nest is removed by its own hand — not damage
        // dealt and not a kill.
        if (effectId === 'activity-vanish') {
          remember(this.vanished, event.targetId, true, RUN_STATS_LIMITS.knownEnemies);
          return;
        }
        const total = sources.reduce((sum, s) => sum + Math.max(0, s.rawDamage), 0);
        const share = (raw: number) =>
          total > 0 ? (event.appliedDamage * Math.max(0, raw)) / total : 0;
        if (event.targetId === this.resolve.playerId) {
          if (total > 0)
            for (const s of sources) this.addTaken(this.typeOf(s.sourceId), share(s.rawDamage));
          else this.addTaken('unknown', event.appliedDamage);
          this.checkLowHp(time);
        } else if (this.typeOf(event.targetId) !== 'unknown') {
          if (DEBUG_EFFECTS.has(effectId)) this.addDealt('debug', event.appliedDamage, time);
          else if (total > 0)
            for (const s of sources)
              this.addDealt(this.originSource(s.originId, effectId), share(s.rawDamage), time);
          else this.addDealt(`status:${effectId}`, event.appliedDamage, time);
        }
        return;
      }
      case 'death':
        if (event.entityId === this.resolve.playerId) {
          this.deaths.push(time);
          this.version++;
        } else if (!this.vanished.has(event.entityId)) {
          const type = this.typeOf(event.entityId);
          if (type !== 'unknown') {
            this.killed.set(type, (this.killed.get(type) ?? 0) + 1);
            this.version++;
          }
        }
        return;
      case 'revived':
        if (event.entityId === this.resolve.playerId) {
          this.revive ??= time;
          this.checkLowHp(time);
          this.version++;
        }
        return;
      case 'healing':
        if (event.entityId === this.resolve.playerId) this.checkLowHp(time);
        return;
      // Task 20: pet heals / barriers (its damage comes through Core events as `pet.<id>`).
      case 'pet-action':
        if (event.action === 'heal') this.pet.healing += event.amount;
        else if (event.action === 'barrier') this.pet.barrier += event.amount;
        if (event.action !== 'idle') this.pet.actions++;
        this.version++;
        return;
      // Task 14: dash.
      case 'dash-started':
        this.dashesUsed++;
        this.version++;
        return;
      case 'dash-hit-avoided':
        this.dashAvoided++;
        this.version++;
        return;
      // Task 14: level-up offer controls.
      case 'skill-offer':
        if (event.reroll) {
          this.rerollsUsed++;
          this.version++;
        }
        return;
      case 'skill-banished':
        this.banishedIds.push(event.skillId);
        this.version++;
        return;
      case 'skill-offer-skipped':
        this.skipsUsed++;
        this.version++;
        return;
      // Task 24: map activities.
      case 'activity-spawned':
        this.activitySpawned[event.activity.type]++;
        this.version++;
        return;
      case 'activity-completed':
        this.activityCompleted[event.activity.type]++;
        this.version++;
        return;
      case 'activity-failed':
      case 'activity-faded':
        this.activityFailed[event.activity.type]++;
        this.version++;
        return;
      // Task 12: chests and buffs.
      case 'chest-spawned':
        this.chestSpawned[event.chest.type]++;
        this.version++;
        return;
      case 'chest-expired':
        this.chestExpired++;
        this.version++;
        return;
      case 'chest-opened':
        this.chestOpened[event.chest.type]++;
        this.chestContents[event.content] = (this.chestContents[event.content] ?? 0) + 1;
        this.version++;
        return;
      case 'buff-started': {
        const active = this.buffActive.get(event.buff);
        this.buffActive.set(event.buff, {
          startedAt: active?.startedAt ?? time,
          expiresAt: event.expiresAt,
        });
        this.version++;
        return;
      }
      case 'buff-ended':
        this.buffActive.delete(event.buff);
        this.buffUptime[event.buff] += event.uptime;
        this.version++;
        return;
      case 'run-level-up':
        for (let level = event.previousLevel + 1; level <= event.level; level++)
          if (this.timeline.length < RUN_STATS_LIMITS.timeline) this.timeline.push({ level, time });
        this.version++;
        return;
    }
  }

  snapshot(now: number): RunStatsSnapshot {
    const bucket = Math.floor(now / RUN_STATS_LIMITS.dpsBucket);
    if (this.cache?.version === this.version && this.cache.bucket === bucket)
      return this.cache.snapshot;
    const byKills = [...this.killed].map(([type, count]) => Object.freeze({ type, count }));
    const snapshot: RunStatsSnapshot = Object.freeze({
      damageDealt: this.damageDealt,
      bySource: Object.freeze(
        [...this.dealt]
          .map(([source, v]) => Object.freeze({ source, damage: v.damage, hits: v.hits }))
          .sort((a, b) => b.damage - a.damage || a.source.localeCompare(b.source)),
      ),
      damageTaken: this.damageTaken,
      petSupport: Object.freeze({ ...this.pet }),
      takenByType: Object.freeze(
        [...this.taken]
          .map(([type, damage]) => Object.freeze({ type, damage }))
          .sort((a, b) => b.damage - a.damage),
      ),
      kills: byKills.reduce((sum, k) => sum + k.count, 0),
      killsByType: Object.freeze(byKills.sort((a, b) => b.count - a.count)),
      eliteKills: (this.killed.get('elite-melee') ?? 0) + (this.killed.get('elite-ranged') ?? 0),
      bossKills: this.killed.get('boss') ?? 0,
      levelTimeline: Object.freeze(this.timeline.map((t) => Object.freeze({ ...t }))),
      deathTime: this.deaths[0] ?? null,
      deathTimes: Object.freeze([...this.deaths]),
      reviveUsed: this.revive !== null,
      reviveTime: this.revive,
      lowHpMoments: this.lowMoments,
      lowHpTimes: Object.freeze([...this.lowTimes]),
      dps: this.dps(bucket, now),
      dash: Object.freeze({ used: this.dashesUsed, hitsAvoided: this.dashAvoided }),
      choices: Object.freeze({
        rerolls: this.rerollsUsed,
        banishes: this.banishedIds.length,
        skips: this.skipsUsed,
        banished: Object.freeze([...this.banishedIds]),
      }),
      activities: Object.freeze({
        spawned: Object.freeze({ ...this.activitySpawned }),
        completed: Object.freeze({ ...this.activityCompleted }),
        failed: Object.freeze({ ...this.activityFailed }),
      }),
      chests: Object.freeze({
        spawned: Object.freeze({ ...this.chestSpawned }),
        opened: Object.freeze({ ...this.chestOpened }),
        expired: this.chestExpired,
        contents: Object.freeze({ ...this.chestContents }),
        buffUptime: Object.freeze(
          Object.fromEntries(
            (['fury', 'haste', 'lightStep'] as const).map((id) => {
              const active = this.buffActive.get(id);
              const live = active
                ? Math.max(0, Math.min(now, active.expiresAt) - active.startedAt)
                : 0;
              return [id, this.buffUptime[id] + live];
            }),
          ) as Record<'fury' | 'haste' | 'lightStep', number>,
        ),
      }),
    });
    this.cache = { version: this.version, bucket, snapshot };
    return snapshot;
  }

  private dps(bucket: number, now: number) {
    let sum = 0;
    for (let i = 0; i < BUCKETS; i++)
      if (this.bucketIndex[i] > bucket - BUCKETS && this.bucketIndex[i] <= bucket)
        sum += this.bucketDamage[i];
    return sum / Math.min(RUN_STATS_LIMITS.dpsWindow, Math.max(now, RUN_STATS_LIMITS.dpsBucket));
  }
  private typeOf(entityId: string): EnemyType | 'unknown' {
    const type = this.resolve.enemyType(entityId);
    if (type) {
      remember(this.types, entityId, type, RUN_STATS_LIMITS.knownEnemies);
      return type;
    }
    return this.types.get(entityId) ?? 'unknown';
  }
  private weaponSource(weaponId: string | undefined) {
    if (!weaponId) return 'unknown';
    // Skill projectiles use `skill:<id>#<activation>[:<part>]` weapon ids.
    return weaponId.startsWith('skill:') ? weaponId.split('#')[0] : `weapon:${weaponId}`;
  }
  private originSource(originId: string | undefined, effectId: string) {
    if (!originId) return `status:${effectId}`;
    return originId.startsWith('skill:') ||
      originId.startsWith('synergy:') ||
      originId.startsWith('talent:') ||
      originId.startsWith('pet.')
      ? originId
      : `weapon:${originId}`;
  }
  private addDealt(source: string, amount: number, time: number) {
    if (!(amount > 0)) return;
    const entry = this.dealt.get(source) ?? { damage: 0, hits: 0 };
    entry.damage += amount;
    entry.hits++;
    this.dealt.set(source, entry);
    this.damageDealt += amount;
    const bucket = Math.floor(time / RUN_STATS_LIMITS.dpsBucket);
    const i = bucket % BUCKETS;
    if (this.bucketIndex[i] !== bucket) {
      this.bucketIndex[i] = bucket;
      this.bucketDamage[i] = 0;
    }
    this.bucketDamage[i] += amount;
    this.version++;
  }
  private addTaken(type: EnemyType | 'unknown', amount: number) {
    if (!(amount > 0)) return;
    this.taken.set(type, (this.taken.get(type) ?? 0) + amount);
    this.damageTaken += amount;
    this.version++;
  }
  private checkLowHp(time: number) {
    const { hp, maxHp } = this.resolve.playerHp();
    const low = hp > 0 && maxHp > 0 && hp / maxHp < RUN_STATS_LIMITS.lowHpThreshold;
    if (low && !this.low) {
      this.lowMoments++;
      if (this.lowTimes.length < RUN_STATS_LIMITS.lowHpTimes) this.lowTimes.push(time);
      this.version++;
    }
    this.low = low;
  }
}
