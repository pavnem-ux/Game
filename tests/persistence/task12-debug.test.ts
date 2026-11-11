import { describe, expect, it } from 'vitest';
import type { GameplayOptions, GameplayWorld } from '../../src/gameplay';
import { createTestingController, createTestingWorld } from '../../src/gameplay/testing';
import { QaGameplayWorld } from '../../src/gameplay/qa';
import { levelMarks } from '../../src/gameplay-ui/DebugOverlay';
import { chestPopupText } from '../../src/gameplay-ui/CampaignHud';
import { buildBugReport } from '../../src/gameplay-ui/bug-report';
import { resolveOffers } from '../skills/helpers';

const options: GameplayOptions = {
  characterClass: 'mage',
  seed: 3,
  initialEnemies: false,
  onHit: [],
  spawning: { enabled: false },
  campaign: { mapId: 6 },
};
function controller() {
  let world: GameplayWorld | null = createTestingWorld(options);
  const control = createTestingController(
    () => world,
    (o) => {
      world = createTestingWorld(o);
    },
  );
  return { control, world: () => world! };
}

describe('Task 12 §1.5 — debug tools (DEV/QA controller)', () => {
  it('spawns N enemies of a given kind; chests of a given type/content; any buff', () => {
    const { control, world } = controller();
    control({ type: 'spawn-n', kind: 'brute', count: 3, distance: 600 });
    expect(
      world()
        .getSnapshot()
        .enemies.map((e) => e.kind),
    ).toEqual(['brute', 'brute', 'brute']);
    expect(() => control({ type: 'spawn-n', kind: 'brute', count: 0, distance: 600 })).toThrow();
    expect(() => control({ type: 'spawn-n', kind: 'dragon', count: 1, distance: 600 })).toThrow();
    control({ type: 'chest', chestType: 'enchanted', content: 'fury' });
    expect(
      world()
        .getSnapshot()
        .chests!.items.map((c) => c.type),
    ).toEqual(['enchanted']);
    control({ type: 'buff', buff: 'lightStep' });
    expect(
      world()
        .getSnapshot()
        .chests!.buffs.map((b) => b.id),
    ).toEqual(['lightStep']);
    expect(() => control({ type: 'buff', buff: 'nope' })).toThrow();
  });
  it('auto-collect pulls every crystal and coin once per second (off by default; QA snapshot shows it)', () => {
    const { control, world } = controller();
    const w = world() as QaGameplayWorld;
    expect(w.qaSnapshot().autoCollect).toBe(false);
    w.dropTestCrystal(7, 900);
    w.update(1.5);
    expect(w.getSnapshot().progression.totalXp).toBe(0);
    control({ type: 'auto-collect', enabled: true });
    expect(w.qaSnapshot().autoCollect).toBe(true);
    w.update(0.5); // not a full second yet
    expect(w.getSnapshot().progression.totalXp).toBe(0);
    w.update(0.6);
    expect(w.getSnapshot().progression.totalXp).toBe(7);
    expect(w.getSnapshot().crystals).toEqual([]);
    control({ type: 'auto-collect', enabled: false });
    w.dropTestCrystal(5, 900);
    w.update(2);
    expect(w.getSnapshot().progression.totalXp).toBe(7);
  });
  it('run-level timeline overlay: level reached by 5:00 / 10:00 / 15:00', () => {
    const { control, world } = controller();
    control({ type: 'auto-collect', enabled: true });
    const w = world();
    expect(levelMarks(w.getSnapshot())).toBe('— / — / —');
    for (let i = 0; i < 310; i++) {
      if (i % 20 === 0) w.dropTestCrystal(40, 900);
      resolveOffers(w);
      w.update(1);
    }
    const s = w.getSnapshot();
    const at300 = [...s.runStats.levelTimeline].filter((t) => t.time <= 300).at(-1)!.level;
    expect(at300).toBeGreaterThan(1);
    expect(levelMarks(s)).toBe(`${at300} / — / —`);
  });
});

describe('Task 12 — popups and bug report', () => {
  it('pickup popup texts (Russian)', () => {
    expect(chestPopupText('heal', 12)).toBe('+15% HP');
    expect(chestPopupText('gold', 9)).toBe('+9 золота');
    expect(chestPopupText('magnet', 40)).toBe('Магнит: всё собрано');
    expect(chestPopupText('fury', 0)).toBe('Ярость: Урон +20%');
    expect(chestPopupText('haste', 0)).toBe('Быстрые руки: Скорость атаки +25%');
    expect(chestPopupText('lightStep', 0)).toBe('Лёгкий шаг: Скорость движения +20%');
  });
  it('bug reports include the active buffs', () => {
    const { control, world } = controller();
    control({ type: 'buff', buff: 'haste' });
    world().update(2);
    const report = buildBugReport({
      createdAt: '2026-11-11T10:00:00.000Z',
      build: { version: '0', commit: 'x', label: 'x' },
      userAgent: 'test',
      world: world().getSnapshot(),
      screen: 'playing',
      profile: null,
      errors: [],
    });
    expect(report.run!.activeBuffs).toEqual([{ id: 'haste', name: 'Быстрые руки', remaining: 18 }]);
  });
});
