import { describe, expect, it } from 'vitest';
import { GameplayWorld, createRunRandom } from '../../src/gameplay';
import type { GameplayOptions } from '../../src/gameplay';
import {
  distinctDotTypes,
  dotStacks,
  hpAbove,
  hpBelow,
  isMoving,
} from '../../src/talents/conditions';
import { TalentRuntime } from '../../src/talents/runtime';

function world(extra: Partial<GameplayOptions> = {}) {
  const w = new GameplayWorld({
    characterClass: 'rogue',
    level: 10,
    seed: 5,
    initialEnemies: false,
    spawning: { enabled: false },
    ...extra,
  });
  w.setTestProtection(true);
  return w;
}

describe('Task 09.1 Phase 1 shared talent infrastructure', () => {
  it('1.3 proc guard: a talent reaction can never start inside another talent proc', () => {
    let clock = 0;
    const rt = new TalentRuntime({ now: () => clock, random: () => 0.5 });
    const inner: (number | null)[] = [];
    const outer = rt.proc(() => {
      expect(rt.inProc).toBe(true);
      inner.push(rt.proc(() => 1)); // nested reaction refused
      return 2;
    });
    expect(outer).toBe(2);
    expect(inner).toEqual([null]);
    expect(rt.inProc).toBe(false);
    expect(rt.proc(() => 3)).toBe(3); // usable again afterwards
    clock = 1;
  });
  it('1.2 cooldowns and buffs run on simulation time and freeze while the world is paused', () => {
    const w = world();
    const rt = w.skills.talents;
    rt.startCooldown('test:cd', 3);
    expect(rt.ready('test:cd')).toBe(false);
    w.setPaused(true);
    w.update(10); // real time passes, simulation time does not
    expect(rt.ready('test:cd')).toBe(false);
    w.setPaused(false);
    w.update(2.9);
    expect(rt.ready('test:cd')).toBe(false);
    w.update(0.11);
    expect(rt.ready('test:cd')).toBe(true);
    expect(rt.tryCooldown('test:cd', 1)).toBe(true);
    expect(rt.tryCooldown('test:cd', 1)).toBe(false);
  });
  it('1.2 buffs refresh, never stack, and expire at a scheduled boundary', () => {
    const w = world();
    const rt = w.skills.talents;
    let changes = 0;
    const previous = rt.onBuffsChanged;
    rt.onBuffsChanged = () => {
      changes++;
      previous();
    };
    rt.setBuff('test:speed', 8, 2);
    w.update(1);
    rt.setBuff('test:speed', 8, 2); // refresh: same value, new expiry at t = 3
    expect(rt.buffValue('test:speed')).toBe(8);
    w.update(1.9);
    expect(rt.buffValue('test:speed')).toBe(8);
    w.update(0.2);
    expect(rt.buffValue('test:speed')).toBe(0);
    expect(changes).toBe(2); // appeared once, expired once (the refresh changed nothing)
  });
  it('1.4 entities act on simulation-time boundaries and are removed at expiry', () => {
    const w = world();
    const rt = w.skills.talents;
    const acts: number[] = [];
    const e = rt.spawn(
      'test-entity',
      'rogue.b2.n03',
      2.5,
      { x: 0, y: 0 },
      (self) => {
        acts.push(Math.round(w.time * 1000) / 1000);
        self.nextActionAt = w.time + 1;
      },
      0.5,
    );
    expect(e.id).toBe('test-entity-1');
    w.update(1); // a large step still resolves the action at its exact time
    w.update(2);
    expect(acts).toEqual([0.5, 1.5]); // 2.5 is the expiry, not an action
    expect(rt.list()).toEqual([]);
    expect(() => rt.spawn('x', 'rogue.b2.n03', 0, { x: 0, y: 0 })).toThrow(RangeError);
  });
  it('1.4 entities are cleaned up when the player dies and when the run ends', () => {
    const w = world();
    w.skills.talents.spawn('test-entity', 'rogue.b2.n03', 60, { x: 0, y: 0 });
    w.setTestProtection(false);
    w.setPlayerHp(0);
    w.update(0.05);
    expect(w.skills.talents.list()).toEqual([]);
    const c = world({ campaign: { mapId: 1, runId: 'cleanup' } });
    c.skills.talents.spawn('test-entity', 'rogue.b2.n03', 60, { x: 0, y: 0 });
    c.debugForceOutcome('victory');
    c.update(0.05);
    expect(c.skills.talents.list()).toEqual([]);
  });
  it('talent randomness is its own seeded stream (other streams unchanged)', () => {
    const a = createRunRandom(42);
    const b = createRunRandom(42);
    for (let i = 0; i < 100; i++) a.talents();
    expect(Array.from({ length: 20 }, a.combat)).toEqual(Array.from({ length: 20 }, b.combat));
    expect(Array.from({ length: 20 }, a.skills)).toEqual(Array.from({ length: 20 }, b.skills));
    const rt = new TalentRuntime({ now: () => 0, random: createRunRandom(7).talents });
    const rolls = Array.from({ length: 1000 }, () => rt.roll(25)).filter(Boolean).length;
    expect(rolls).toBeGreaterThan(200);
    expect(rolls).toBeLessThan(300);
    expect(rt.roll(0)).toBe(false);
    expect(rt.roll(100)).toBe(true);
  });
  it('1.1 condition helpers', () => {
    const groups: Record<string, number> = { poison: 3, bleed: 10 };
    const reader = {
      getGroup: (_t: string, type: string) =>
        groups[type] ? { stacks: Array.from({ length: groups[type] }) } : null,
    };
    expect(dotStacks(reader, 'e', 'bleed')).toBe(10);
    expect(dotStacks(reader, 'e', 'burn')).toBe(0);
    expect(distinctDotTypes(reader, 'e')).toBe(2);
    expect(hpBelow({ currentHp: 29, maxHp: 100 }, 30)).toBe(true);
    expect(hpBelow({ currentHp: 30, maxHp: 100 }, 30)).toBe(false); // strictly below
    expect(hpAbove({ currentHp: 71, maxHp: 100 }, 70)).toBe(true);
    expect(hpAbove({ currentHp: 70, maxHp: 100 }, 70)).toBe(false);
    expect(isMoving({ x: 0, y: 0 })).toBe(false);
    expect(isMoving({ x: 0, y: -1 })).toBe(true);
  });
});
