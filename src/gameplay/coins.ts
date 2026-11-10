import type { Point } from '../weapon-attacks';
import { COIN_RULES } from '../equipment/economy';
import { XP_RULES } from './experience';

/**
 * Task 11 §1.4 run coins: pickups with the same magnet/collection rules as XP crystals (pickup
 * radius, cell merging), a separate pile cap, and no loss at the cap (a new pile merges into the
 * nearest one). Collected coins only grow; they become Gold through the run result (once).
 */
export interface CoinPile extends Point {
  readonly id: string;
  readonly value: number;
}
export type CoinEvent =
  | { readonly type: 'coins-dropped'; readonly pileId: string; readonly amount: number }
  | { readonly type: 'coins-collected'; readonly pileId: string; readonly amount: number };
const integer = (v: number, what: string) => {
  if (!Number.isSafeInteger(v) || v < 0)
    throw new RangeError(`${what} must be a whole number ≥ 0.`);
};
export class RunCoins {
  private collectedTotal = 0;
  private sequence = 0;
  private readonly piles = new Map<string, CoinPile>();
  private readonly cells = new Map<string, string>();
  get collected(): number {
    return this.collectedTotal;
  }
  /** Coins lying on the ground (not collected). */
  get onGround(): number {
    let sum = 0;
    for (const p of this.piles.values()) sum += p.value;
    return sum;
  }
  getPiles(): readonly CoinPile[] {
    return Object.freeze([...this.piles.values()]);
  }
  drop(position: Point, value: number): CoinPile {
    integer(value, 'coin value');
    if (value === 0 || !Number.isFinite(position.x) || !Number.isFinite(position.y))
      throw new RangeError('Invalid coin pile.');
    const key = this.key(position);
    let existing = this.cells.get(key);
    if (!existing && this.piles.size >= COIN_RULES.pileCap) {
      let distance = Infinity;
      for (const pile of this.piles.values()) {
        const d = Math.hypot(pile.x - position.x, pile.y - position.y);
        if (d < distance) {
          existing = pile.id;
          distance = d;
        }
      }
    }
    const previous = existing ? this.piles.get(existing)! : undefined;
    const pile: CoinPile = Object.freeze({
      id: existing ?? `coins-${++this.sequence}`,
      x: previous?.x ?? position.x,
      y: previous?.y ?? position.y,
      value: value + (previous?.value ?? 0),
    });
    integer(pile.value, 'merged coin pile');
    this.piles.set(pile.id, pile);
    if (!previous) this.cells.set(key, pile.id);
    return pile;
  }
  collect(position: Point, playerRadius: number): readonly CoinEvent[] {
    const reach = playerRadius + XP_RULES.pickupRadius + XP_RULES.crystalRadius;
    const events: CoinEvent[] = [];
    for (const pile of [...this.piles.values()])
      if (Math.hypot(pile.x - position.x, pile.y - position.y) <= reach) {
        this.piles.delete(pile.id);
        this.cells.delete(this.key(pile));
        this.collectedTotal += pile.value;
        events.push(
          Object.freeze({ type: 'coins-collected', pileId: pile.id, amount: pile.value }),
        );
      }
    return Object.freeze(events);
  }
  /** Collects every pile still on the ground (a won run pays them all). */
  collectAll(): readonly CoinEvent[] {
    const events: CoinEvent[] = [];
    for (const pile of this.piles.values()) {
      this.collectedTotal += pile.value;
      events.push(Object.freeze({ type: 'coins-collected', pileId: pile.id, amount: pile.value }));
    }
    this.piles.clear();
    this.cells.clear();
    return Object.freeze(events);
  }
  private key(p: Point) {
    return `${Math.floor(p.x / XP_RULES.cellSize)},${Math.floor(p.y / XP_RULES.cellSize)}`;
  }
}
