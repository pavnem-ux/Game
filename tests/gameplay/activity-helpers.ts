import { GameplayWorld } from '../../src/gameplay';
import type { WorldEvent } from '../../src/gameplay';
import type { ActivityEvent } from '../../src/gameplay/activities';
import { resolveOffers } from '../skills/helpers';

/** Task 24 test helpers (shared by the activity suites). */
export function campaignWorld(seed = 1, mapId = 1) {
  const w = new GameplayWorld({
    characterClass: 'mage',
    seed,
    initialEnemies: false,
    spawning: { enabled: false },
    onHit: [],
    campaign: { mapId },
  });
  w.setTestProtection(true);
  w.weapons.setAttackSpeed('player', 0.01);
  return w;
}
/** Steps the world, collecting events incrementally (the world history is bounded). */
export function step(w: GameplayWorld, seconds: number, dt = 0.25, sink: WorldEvent[] = []) {
  let seq = w.getEvents().at(-1)?.sequence ?? 0;
  const end = w.time + seconds;
  while (w.time < end - 1e-9) {
    resolveOffers(w);
    if (w.paused) break;
    w.update(Math.min(dt, end - w.time));
    const fresh = w.getEvents(seq);
    if (fresh.length) seq = fresh.at(-1)!.sequence;
    sink.push(...fresh);
  }
  return sink;
}
export const activityEvents = <T extends ActivityEvent['type']>(
  events: readonly WorldEvent[],
  type: T,
) =>
  events
    .filter((e) => e.channel === 'activities' && e.event.type === type)
    .map((e) => ({ time: e.time, event: e.event as Extract<ActivityEvent, { type: T }> }));
