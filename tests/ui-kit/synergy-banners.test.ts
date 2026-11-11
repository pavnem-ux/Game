import { describe, expect, it } from 'vitest';
import type { WorldEvent } from '../../src/gameplay';
import { bannerFor } from '../../src/gameplay-ui/SynergyBanners';

const ev = (event: object, channel = 'skill'): WorldEvent =>
  ({ sequence: 5, time: 1, channel, event }) as unknown as WorldEvent;

describe('Task 15 synergy banners', () => {
  it('unlock → I; level-up II; level-up III is the gold awakening banner', () => {
    expect(bannerFor(ev({ type: 'synergy-unlocked', synergyId: 'wildfire' }))).toMatchObject({
      level: 1,
      title: '✦ Синергия открыта: Лесной пожар · I',
    });
    expect(
      bannerFor(ev({ type: 'synergy-level-up', synergyId: 'wildfire', level: 2 })),
    ).toMatchObject({
      level: 2,
      title: '▲ Лесной пожар · уровень II',
      detail: 'Урон Burn 4.5 за тик.',
    });
    const three = bannerFor(ev({ type: 'synergy-level-up', synergyId: 'wildfire', level: 3 }))!;
    expect(three.level).toBe(3);
    expect(three.title).toBe('✦ Пробуждение: Лесной пожар · III');
    expect(three.detail).toContain('«Огненная буря»');
    expect(bannerFor(ev({ type: 'synergy-triggered', synergyId: 'wildfire' }))).toBeNull();
    expect(bannerFor(ev({ type: 'synergy-unlocked', synergyId: 'wildfire' }, 'combat'))).toBeNull();
  });
});
