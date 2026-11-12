import { describe, expect, it } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import { FLOATING_LIMITS, FloatingNumbers } from '../../src/engine/game-feel';
import { effectiveDpr, pinToScreen, screenToZoomed } from '../../src/engine/screen-space';
import { GRAPHICS_QUALITIES, QUALITY_PRESETS } from '../../src/engine/visuals/quality';
import { createUiSettings } from '../../src/gameplay-ui/ui-settings';

describe('Task 16 — quality extension: DPR cap and damage-number cap', () => {
  it('Высокое ≥ Среднее ≥ Низкое for DPR and damage numbers; DPR never above 2', () => {
    const [h, m, l] = GRAPHICS_QUALITIES.map((q) => QUALITY_PRESETS[q]);
    expect([h.dprCap, m.dprCap, l.dprCap]).toEqual([2, 1.5, 1]);
    expect([h.damageNumbers, m.damageNumbers, l.damageNumbers]).toEqual([40, 24, 12]);
    expect(h.damageNumbers).toBeLessThanOrEqual(FLOATING_LIMITS.capacity);
    expect(effectiveDpr(3, 2)).toBe(2);
    expect(effectiveDpr(1.25, 1.5)).toBe(1.25);
    expect(effectiveDpr(0.5, 2)).toBe(1);
    expect(effectiveDpr(Number.NaN, 2)).toBe(1);
  });
  it('the damage-number cap limits numbers on screen without allocating', () => {
    const pool = new FloatingNumbers();
    const entries = [...pool.entries];
    pool.setLimit(QUALITY_PRESETS.low.damageNumbers);
    for (let i = 0; i < 100; i++) pool.spawn('normal', i, 0, i, 0);
    expect(pool.forEachActive(0.1, () => undefined)).toBe(12);
    expect(pool.entries.every((e, i) => e === entries[i])).toBe(true);
    pool.setLimit(40);
    for (let i = 0; i < 100; i++) pool.spawn('normal', i, 0, i, 0.2);
    expect(pool.forEachActive(0.25, () => undefined)).toBe(40);
    // Lowering the cap drops the numbers beyond it.
    pool.setLimit(5);
    expect(pool.forEachActive(0.25, () => undefined)).toBeLessThanOrEqual(5);
    expect(pool.activeLimit).toBe(5);
  });
});

describe('Task 16 — DPR rendering helpers', () => {
  it('scrollFactor-0 objects land on canvas pixels under a zoomed camera', () => {
    const cam = { zoom: 2, width: 1688, height: 780, originX: 0.5, originY: 0.5 };
    // Phaser draws a scrollFactor-0 point p at (p − origin) × zoom + origin.
    const project = (p: { x: number; y: number }) => ({
      x: (p.x - cam.width / 2) * cam.zoom + cam.width / 2,
      y: (p.y - cam.height / 2) * cam.zoom + cam.height / 2,
    });
    for (const [sx, sy] of [
      [0, 0],
      [100, 50],
      [1688, 780],
    ]) {
      const p = project(screenToZoomed(cam, sx, sy));
      expect(p.x).toBeCloseTo(sx, 9);
      expect(p.y).toBeCloseTo(sy, 9);
    }
    const obj = {
      s: 0,
      x: 0,
      y: 0,
      setScale(v: number) {
        this.s = v;
      },
      setPosition(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
    };
    pinToScreen(obj, cam, 0.5);
    expect(obj.s).toBe(0.25);
    expect(project({ x: obj.x, y: obj.y })).toEqual({ x: 0, y: 0 });
  });
});

describe('Task 16 — simulation identical across quality levels', () => {
  it('the world never reads the graphics setting: same seed ⇒ same results at every level', () => {
    const settings = createUiSettings(null);
    const run = () => {
      const w = new GameplayWorld({ characterClass: 'mage', seed: 12, campaign: { mapId: 22 } });
      w.setTestProtection(true);
      w.setMovement(-0.4, 0.8);
      for (let i = 0; i < 60 * 20; i++) {
        w.update(1 / 60);
        if (w.run.currentOffer) w.skipSkillOffer();
      }
      return JSON.stringify(w.getSnapshot());
    };
    const results = GRAPHICS_QUALITIES.map((q) => {
      settings.set({ graphicsQuality: q });
      return run();
    });
    expect(new Set(results).size).toBe(1);
  });
});
