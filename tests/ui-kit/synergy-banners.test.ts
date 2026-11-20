import { describe, expect, it } from 'vitest';
import type { WorldEvent } from '../../src/gameplay';
import {
  SHOW_MS,
  VISIBLE,
  bannerFor,
  holdBanners,
  pushBanners,
  tickBanners,
} from '../../src/gameplay-ui/SynergyBanners';

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

describe('Task 37 — compact synergy toasts', () => {
  const banner = (key: number) =>
    bannerFor(
      ev({
        type: 'synergy-unlocked',
        synergyId: 'wildfire',
        pair: ['fireball', 'inferno'],
      }),
    ) && { ...bannerFor(ev({ type: 'synergy-unlocked', synergyId: 'wildfire' }))!, key };
  it('carries the pair (two small skill icons)', () => {
    expect(
      bannerFor(
        ev({ type: 'synergy-unlocked', synergyId: 'wildfire', pair: ['fireball', 'inferno'] }),
      )?.pair,
    ).toEqual(['fireball', 'inferno']);
    expect(
      bannerFor(ev({ type: 'synergy-level-up', synergyId: 'wildfire', level: 2, pair: ['a', 'b'] }))
        ?.pair,
    ).toEqual(['a', 'b']);
    expect(bannerFor(ev({ type: 'synergy-unlocked', synergyId: 'wildfire' }))?.pair).toBeNull();
  });
  it('at most 2 visible; each ~2.5 s; the rest wait their turn (nothing dropped)', () => {
    expect([VISIBLE, SHOW_MS]).toEqual([2, 2500]);
    let q = pushBanners(
      [],
      [1, 2, 3, 4, 5].map((k) => banner(k)!),
    );
    const shown = () => q.filter((b) => b.shownAt !== null).map((b) => b.key);
    q = tickBanners(q, 0);
    expect(shown()).toEqual([1, 2]);
    q = tickBanners(q, 2499);
    expect(shown()).toEqual([1, 2]);
    q = tickBanners(q, 2500);
    expect(shown()).toEqual([3, 4]);
    q = tickBanners(q, 5000);
    expect(shown()).toEqual([5]);
    q = tickBanners(q, 7500);
    expect(q).toEqual([]);
  });
  it('a banner arriving while one shows joins at once (still ≤ 2); a pause restarts the clocks', () => {
    let q = tickBanners(pushBanners([], [banner(1)!]), 0);
    q = tickBanners(pushBanners(q, [banner(2)!, banner(3)!]), 1000);
    expect(q.filter((b) => b.shownAt !== null).map((b) => [b.key, b.shownAt])).toEqual([
      [1, 0],
      [2, 1000],
    ]);
    q = holdBanners(q, 9000); // play resumed after a long pause
    q = tickBanners(q, 9100);
    expect(q.filter((b) => b.shownAt !== null).map((b) => b.key)).toEqual([1, 2]);
  });
});
