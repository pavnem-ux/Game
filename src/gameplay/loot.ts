import type { Point } from '../weapon-attacks';
import type { ItemInstance, Rarity } from '../equipment';
import { XP_RULES } from './experience';

/**
 * Task 42 run loot: items dropped by elites lie on the ground as pickups (collected by walking over
 * them, the crystal pickup radius applies); the boss item goes straight to the collected list.
 * Everything still on the ground is collected when the run ends (victory or defeat). The collected
 * items enter the profile once, with the run result (run-ID deduplication).
 */
export interface LootPickup extends Point {
  readonly id: string;
  readonly item: ItemInstance;
}
export type LootEvent =
  | { readonly type: 'item-dropped'; readonly pickupId: string; readonly rarity: Rarity }
  | {
      readonly type: 'item-collected';
      readonly pickupId: string | null;
      readonly source: 'elite' | 'boss';
      readonly item: ItemInstance;
    };
export class RunLoot {
  private sequence = 0;
  private readonly pickups = new Map<string, LootPickup>();
  private readonly gained: ItemInstance[] = [];
  /** Items collected this run, in order (the boss item last). */
  get collected(): readonly ItemInstance[] {
    return Object.freeze([...this.gained]);
  }
  getPickups(): readonly LootPickup[] {
    return Object.freeze([...this.pickups.values()]);
  }
  /** The next run-local item uid (`drop-<n>`; the profile assigns real uids). */
  nextUid(): string {
    return `drop-${this.sequence + 1}`;
  }
  drop(position: Point, item: ItemInstance): LootEvent {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
      throw new RangeError('Invalid loot position.');
    const pickup: LootPickup = Object.freeze({
      id: `loot-${++this.sequence}`,
      x: position.x,
      y: position.y,
      item,
    });
    this.pickups.set(pickup.id, pickup);
    return Object.freeze({ type: 'item-dropped', pickupId: pickup.id, rarity: item.rarity });
  }
  /** The boss item: collected at once (the run ends at the boss kill). */
  grant(item: ItemInstance): LootEvent {
    this.sequence++;
    this.gained.push(item);
    return Object.freeze({ type: 'item-collected', pickupId: null, source: 'boss', item });
  }
  collect(position: Point, playerRadius: number, pickupScale = 1): readonly LootEvent[] {
    const reach = playerRadius + XP_RULES.pickupRadius * pickupScale + XP_RULES.crystalRadius;
    const events: LootEvent[] = [];
    for (const p of [...this.pickups.values()])
      if (Math.hypot(p.x - position.x, p.y - position.y) <= reach) events.push(this.take(p));
    return Object.freeze(events);
  }
  /** Collects every pickup still on the ground (the run ended). */
  collectAll(): readonly LootEvent[] {
    return Object.freeze([...this.pickups.values()].map((p) => this.take(p)));
  }
  private take(p: LootPickup): LootEvent {
    this.pickups.delete(p.id);
    this.gained.push(p.item);
    return Object.freeze({
      type: 'item-collected',
      pickupId: p.id,
      source: 'elite',
      item: p.item,
    });
  }
}
