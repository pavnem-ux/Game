import { describe, expect, it } from 'vitest';
import type { WorldEvent } from '../../src/gameplay';
import { bannerFor } from '../../src/gameplay-ui/SynergyBanners';

const ev = (event: object, channel = 'skill'): WorldEvent =>
  ({ sequence: 5, time: 1, channel, event }) as unknown as WorldEvent;

describe('Task 15 synergy banners', () => {
  it('unlock → I; level-up II; level-up III is the gold awakening banner', () => {
    expect(bannerFor(ev({ type: 'synergy-unlocked', synergyId: 'wildfire' }))).toMatchObject({
      level: 1,
      title: '✦ Synergy unlocked: Wildfire · I',
    });
    expect(
      bannerFor(ev({ type: 'synergy-level-up', synergyId: 'wildfire', level: 2 })),
    ).toMatchObject({
      level: 2,
      title: '▲ Wildfire · level II',
      detail: 'Burn damage 4.5 per tick.',
    });
    const three = bannerFor(ev({ type: 'synergy-level-up', synergyId: 'wildfire', level: 3 }))!;
    expect(three.level).toBe(3);
    expect(three.title).toBe('✦ Awakening: Wildfire · III');
    expect(three.detail).toContain('“Firestorm”');
    expect(bannerFor(ev({ type: 'synergy-triggered', synergyId: 'wildfire' }))).toBeNull();
    expect(bannerFor(ev({ type: 'synergy-unlocked', synergyId: 'wildfire' }, 'combat'))).toBeNull();
  });
});
