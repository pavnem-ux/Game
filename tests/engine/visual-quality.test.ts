import { describe, expect, it } from 'vitest';
import {
  GRAPHICS_QUALITIES,
  QUALITY_PRESETS,
  defaultQuality,
  isGraphicsQuality,
  MAX_LIGHTS,
} from '../../src/engine/visuals/quality';
import { createUiSettings, parseUiSettings } from '../../src/gameplay-ui/ui-settings';

describe('Task 18 «Качество графики»', () => {
  it('Высокое on desktop, Среднее on touch; presets scale light, particles, decor and glow', () => {
    expect(defaultQuality(false)).toBe('high');
    expect(defaultQuality(true)).toBe('medium');
    expect(GRAPHICS_QUALITIES).toEqual(['high', 'medium', 'low']);
    const [h, m, l] = GRAPHICS_QUALITIES.map((q) => QUALITY_PRESETS[q]);
    expect(h.particles).toBeGreaterThan(m.particles);
    expect(m.particles).toBeGreaterThan(l.particles);
    expect(h.decorDensity).toBeGreaterThan(l.decorDensity);
    expect(l.lightResolution).toBe(0); // cheap radial gradient instead of a light texture
    expect(l.glow).toBe(false);
    expect(MAX_LIGHTS.low).toBe(0);
    expect(MAX_LIGHTS.high).toBeGreaterThan(MAX_LIGHTS.medium);
  });
  it('persists in the settings key; invalid values fall back to the device default', () => {
    expect(isGraphicsQuality('low')).toBe(true);
    expect(isGraphicsQuality('ultra')).toBe(false);
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    createUiSettings(storage).set({ graphicsQuality: 'low' });
    expect(createUiSettings(storage).get().graphicsQuality).toBe('low');
    // Node has no matchMedia: the default is the desktop one.
    expect(parseUiSettings('{"graphicsQuality":"ultra"}').graphicsQuality).toBe('high');
    expect(parseUiSettings(null).graphicsQuality).toBe('high');
  });
});
