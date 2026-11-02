import { TALENT_CONFIG } from './config';
import type { TalentStat } from './effects';
import type { TalentConfig, TalentRanks } from './types';

/**
 * Task 09.1 Phase 1 shared talent runtime (framework-free; owned by the Skill Engine, which is a
 * GameplayWorld boundary module). Everything runs on simulation time supplied by the owner, so
 * cooldowns, buffs and entity timers freeze whenever the world does (pause, level-up, death).
 *
 * - `rank(id)` / `params(id)`: active rank and its catalog numbers (0 / null when not ready).
 * - Cooldowns: per talent or per talent+target key.
 * - Buffs: «refresh, don't stack» (same id replaces value and expiry).
 * - Proc guard: while a talent-created hit resolves, no talent reaction may start (no chains).
 * - Entities: talent-spawned objects (shadow copy, ballistae…) with lifetime, simulation-time
 *   action timers and cleanup on run end / player death.
 * - `roll(percent)`: talent randomness from its own seeded stream (Task 08.5 RNG).
 */
export interface TalentEntity {
  readonly id: string;
  readonly kind: string;
  readonly nodeId: string;
  readonly spawnedAt: number;
  expiresAt: number;
  /** Next scheduled action (attack) or null when idle. */
  nextActionAt: number | null;
  x: number;
  y: number;
  /** Per-entity state for its handler (target lock, counters…). */
  readonly data: Record<string, unknown>;
}
export interface TalentScheduled {
  readonly at: number;
  /** 0 = action, 1 = expiration (same convention as the Skill Engine). */
  readonly priority: 0 | 1;
  readonly order: number;
  readonly run: () => void;
}
export interface TalentRuntimeOptions {
  readonly ranks?: TalentRanks;
  readonly config?: TalentConfig;
  readonly now: () => number;
  /** Seeded [0, 1) stream reserved for talents. */
  readonly random: () => number;
}
type EntityAction = (entity: TalentEntity) => void;
const STAMP_TTL = 60;

export class TalentRuntime {
  private readonly config: TalentConfig;
  private readonly ranks: TalentRanks;
  private readonly cooldowns = new Map<string, number>();
  private readonly buffs = new Map<
    string,
    { value: number; until: number; stat: TalentStat | null }
  >();
  private readonly entities = new Map<string, TalentEntity>();
  private readonly actions = new Map<string, EntityAction>();
  private entitySequence = 0;
  private procDepth = 0;
  /** Called whenever a buff appears/expires so the owner can recompose stats once. */
  onBuffsChanged: () => void = () => {};

  constructor(private readonly options: TalentRuntimeOptions) {
    this.config = options.config ?? TALENT_CONFIG;
    this.ranks = options.ranks ?? {};
  }
  get now(): number {
    return this.options.now();
  }
  /** Active (ready) rank of a node: 0 when not bought or not implemented. */
  rank(nodeId: string): number {
    const rank = this.ranks[nodeId] ?? 0;
    if (rank < 1) return 0;
    return this.config.nodes.get(nodeId)?.ranks[rank - 1]?.active ? rank : 0;
  }
  /** Catalog parameters of the active rank's behaviour (null when inactive). */
  params(nodeId: string): Readonly<Record<string, number>> | null {
    const rank = this.rank(nodeId);
    if (!rank) return null;
    const effect = this.config.nodes
      .get(nodeId)!
      .ranks[rank - 1].effects.find((e) => e.kind === 'behavior');
    return effect && effect.kind === 'behavior' ? effect.params : null;
  }
  roll(percent: number): boolean {
    if (percent >= 100) return true;
    if (percent <= 0) return false;
    const v = this.options.random();
    if (!Number.isFinite(v) || v < 0 || v >= 1)
      throw new RangeError('Talent random source must return a number in [0, 1).');
    return v < percent / 100;
  }

