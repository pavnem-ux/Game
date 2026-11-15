import { describe, expect, it } from 'vitest';
import { TEXTURE_KEYS, activityTextureKey } from '../../src/engine/visuals/keys';
import { cuesForEvent } from '../../src/audio/mapping';
import { SOUND_CUES } from '../../src/audio/cues';
import type { WorldEvent } from '../../src/gameplay';
import { ACTIVITY_TYPES } from '../../src/gameplay/activities';

const ctx = { playerId: 'player', eliteIds: new Set<string>(), bossId: null };
const entry = (event: object): WorldEvent =>
  ({ sequence: 1, time: 1, channel: 'activities', event }) as unknown as WorldEvent;
const activity = { id: 'activity-1', type: 'shrine' };

describe('Task 24 Phase 5 — activity visuals and sounds', () => {
  it('every activity has a baked texture; the lantern has a lit variant', () => {
    for (const t of ACTIVITY_TYPES) expect(TEXTURE_KEYS).toContain(activityTextureKey(t));
    expect(activityTextureKey('lantern', true)).toBe('activity-lantern-lit');
    expect(activityTextureKey('shrine', true)).toBe('activity-shrine');
  });
  it('spawn, success and failure (incl. fade) play their own cues; progress events are silent', () => {
    expect(cuesForEvent(entry({ type: 'activity-spawned', activity }), ctx)).toEqual([
      'activity-spawn',
    ]);
    expect(cuesForEvent(entry({ type: 'activity-completed', activity }), ctx)).toEqual([
      'activity-complete',
    ]);
    expect(
      cuesForEvent(entry({ type: 'activity-failed', activity, reason: 'escaped' }), ctx),
    ).toEqual(['activity-fail']);
    expect(cuesForEvent(entry({ type: 'activity-faded', activity }), ctx)).toEqual([
      'activity-fail',
    ]);
    expect(cuesForEvent(entry({ type: 'activity-started', activity }), ctx)).toEqual([]);
    for (const c of ['activity-spawn', 'activity-complete', 'activity-fail'] as const)
      expect(SOUND_CUES).toContain(c);
  });
});
