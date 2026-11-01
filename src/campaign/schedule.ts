import { CAMPAIGN_BALANCE, CAMPAIGN_MAPS } from './config';
import type { CampaignMap, EliteProfileId } from './config';

/**
 * Task 08 elite/boss/end schedule. Pure and deterministic: the event list depends only on the map.
 * Elites every `elite.interval` seconds strictly before the map end; the boss replaces the elite
 * slot at `boss.spawnTime`; a final `end` event marks the duration. `CampaignDirector` fires each
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
  let index = 0;
  for (let time: number = elite.interval; time <= map.durationSeconds; time += elite.interval) {
    if (time === boss.spawnTime) events.push(Object.freeze({ id: 'boss', kind: 'boss', time }));
    else if (time < map.durationSeconds) {
      const profile = elite.profiles[index % elite.profiles.length];
      events.push(Object.freeze({ id: `elite-${index + 1}`, kind: 'elite', time, index, profile }));
      index++;
    }
  }
  if (!events.some((e) => e.kind === 'boss'))
    throw new Error(`Map ${map.id} has no boss slot before its end.`);
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
    if (!next || next.time > time) return null;
    this.fired.set(next.id, time);
    return next;
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
for (const map of CAMPAIGN_MAPS)
  if (scheduledEnemyCount(map) > CAMPAIGN_BALANCE.reservedSlots)
    throw new Error(`Map ${map.id} schedules more enemies than the reserved slots.`);
