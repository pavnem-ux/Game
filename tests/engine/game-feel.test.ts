import { describe, expect, it } from 'vitest';
import {
  DODGE_TEXT,
  FLOATING_LIMITS,
  FloatingNumbers,
  HitFlashes,
  SHAKES,
  shakeFor,
} from '../../src/engine/game-feel';
import {
  DEFAULT_UI_SETTINGS,
  UI_SETTINGS_KEY,
  createUiSettings,
  parseUiSettings,
} from '../../src/gameplay-ui/ui-settings';

describe('Task 08.5 §5.1 floating damage numbers', () => {
  it('pooled and capped: entries are reused, never more than the capacity on screen', () => {
    const pool = new FloatingNumbers(4);
    const entries = [...pool.entries];
    for (let i = 0; i < 10; i++) pool.spawn('normal', i, 0, 10 + i, 1);
    expect(pool.entries).toEqual(entries); // same objects: no new allocations
    expect(pool.entries.every((e, i) => e === entries[i])).toBe(true);
    const seen: number[] = [];
    expect(pool.forEachActive(1.1, (e) => seen.push(e.value))).toBe(4);
    expect(seen.sort((a, b) => a - b)).toEqual([16, 17, 18, 19]); // newest four kept
    expect(new FloatingNumbers().capacity).toBe(FLOATING_LIMITS.capacity);
  });
  it('crits are styled differently and live longer; numbers expire after their life', () => {
    const pool = new FloatingNumbers();
    const crit = pool.spawn('crit', 0, 0, 183.4, 2);
    const hit = pool.spawn('normal', 0, 0, 92, 2);
    const own = pool.spawn('player', 0, 0, 7, 2);
    const dodge = pool.spawn('dodge', 0, 0, 0, 2);
    expect([crit.text, hit.text, own.text, dodge.text]).toEqual(['183!', '92', '−7', DODGE_TEXT]);
    expect(crit.life).toBeGreaterThan(hit.life);
    const at = (t: number) => {
      const kinds: string[] = [];
      pool.forEachActive(t, (e, p) => {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(1);
        kinds.push(e.kind);
      });
      return kinds.sort();
    };
    expect(at(2.5)).toEqual(['crit', 'dodge', 'normal', 'player']);
    expect(at(2 + FLOATING_LIMITS.life.normal + 0.01)).toEqual(['crit', 'player']);
    expect(at(10)).toEqual([]);
  });
  it('drift spreads stacked numbers deterministically (no random source)', () => {
    const a = new FloatingNumbers(8);
    const b = new FloatingNumbers(8);
    const da = Array.from({ length: 8 }, () => a.spawn('normal', 0, 0, 1, 0).drift);
    const db = Array.from({ length: 8 }, () => b.spawn('normal', 0, 0, 1, 0).drift);
    expect(da).toEqual(db);
    expect(new Set(da).size).toBe(8);
    for (const d of da) expect(Math.abs(d)).toBeLessThanOrEqual(10);
  });
});

describe('Task 08.5 §5.2 hit flash', () => {
  it('fades from 1 to 0 over its duration and forgets expired targets', () => {
    const f = new HitFlashes(0.1);
    f.hit('enemy-1', 5);
    expect(f.strength('enemy-1', 5)).toBeCloseTo(1, 9);
    expect(f.strength('enemy-1', 5.05)).toBeCloseTo(0.5);
    expect(f.strength('enemy-1', 5.2)).toBe(0);
    expect(f.strength('enemy-2', 5)).toBe(0);
  });
});

describe('Task 08.5 §5.3 screen shake', () => {
  it('player direct hits and boss heavy attacks shake; other events do not', () => {
    expect(shakeFor({ type: 'damage', targetId: 'player', appliedDamage: 3 })).toBe(
      SHAKES.playerHit,
    );
    expect(shakeFor({ type: 'damage', targetId: 'player', appliedDamage: 0 })).toBeNull();
    expect(shakeFor({ type: 'periodic-damage', targetId: 'player', appliedDamage: 2 })).toBeNull();
    expect(shakeFor({ type: 'damage', targetId: 'enemy-1', appliedDamage: 50 })).toBeNull();
    for (const kind of ['circle_aoe', 'charge'])
      expect(shakeFor({ type: 'boss-ability-executed', kind })).toBe(SHAKES.bossHeavy);
    for (const kind of ['radial_burst', 'summon', 'speed_buff'])
      expect(shakeFor({ type: 'boss-ability-executed', kind })).toBeNull();
    expect(shakeFor({ type: 'boss-cast-started', kind: 'charge' })).toBeNull();
  });
  it('«Тряска экрана» is on by default and saved in its own key (never the save)', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    const s = createUiSettings(storage);
    expect(s.get()).toEqual(DEFAULT_UI_SETTINGS);
    expect(s.get().screenShake).toBe(true);
    expect(s.set({ screenShake: false })).toBe(true);
    expect([...data.keys()]).toEqual([UI_SETTINGS_KEY]);
    expect(createUiSettings(storage).get().screenShake).toBe(false);
    for (const raw of [null, '', '{bad', '[]', '{"screenShake":"no"}'])
      expect(parseUiSettings(raw)).toEqual(DEFAULT_UI_SETTINGS);
    const broken = createUiSettings({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(broken.get()).toEqual(DEFAULT_UI_SETTINGS);
    expect(broken.set({ screenShake: false })).toBe(false);
    expect(broken.get().screenShake).toBe(false); // kept for the session
  });
});
