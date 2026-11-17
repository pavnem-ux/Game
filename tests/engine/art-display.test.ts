import { describe, expect, it } from 'vitest';
import {
  ART_BODY_WIDTH_PER_RADIUS,
  ART_DISPLAY,
  ENEMY_FACING_THRESHOLD,
  PLAYER_FACING_THRESHOLD,
  artLayout,
  artTuning,
  coinPileRadius,
  flipSign,
  loadingBarRects,
  nextFacing,
  PICKUP_SIZE_PER_RADIUS,
  pickupArtSize,
  visibleBounds,
} from '../../src/engine/visuals/art-display';
import type { Facing } from '../../src/engine/visuals/art-display';
import { pinToScreen } from '../../src/engine/screen-space';
import { XP_RULES } from '../../src/gameplay';
import { CHEST_RULES } from '../../src/gameplay/chests';
import type { CameraLike } from '../../src/engine/screen-space';

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

describe('Task 25 review — the loading bar stays on screen under the DPR camera zoom', () => {
  /** Canvas-pixel y of a local y on a scrollFactor-0 object (Phaser zooms around the origin). */
  const toCanvas = (cam: CameraLike, pos: number, scale: number, local: number) =>
    (pos + local * scale - cam.height * cam.originY) * cam.zoom + cam.height * cam.originY;
  for (const dpr of [1, 1.5, 2]) {
    it(`DPR ${dpr}: pinned bar is inside the canvas, 14 CSS px above the bottom`, () => {
      const cam: CameraLike = {
        zoom: dpr,
        width: 1280 * dpr,
        height: 720 * dpr,
        originX: 0.5,
        originY: 0.5,
      };
      const { track, fill } = loadingBarRects(cam.width, cam.height, cam.zoom, 0.5);
      const pinned = { x: 0, y: 0, s: 1 };
      pinToScreen(
        {
          setScale: (s: number) => (pinned.s = s),
          setPosition: (x: number, y: number) => Object.assign(pinned, { x, y }),
        },
        cam,
      );
      const top = toCanvas(cam, pinned.y, pinned.s, track.y);
      const bottom = toCanvas(cam, pinned.y, pinned.s, track.y + track.height);
      expect(top).toBeGreaterThan(0);
      expect(bottom).toBeLessThanOrEqual(cam.height);
      expect(toCanvas(cam, pinned.y, pinned.s, fill.y)).toBeCloseTo(cam.height - 14 * dpr, 6);
      // The pre-fix drawing (scrollFactor 0 only, no pin): pushed below the canvas at DPR > 1.
      if (dpr > 1) expect(toCanvas(cam, 0, 1, track.y)).toBeGreaterThan(cam.height);
    });
  }
  it('looks the same at any DPR (CSS size × zoom), capped at 40% of the canvas width', () => {
    const a = loadingBarRects(1280, 720, 1, 1).fill;
    const b = loadingBarRects(2560, 1440, 2, 1).fill;
    expect([b.width, b.height]).toEqual([a.width * 2, a.height * 2]);
    expect(loadingBarRects(600, 400, 1, 1).fill.width).toBe(240);
    expect(loadingBarRects(1280, 720, 1, 0).fill.width).toBe(4); // a visible stub at 0%
  });
});

describe('Task 26 — pickup art sizes from the pickup radii', () => {
  it('crystal 3.6 × crystal radius, chest 2.4 × chest radius (config table)', () => {
    expect(PICKUP_SIZE_PER_RADIUS).toEqual({ crystal: 3.6, coin: 2.2, chest: 2.4 });
    expect(pickupArtSize('crystal', XP_RULES.crystalRadius)).toBeCloseTo(18, 9);
    expect(pickupArtSize('chest', CHEST_RULES.radius)).toBeCloseTo(38.4, 9);
  });
  it('coin piles keep the Task 11 value scaling (4 → 9, growing, capped)', () => {
    const values = [1, 3, 7, 15, 31, 63, 1000];
    const radii = values.map(coinPileRadius);
    expect(radii[0]).toBeCloseTo(5, 9);
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeGreaterThanOrEqual(radii[i - 1]);
    expect(Math.max(...radii)).toBe(9);
    expect(pickupArtSize('coin', coinPileRadius(1))).toBeCloseTo(11, 9);
  });
});
