import { describe, expect, it } from 'vitest';
import { ART_BODY_WIDTH_PER_RADIUS } from '../../src/engine/visuals/art-display';
import { SUMMON_DISPLAY, ballistaPose, shadowCopyAlpha } from '../../src/engine/visuals/summons';

/** Task 34: ballista / shadow copy presentation (pure; rendering only). */
const pose = () => ({ scale: 1, alpha: 1, recoil: 0 });
const B = SUMMON_DISPLAY.ballista;

describe('Task 34 — ballista pose', () => {
  it('visible width = 2.4 × its display radius (one config value)', () => {
    expect(ART_BODY_WIDTH_PER_RADIUS * B.radius).toBeCloseTo(52.8, 9);
  });
  it('pops in (overshoot), then stays at full size', () => {
    expect(ballistaPose(0, 20, Infinity, pose()).scale).toBe(0);
    expect(ballistaPose(B.popIn / 2, 20, Infinity, pose()).scale).toBeGreaterThan(0.5);
    expect(ballistaPose(B.popIn * 0.75, 20, Infinity, pose()).scale).toBeGreaterThan(0.75);
    expect(ballistaPose(B.popIn, 20, Infinity, pose())).toEqual({ scale: 1, alpha: 1, recoil: 0 });
  });
  it('fades out before it expires', () => {
    expect(ballistaPose(5, B.fadeOut / 2, Infinity, pose()).alpha).toBeCloseTo(0.5, 9);
    expect(ballistaPose(5, 0, Infinity, pose()).alpha).toBe(0);
  });
  it('recoils ~4 px back on a shot, home within ~100 ms', () => {
    expect(ballistaPose(5, 10, 0, pose()).recoil).toBe(B.recoil);
    expect(B.recoil).toBe(4);
    expect(B.recoilTime).toBeCloseTo(0.1, 9);
    expect(ballistaPose(5, 10, B.recoilTime / 2, pose()).recoil).toBeCloseTo(2, 9);
    expect(ballistaPose(5, 10, B.recoilTime, pose()).recoil).toBe(0);
    expect(ballistaPose(5, 10, Infinity, pose()).recoil).toBe(0);
  });
});

describe('Task 34 — shadow copy', () => {
  it('~55 % opacity, fading in on spawn and out before expiry', () => {
    const c = SUMMON_DISPLAY.shadowCopy;
    expect(c.alpha).toBeCloseTo(0.55, 9);
    expect(shadowCopyAlpha(5, 5)).toBeCloseTo(0.55, 9);
    expect(shadowCopyAlpha(0, 5)).toBe(0);
    expect(shadowCopyAlpha(c.fadeIn / 2, 5)).toBeCloseTo(0.275, 9);
    expect(shadowCopyAlpha(5, c.fadeOut / 2)).toBeCloseTo(0.275, 9);
    expect(shadowCopyAlpha(5, 0)).toBe(0);
  });
});
