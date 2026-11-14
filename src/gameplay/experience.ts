import type { Point } from '../weapon-attacks';
/** Task 06.1 provisional progression, independent of permanent Character Stats. */
export const XP_RULES = Object.freeze({
  baseCost: 20,
  costPerLevel: 10,
  /**
   * Task 12 §1.1 (provisional): quadratic term `a` of the run level cost
   * `20 + 10·(L−1) + round(a·(L−1)²)` — slows late run levels; early levels barely change.
   * Tuned in 4.1 (start value 0.25): run level ≈ 70 at 15:00 with all XP collected.
   */
  costQuadratic: 0.4,
  /** Task 10 §1.3 (provisional): run XP −20% (was 10 / 15). */
  meleeReward: 8,
  rangedReward: 12,
  /** Task 12 §1.3 (provisional): +75% (was 42); coins and the magnet share it. */
  pickupRadius: 74,
  crystalRadius: 5,
  cellSize: 64,
  crystalCap: 512,
});
export interface XpCrystal extends Point {
  readonly id: string;
  readonly value: number;
}
export interface RunProgression {
  readonly level: number;
  readonly xp: number;
  readonly nextXp: number;
  readonly totalXp: number;
}
export type ExperienceEvent =
  | { readonly type: 'xp-collected'; readonly amount: number; readonly crystalId: string }
  | { readonly type: 'run-level-up'; readonly previousLevel: number; readonly level: number }
  | { readonly type: 'test-xp-granted'; readonly amount: number };
const integer = (value: number, name: string) => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${name} must be a safe non-negative integer.`);
};
export function runXpCost(level: number): number {
  integer(level, 'run level');
  if (level < 1) throw new RangeError('Run level starts at 1.');
  const cost =
    XP_RULES.baseCost +
    XP_RULES.costPerLevel * (level - 1) +
    Math.round(XP_RULES.costQuadratic * (level - 1) ** 2);
  integer(cost, 'XP cost');
  return cost;
}
export class RunExperience {
  private level = 1;
  private xp = 0;
  private total = 0;
  private sequence = 0;
  private readonly crystals = new Map<string, XpCrystal>();
  private readonly cells = new Map<string, string>();
  getState(): RunProgression {
    return Object.freeze({
      level: this.level,
      xp: this.xp,
      nextXp: runXpCost(this.level),
      totalXp: this.total,
    });
  }
  getCrystals(): readonly XpCrystal[] {
    return Object.freeze([...this.crystals.values()]);
  }
  drop(position: Point, value: number): XpCrystal {
    integer(value, 'crystal XP');
    if (value === 0 || !Number.isFinite(position.x) || !Number.isFinite(position.y))
      throw new RangeError('Invalid XP crystal.');
    const key = this.key(position);
    let existing = this.cells.get(key);
    // Preserve every XP unit. At capacity consolidate into the nearest existing crystal, never expire it.
    if (!existing && this.crystals.size >= XP_RULES.crystalCap) {
      let distance = Infinity;
      for (const crystal of this.crystals.values()) {
        const d = Math.hypot(crystal.x - position.x, crystal.y - position.y);
        if (d < distance) {
          existing = crystal.id;
          distance = d;
        }
      }
    }
    const previous = existing ? this.crystals.get(existing)! : undefined;
    const amount = value + (previous?.value ?? 0);
    integer(amount, 'merged crystal XP');
    const crystal = Object.freeze({
      id: existing ?? `xp-${++this.sequence}`,
      x: previous?.x ?? position.x,
      y: previous?.y ?? position.y,
      value: amount,
    });
    this.crystals.set(crystal.id, crystal);
    if (!previous) this.cells.set(key, crystal.id);
    return crystal;
  }
  /** `pickupScale` (Task 20 kitten) widens the pickup radius (default 1 = unchanged). */
  collect(position: Point, playerRadius: number, pickupScale = 1): readonly ExperienceEvent[] {
    if (
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(playerRadius) ||
      playerRadius < 0 ||
      !(pickupScale > 0)
    )
      throw new RangeError('Invalid pickup geometry.');
    const collected = [...this.crystals.values()].filter(
      (c) =>
        Math.hypot(c.x - position.x, c.y - position.y) <=
        playerRadius + XP_RULES.pickupRadius * pickupScale + XP_RULES.crystalRadius,
    );
    const amount = collected.reduce((sum, c) => sum + c.value, 0);
    this.validateGain(amount);
    const events: ExperienceEvent[] = [];
    for (const c of collected) {
      this.crystals.delete(c.id);
      this.cells.delete(this.key(c));
      events.push(Object.freeze({ type: 'xp-collected', amount: c.value, crystalId: c.id }));
    }
    events.push(...this.gain(amount));
    return Object.freeze(events);
  }
  /**
   * Task 12 («Magnet»): collects every crystal on the map through the normal collection path
   * (each crystal once, all XP kept, level-ups resolved by the same gain rule).
   */
  collectAll(): readonly ExperienceEvent[] {
    const collected = [...this.crystals.values()];
    const amount = collected.reduce((sum, c) => sum + c.value, 0);
    this.validateGain(amount);
    const events: ExperienceEvent[] = [];
    for (const c of collected) {
      this.crystals.delete(c.id);
      this.cells.delete(this.key(c));
      events.push(Object.freeze({ type: 'xp-collected', amount: c.value, crystalId: c.id }));
    }
    events.push(...this.gain(amount));
    return Object.freeze(events);
  }
  grantForTesting(amount: number): readonly ExperienceEvent[] {
    this.validateGain(amount);
    return Object.freeze([
      Object.freeze({ type: 'test-xp-granted' as const, amount }),
      ...this.gain(amount),
    ]);
  }
  private validateGain(amount: number) {
    integer(amount, 'XP gain');
    integer(this.total + amount, 'total XP');
    integer(this.xp + amount, 'current XP');
  }
  private gain(amount: number): readonly ExperienceEvent[] {
    this.validateGain(amount);
    const previousLevel = this.level;
    this.total += amount;
    this.xp += amount;
    while (this.xp >= runXpCost(this.level)) {
      this.xp -= runXpCost(this.level);
      this.level++;
    }
    return this.level === previousLevel
      ? []
      : [Object.freeze({ type: 'run-level-up', previousLevel, level: this.level })];
  }
  private key(p: Point) {
    return `${Math.floor(p.x / XP_RULES.cellSize)},${Math.floor(p.y / XP_RULES.cellSize)}`;
  }
}
