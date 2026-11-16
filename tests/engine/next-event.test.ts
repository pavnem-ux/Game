import { describe, expect, it } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import {
  CAMPAIGN_MAPS,
  CampaignDirector,
  campaignSchedule,
  getCampaignMap,
} from '../../src/campaign';
import { nextEventCountdown } from '../../src/gameplay-ui/next-event';
import { resolveOffers } from '../skills/helpers';

/** The director's earliest unfired event after firing everything due by `now`. */
function nextAt(mapId: number, now: number) {
  const events = campaignSchedule(getCampaignMap(mapId));
  return events.find((e) => e.time > now + 1e-9 || false) ?? null;
}

describe('Task 22 §1.1 — next-event countdown (pure)', () => {
  it('elite first: «Элита через 1:20»; seconds rounded up', () => {
    expect(nextEventCountdown({ kind: 'elite', time: 100 }, 20)).toEqual({
      kind: 'elite',
      seconds: 80,
      label: 'Элита через 1:20',
    });
    expect(nextEventCountdown({ kind: 'elite', time: 100 }, 99.2)?.label).toBe('Элита через 0:01');
    expect(nextEventCountdown({ kind: 'elite', time: 100 }, 100)?.label).toBe('Элита через 0:00');
  });
  it('boss first: «Босс через 0:45»', () => {
    expect(nextEventCountdown({ kind: 'boss', time: 600 }, 555)?.label).toBe('Босс через 0:45');
  });
  it('hidden for the end marker and when nothing is scheduled', () => {
    expect(nextEventCountdown({ kind: 'end', time: 600 }, 590)).toBeNull();
    expect(nextEventCountdown(null, 10)).toBeNull();
  });
  it('follows the real schedule: per-act intervals, 2-elite events, boss at the map duration', () => {
    for (const map of [CAMPAIGN_MAPS[0], CAMPAIGN_MAPS[19], CAMPAIGN_MAPS[39]]) {
      const events = campaignSchedule(map);
      const elites = events.filter((e) => e.kind === 'elite');
      const first = elites[0];
      // Before the first elite: the elite countdown.
      expect(nextEventCountdown(nextAt(map.id, 0), 0)?.kind).toBe(elites.length ? 'elite' : 'boss');
      if (first) expect(nextEventCountdown(first, 0)?.seconds).toBe(Math.ceil(first.time));
      // After the last elite: the boss countdown to the map duration.
      const last = elites[elites.length - 1]?.time ?? 0;
      const c = nextEventCountdown(nextAt(map.id, last + 1), last + 1);
      expect(c?.kind).toBe('boss');
      expect(c?.seconds).toBe(Math.ceil(map.durationSeconds - last - 1));
    }
    // Several elites of one event share a time: the countdown stays on that time until all fired.
    const two = CAMPAIGN_MAPS.find((m) => m.elite.perEvent >= 2);
    if (two) {
      const director = new CampaignDirector(two);
      const ev = campaignSchedule(two).filter((e) => e.kind === 'elite');
      expect(ev[0].time).toBe(ev[1].time);
      expect(nextEventCountdown(ev[1], ev[0].time)?.seconds).toBe(0);
      expect(director).toBeTruthy();
    }
  });
});

describe('Task 22 §1.1 — countdown in a run', () => {
  const run = () => {
    const w = new GameplayWorld({
      characterClass: 'warrior',
      level: 10,
      seed: 3,
      initialEnemies: false,
      spawning: { enabled: false },
      campaign: { mapId: 1, runId: 'cd' },
    });
    w.setTestProtection(true);
    return w;
  };
  const label = (w: GameplayWorld) => {
    const s = w.getSnapshot();
    return nextEventCountdown(s.campaign!.nextEvent, s.time)?.label ?? null;
  };
  it('counts down with simulation time; frozen on pause; hidden after the map end', () => {
    const w = run();
    const first = campaignSchedule(getCampaignMap(1)).find((e) => e.kind !== 'end')!;
    expect(label(w)).toBe(nextEventCountdown(first, 0)!.label);
    w.update(5);
    const at5 = label(w);
    expect(nextEventCountdown(first, 5)!.label).toBe(at5);
    w.setPaused(true);
    w.update(30);
    expect(label(w)).toBe(at5); // frozen
    w.setPaused(false);
    // Past the map duration (the boss spawned; 10:00 on map 1) nothing is scheduled any more.
    const duration = getCampaignMap(1).durationSeconds;
    for (let t = 5; t < duration + 1; t += 1) {
      resolveOffers(w); // level-up offers pause the world
      w.update(1);
    }
    expect(w.getSnapshot().campaign!.durationReached).toBe(true);
    expect(label(w)).toBeNull();
  });
});
