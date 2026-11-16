import { describe, expect, it } from 'vitest';
import {
  ART_BODY_WIDTH_PER_RADIUS,
  ART_DISPLAY,
  ENEMY_FACING_THRESHOLD,
  PLAYER_FACING_THRESHOLD,
  artLayout,
  artTuning,
  flipSign,
  nextFacing,
  visibleBounds,
} from '../../src/engine/visuals/art-display';
import type { Facing } from '../../src/engine/visuals/art-display';

/** Task 25 Phase 2: size, anchor and facing of owner art (pure presentation maths). */
function rgba(width: number, height: number, opaque: (x: number, y: number) => boolean) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data[(y * width + x) * 4 + 3] = opaque(x, y) ? 255 : 0;
  return data;
}

describe('Task 25 — visible body bounds', () => {
  it('finds the opaque box and ignores faint pixels', () => {
    const data = rgba(10, 8, (x, y) => x >= 3 && x <= 6 && y >= 2 && y <= 7);
    data[(0 * 10 + 0) * 4 + 3] = 10; // below the threshold: not part of the body
    expect(visibleBounds(data, 10, 8)).toEqual({
      width: 10,
      height: 8,
      left: 3,
      right: 6,
      top: 2,
      bottom: 7,
    });
  });
  it('a fully transparent image falls back to the whole image', () => {
    expect(
      visibleBounds(
        rgba(4, 4, () => false),
        4,
        4,
      ),
    ).toEqual({
      width: 4,
      height: 4,
      left: 0,
      right: 3,
      top: 0,
      bottom: 3,
    });
  });
});

describe('Task 25 — size and anchor', () => {
  const bounds = { width: 256, height: 256, left: 78, right: 177, top: 40, bottom: 255 };
  it('visible width = 2.4 × radius; feet at the bottom of the body; centred on the body', () => {
    for (const radius of [11, 13, 14, 15, 22, 30]) {
      const l = artLayout(bounds, radius, artTuning('enemy_melee'));
      expect(l.scale * (bounds.right - bounds.left + 1)).toBeCloseTo(
        ART_BODY_WIDTH_PER_RADIUS * radius,
        9,
      );
      expect(l.originY).toBe(1); // bottom row of the image is the feet
      expect(l.originX).toBeCloseTo((78 + 178) / 2 / 256, 12);
      expect(l.height).toBeCloseTo(216 * l.scale, 9);
    }
    expect(ART_BODY_WIDTH_PER_RADIUS).toBe(2.4);
  });
  it('the tuning scale multiplies the radius rule', () => {
    const base = artLayout(bounds, 14, artTuning('enemy_melee'));
    const big = artLayout(bounds, 14, { scale: 1.25, facesLeft: false, flip: true });
    expect(big.scale / base.scale).toBeCloseTo(1.25, 12);
    expect(big.originX).toBe(base.originX);
  });
  it('one tuning table: thief faces left, nest never flips, everything else defaults', () => {
    expect(Object.keys(ART_DISPLAY).sort()).toEqual(['enemy_treasure_thief', 'nest_blight']);
    expect(artTuning('enemy_treasure_thief')).toEqual({ scale: 1, facesLeft: true, flip: true });
    expect(artTuning('nest_blight')).toEqual({ scale: 1, facesLeft: false, flip: false });
    expect(artTuning('player_mage')).toEqual({ scale: 1, facesLeft: false, flip: true });
  });
});

describe('Task 25 — facing without jitter', () => {
  it('turns only when |dx| exceeds the threshold; small wobbles keep the facing', () => {
    let f: Facing = 1;
    const seq = [0, 3, -5, -8, -8.01, -2, 4, 7.9, 8.5, -1];
    const out = seq.map((dx) => (f = nextFacing(f, dx, ENEMY_FACING_THRESHOLD)));
    expect(out).toEqual([1, 1, 1, 1, -1, -1, -1, -1, 1, 1]);
  });
  it('an enemy hovering around the player x never flickers', () => {
    let f: Facing = -1;
    let flips = 0;
    for (let i = 0; i < 200; i++) {
      const next = nextFacing(f, Math.sin(i) * 6, ENEMY_FACING_THRESHOLD);
      if (next !== f) flips++;
      f = next;
    }
    expect(flips).toBe(0);
  });
  it('the player follows the movement input (dead zone on a near-vertical stick)', () => {
    expect(nextFacing(1, -1, PLAYER_FACING_THRESHOLD)).toBe(-1);
    expect(nextFacing(-1, 0.1, PLAYER_FACING_THRESHOLD)).toBe(-1);
    expect(nextFacing(-1, 0, PLAYER_FACING_THRESHOLD)).toBe(-1); // standing still keeps facing
    expect(nextFacing(-1, 0.7, PLAYER_FACING_THRESHOLD)).toBe(1);
  });
  it('mirror sign: right-facing art mirrors to face left; left-facing art the opposite', () => {
    const right = artTuning('enemy_melee');
    const thief = artTuning('enemy_treasure_thief');
    const nest = artTuning('nest_blight');
    expect([flipSign(1, right), flipSign(-1, right)]).toEqual([1, -1]);
    expect([flipSign(1, thief), flipSign(-1, thief)]).toEqual([-1, 1]);
    expect([flipSign(1, nest), flipSign(-1, nest)]).toEqual([1, 1]);
  });
});