  // ── 1.2 cooldowns and refresh-not-stack buffs ──
  ready(key: string): boolean {
    const at = this.cooldowns.get(key);
    return at === undefined || at <= this.now + 1e-9;
  }
  startCooldown(key: string, seconds: number): void {
    if (!(seconds >= 0)) throw new RangeError('Cooldown must be ≥ 0.');
    this.cooldowns.set(key, this.now + seconds);
  }
  /** Ready → start the cooldown and return true; otherwise false. */
  tryCooldown(key: string, seconds: number): boolean {
    if (!this.ready(key)) return false;
    this.startCooldown(key, seconds);
    return true;
  }
  /** Refresh, don't stack: the same id replaces value and expiry. `stat` feeds run stats. */
  setBuff(id: string, value: number, seconds: number, stat: TalentStat | null = null): void {
    const had = this.buffValue(id);
    this.buffs.set(id, { value, until: this.now + seconds, stat });
    if (had !== value) this.onBuffsChanged();
  }
  /** Active stat buffs summed per stat (composed with the other run modifiers once). */
  statBuffs(): Partial<Record<TalentStat, number>> {
    const out: Partial<Record<TalentStat, number>> = {};
    for (const [id, b] of this.buffs)
      if (b.stat && this.buffValue(id)) out[b.stat] = (out[b.stat] ?? 0) + b.value;
    return out;
  }
  buffValue(id: string): number {
    const b = this.buffs.get(id);
    return b && b.until > this.now + 1e-9 ? b.value : 0;
  }

  // ── 1.3 proc guard (anti-recursion) ──
  get inProc(): boolean {
    return this.procDepth > 0;
  }
  /** Runs a talent-created action; nested talent reactions are refused while it runs. */
  proc<T>(run: () => T): T | null {
    if (this.procDepth > 0) return null;
    this.procDepth++;
    try {
      return run();
    } finally {
      this.procDepth--;
    }
  }

  // ── 1.4 talent-spawned entities ──
  spawn(
    kind: string,
    nodeId: string,
    lifetime: number,
    at: { x: number; y: number },
    act?: EntityAction,
    firstActionIn: number | null = null,
  ): TalentEntity {
    if (!(lifetime > 0)) throw new RangeError('Entity lifetime must be > 0.');
    const id = `${kind}-${++this.entitySequence}`;
    const e: TalentEntity = {
      id,
      kind,
      nodeId,
      spawnedAt: this.now,
      expiresAt: this.now + lifetime,
      nextActionAt: firstActionIn === null ? null : this.now + firstActionIn,
      x: at.x,
      y: at.y,
      data: {},
    };
    this.entities.set(id, e);
    if (act) this.actions.set(id, act);
    return e;
  }
  list(kind?: string): readonly TalentEntity[] {
    const all = [...this.entities.values()];
    return kind ? all.filter((e) => e.kind === kind) : all;
  }
  remove(id: string): void {
    this.entities.delete(id);
    this.actions.delete(id);
  }
  /** Run end / player death: every talent entity and timed state is removed. */
  clearEntities(): void {
    this.entities.clear();
    this.actions.clear();
  }

  /** Boundary entries for the owner's scheduler (entity actions and expirations, buff ends). */
  scheduled(): TalentScheduled[] {
    const out: TalentScheduled[] = [];
    let order = 0;
    for (const e of this.entities.values()) {
      order++;
      if (e.nextActionAt !== null && e.nextActionAt < e.expiresAt)
        out.push({
          at: e.nextActionAt,
          priority: 0,
          order,
          run: () => {
            if (!this.entities.has(e.id)) return;
            e.nextActionAt = null;
            this.actions.get(e.id)?.(e);
          },
        });
      out.push({ at: e.expiresAt, priority: 1, order, run: () => this.remove(e.id) });
    }
    for (const [id, b] of this.buffs)
      out.push({
        at: b.until,
        priority: 1,
        order: 1e6 + order++,
        run: () => {
          this.buffs.delete(id);
          this.onBuffsChanged();
        },
      });
    return out;
  }
  /** Drops expired cooldown entries (bounded memory on long runs). */
  prune(): void {
    for (const [k, at] of this.cooldowns) if (at <= this.now) this.cooldowns.delete(k);
    for (const [k, at] of this.stamps) if (this.now - at > STAMP_TTL) this.stamps.delete(k);
  }
  // ── time stamps (e.g. «hits of both swords on one target within 2 s») ──
  private readonly stamps = new Map<string, number>();
  stamp(key: string): void {
    this.stamps.set(key, this.now);
  }
  /** Simulation time of the last stamp, or null (stamps older than 60 s are pruned). */
  stampedAt(key: string): number | null {
    return this.stamps.get(key) ?? null;
  }
}
