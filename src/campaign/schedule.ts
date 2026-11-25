import { sameInstant } from '../simulation-boundary';
import { CAMPAIGN_BALANCE, CAMPAIGN_DIFFICULTIES, CAMPAIGN_MAPS, getCampaignMap } from './config';
import type { CampaignMap, EliteProfileId } from './config';

/**
 * Task 08 elite/boss/end schedule. Pure and deterministic: the event list depends only on the map.
 * Elites every `elite.interval` seconds strictly before the map end; the boss appears at the map
 * end (owner decision in the Task 11 review: the map is won the moment it dies); a final `end`
 * event marks the duration. `CampaignDirector` fires each
 * event exactly once from state (never from the bounded world event history), so pause/resume,
 * revival and arbitrarily large frame steps cannot skip or duplicate an event.
 */
export type ScheduledEvent =
  | {
      readonly id: string;
      readonly kind: 'elite';
      readonly time: number;
      readonly index: number;
      readonly profile: EliteProfileId;
    }
  | { readonly id: 'boss'; readonly kind: 'boss'; readonly time: number }
  | { readonly id: 'end'; readonly kind: 'end'; readonly time: number };

export function campaignSchedule(map: CampaignMap): readonly ScheduledEvent[] {
  const { elite, boss } = CAMPAIGN_BALANCE;
  const events: ScheduledEvent[] = [];
  // Task 39: the Elite Trial is a short map by design (boss at 3:00).
  if (map.tier !== 'trial' && !(map.durationSeconds >= boss.minSpawnTime))
    throw new Error(`Map ${map.id} has no boss slot before its end.`);
  // Task 10: the act's elite interval (strictly before the end) and per-event
  // count; several elites of one event are separate events at the same time (index order).
  let index = 0;
  for (const time of map.eliteTimes)
    for (let n = 0; n < map.elite.perEvent; n++) {
      const profile = elite.profiles[index % elite.profiles.length];
      events.push(Object.freeze({ id: `elite-${index + 1}`, kind: 'elite', time, index, profile }));
      index++;
    }
  events.push(Object.freeze({ id: 'boss', kind: 'boss', time: map.durationSeconds }));
  events.push(Object.freeze({ id: 'end', kind: 'end', time: map.durationSeconds }));
  // Stable order: by time; at equal time elites/boss resolve before the end marker.
  return Object.freeze(
    events.sort((a, b) => a.time - b.time || (a.kind === 'end' ? 1 : b.kind === 'end' ? -1 : 0)),
  );
}

/** Number of enemies the schedule can add at most (all elites + the boss). */
export function scheduledEnemyCount(map: CampaignMap): number {
  return campaignSchedule(map).filter((e) => e.kind !== 'end').length;
}

export class CampaignDirector {
  readonly events: readonly ScheduledEvent[];
  /** Event id → simulation time it fired (authoritative; the world history is bounded). */
  private readonly fired = new Map<string, number>();
  constructor(map: CampaignMap) {
    this.events = campaignSchedule(map);
  }
  /** Earliest event not fired yet, or null when the schedule is exhausted. */
  peek(): ScheduledEvent | null {
    return this.events.find((e) => !this.fired.has(e.id)) ?? null;
  }
  /** Fires the earliest pending event due at or before `time`; null if none is due. */
  fire(time: number): ScheduledEvent | null {
    const next = this.peek();
    // Same tolerance as the world's boundary selection, so a selected boundary always fires.
    if (!next || (next.time > time && !sameInstant(next.time, time))) return null;
    this.fired.set(next.id, time);
    return next;
  }
  /** Debug only: fires a specific pending event now (still exactly once). */
  fireNow(id: string, time: number): ScheduledEvent | null {
    const event = this.events.find((e) => e.id === id);
    if (!event || this.fired.has(id)) return null;
    this.fired.set(id, time);
    return event;
  }
  hasFired(id: string): boolean {
    return this.fired.has(id);
  }
  firedIds(): readonly string[] {
    return Object.freeze(this.events.filter((e) => this.fired.has(e.id)).map((e) => e.id));
  }
  /** Fired events with the simulation time they fired at, in schedule order. */
  firedLog(): readonly Readonly<{ id: string; time: number }>[] {
    return Object.freeze(
      this.events
        .filter((e) => this.fired.has(e.id))
        .map((e) => Object.freeze({ id: e.id, time: this.fired.get(e.id)! })),
    );
  }
}

// Startup validation: every map's scheduled enemies fit in the reserved slots.
// Task 39: every difficulty tier of every map, too.
for (const base of CAMPAIGN_MAPS)
  for (const tier of CAMPAIGN_DIFFICULTIES) {
    const map = getCampaignMap(base.id, tier);
    if (scheduledEnemyCount(map) > map.reservedSlots)
      throw new Error(`Map ${map.id} (${tier}) schedules more enemies than the reserved slots.`);
  }
