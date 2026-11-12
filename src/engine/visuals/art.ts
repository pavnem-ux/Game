import { ART_SCALE, TEXTURE_KEYS, textureSize } from './keys';
import type { TextureKey } from './keys';

/**
 * Task 18 original procedural art (no image files). Each look is drawn once with a `Pen` (the subset
 * of Phaser.GameObjects.Graphics used here) into a texture at boot. Base colours keep the alpha
 * palette; every unit has a dark outline for readability. Pure: tests draw on a recording pen.
 */
export interface Pen {
  fillStyle(color: number, alpha?: number): Pen;
  lineStyle(width: number, color: number, alpha?: number): Pen;
  fillCircle(x: number, y: number, r: number): Pen;
  strokeCircle(x: number, y: number, r: number): Pen;
  fillEllipse(x: number, y: number, w: number, h: number): Pen;
  strokeEllipse(x: number, y: number, w: number, h: number): Pen;
  fillTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): Pen;
  strokeTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): Pen;
  fillRect(x: number, y: number, w: number, h: number): Pen;
  fillRoundedRect(x: number, y: number, w: number, h: number, r: number): Pen;
  strokeRoundedRect(x: number, y: number, w: number, h: number, r: number): Pen;
  lineBetween(x1: number, y1: number, x2: number, y2: number): Pen;
  fillPoints(points: { x: number; y: number }[], close?: boolean): Pen;
  strokePoints(points: { x: number; y: number }[], close?: boolean): Pen;
}
const OUTLINE = 0x0b1210;
const EYE_BAND = 0x18231f;
type Draw = (p: Pen, c: number) => void;

/** Unit-space helper: (x, y) in alpha units around the centre, scaled by ART_SCALE. */
const u = (c: number) => (v: number) => c + v * ART_SCALE;
const pts = (c: number, list: readonly (readonly [number, number])[]) =>
  list.map(([x, y]) => ({ x: c + x * ART_SCALE, y: c + y * ART_SCALE }));
/** Filled polygon with a dark outline drawn first (outline width in unit px). */
function poly(
  p: Pen,
  c: number,
  color: number,
  list: readonly (readonly [number, number])[],
  o = 2,
) {
  const points = pts(c, list);
  p.lineStyle(o * 2 * ART_SCALE, OUTLINE, 0.9).strokePoints(points, true);
  p.fillStyle(color).fillPoints(points, true);
}
function blob(p: Pen, c: number, color: number, w: number, h: number, dy = 0, o = 2) {
  const s = u(c);
  p.lineStyle(o * 2 * ART_SCALE, OUTLINE, 0.9).strokeEllipse(
    s(0),
    s(dy),
    w * ART_SCALE,
    h * ART_SCALE,
  );
  p.fillStyle(color).fillEllipse(s(0), s(dy), w * ART_SCALE, h * ART_SCALE);
}
function eyes(p: Pen, c: number, color: number, dy = -3, w = 18, band = true) {
  const s = u(c);
  if (band) p.fillStyle(EYE_BAND).fillEllipse(s(0), s(dy), w * ART_SCALE, 11 * ART_SCALE);
  p.fillStyle(color)
    .fillRect(s(-6), s(dy - 3), 4 * ART_SCALE, 3 * ART_SCALE)
    .fillRect(s(3), s(dy - 3), 4 * ART_SCALE, 3 * ART_SCALE);
}
/** Player: robe silhouette per class, hood/head, glowing eyes, class weapon. */
function player(color: number, extra: Draw): Draw {
  return (p, c) => {
    const s = u(c);
    extra(p, c);
    poly(p, c, color, [
      [0, -13],
      [-15, 17],
      [15, 17],
    ]);
    p.fillStyle(0x203b38).fillCircle(s(0), s(-7), 10 * ART_SCALE);
    p.lineStyle(2 * ART_SCALE, OUTLINE, 0.8).strokeCircle(s(0), s(-7), 10 * ART_SCALE);
    p.fillStyle(0xe6ffe3)
      .fillRect(s(-6), s(-9), 4 * ART_SCALE, 3 * ART_SCALE)
      .fillRect(s(3), s(-9), 4 * ART_SCALE, 3 * ART_SCALE);
  };
}
const line = (p: Pen, c: number, w: number, color: number, a: [number, number, number, number]) => {
  const s = u(c);
  p.lineStyle((w + 2) * ART_SCALE, OUTLINE, 0.85).lineBetween(s(a[0]), s(a[1]), s(a[2]), s(a[3]));
  p.lineStyle(w * ART_SCALE, color).lineBetween(s(a[0]), s(a[1]), s(a[2]), s(a[3]));
};

export const ART: Readonly<Record<TextureKey, Draw>> = Object.freeze({
  // Warrior: broad pauldrons, sword and a round shield.
  'player-warrior': player(0xe8b16c, (p, c) => {
    const s = u(c);
    line(p, c, 3, 0xd9dde0, [15, 8, 27, -19]);
    line(p, c, 3, 0xe8b16c, [12, 2, 22, 4]);
    p.fillStyle(0x8a5a2b).fillCircle(s(-16), s(6), 8 * ART_SCALE);
    p.lineStyle(2 * ART_SCALE, OUTLINE, 0.9).strokeCircle(s(-16), s(6), 8 * ART_SCALE);
    p.fillStyle(0xe8b16c).fillCircle(s(-16), s(6), 3 * ART_SCALE);
  }),
  // Mage: pointed hat brim, staff with a glowing orb.
  'player-mage': player(0x91d7e7, (p, c) => {
    const s = u(c);
    line(p, c, 3, 0x7a5a3a, [19, 13, 19, -24]);
    p.fillStyle(0xd8f6ff, 0.35).fillCircle(s(19), s(-27), 10 * ART_SCALE);
    p.fillStyle(0x91d7e7).fillCircle(s(19), s(-27), 6 * ART_SCALE);
    p.fillStyle(0xffffff).fillCircle(s(17.5), s(-28.5), 2 * ART_SCALE);
    poly(p, c, 0x5b8fa0, [
      [0, -30],
      [-9, -14],
      [9, -14],
    ]);
  }),
  // Archer: hood point and a drawn bow.
  'player-archer': player(0xb2d58a, (p, c) => {
    const s = u(c);
    const bow: [number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      const a = -1.3 + (2.6 * i) / 10;
      bow.push([16 + Math.cos(a) * 20, Math.sin(a) * 20]);
    }
    p.lineStyle(5 * ART_SCALE, OUTLINE, 0.85).strokePoints(pts(c, bow), false);
    p.lineStyle(3 * ART_SCALE, 0x8a6a3e).strokePoints(pts(c, bow), false);
    p.lineStyle(1 * ART_SCALE, 0xe8e4c8, 0.9).lineBetween(
      s(16 + Math.cos(-1.3) * 20),
      s(Math.sin(-1.3) * 20),
      s(16 + Math.cos(1.3) * 20),
      s(Math.sin(1.3) * 20),
    );
  }),
  // Rogue: twin daggers and a narrow hood.
  'player-rogue': player(0xc6a2ef, (p, c) => {
    line(p, c, 3, 0xd9dde0, [-17, 7, -25, -7]);
    line(p, c, 3, 0xd9dde0, [17, 7, 25, -7]);
  }),
  // Normal enemies (base colours kept): rounded ghoul, hooded caster, imp, troll, bombardier.
  'enemy-melee': (p, c) => {
    const s = u(c);
    poly(p, c, 0x6f8059, [
      [-12, -12],
      [-7, -20],
      [-4, -13],
    ]);
    poly(p, c, 0x6f8059, [
      [12, -12],
      [7, -20],
      [4, -13],
    ]);
    blob(p, c, 0x87996e, 30, 33);
    p.fillStyle(0x9fb184, 0.6).fillEllipse(s(-4), s(-8), 12 * ART_SCALE, 7 * ART_SCALE);
    eyes(p, c, 0xe9d497);
  },
  'enemy-ranged': (p, c) => {
    poly(p, c, 0xb2739b, [
      [0, -18],
      [-17, 14],
      [17, 14],
    ]);
    eyes(p, c, 0xffbebf, 0);
  },
  'enemy-swift': (p, c) => {
    poly(p, c, 0xc94f3d, [
      [-12, -4],
      [-4, -15],
      [-3, -4],
    ]);
    poly(p, c, 0xc94f3d, [
      [12, -4],
      [4, -15],
      [3, -4],
    ]);
    poly(p, c, 0xc94f3d, [
      [0, -17],
      [-12, 13],
      [12, 13],
    ]);
    eyes(p, c, 0xfff07a, 1, 16);
  },
  'enemy-brute': (p, c) => {
    const s = u(c);
    p.lineStyle(4 * ART_SCALE, OUTLINE, 0.9).strokeRoundedRect(
      s(-16),
      s(-15),
      32 * ART_SCALE,
      30 * ART_SCALE,
      9 * ART_SCALE,
    );
    p.fillStyle(0x7f7a6c).fillRoundedRect(
      s(-16),
      s(-15),
      32 * ART_SCALE,
      30 * ART_SCALE,
      9 * ART_SCALE,
    );
    p.lineStyle(2 * ART_SCALE, 0x4d493f, 0.9)
      .lineBetween(s(-10), s(8), s(-2), s(2))
      .lineBetween(s(4), s(10), s(11), s(3));
    eyes(p, c, 0xe9d497);
  },
  'enemy-bombard': (p, c) => {
    const s = u(c);
    poly(p, c, 0x3f5fa8, [
      [0, -19],
      [-15, 15],
      [15, 15],
    ]);
    p.fillStyle(0x2f4a88).fillRect(s(-15), s(6), 30 * ART_SCALE, 9 * ART_SCALE);
    p.fillStyle(0xffd2a8, 0.5).fillCircle(s(0), s(-22), 7 * ART_SCALE);
    p.fillStyle(0xff7a4d).fillCircle(s(0), s(-22), 4 * ART_SCALE);
    eyes(p, c, 0x9fd8ff, 1);
  },
  // Elites: bigger, spiked / crowned silhouettes (the rim glow is a separate sprite).
  'elite-melee': (p, c) => {
    for (const [x, y] of [
      [-14, -10],
      [14, -10],
      [0, -19],
    ] as const)
      poly(p, c, 0xe0b070, [
        [x - 4, y + 4],
        [x, y - 7],
        [x + 4, y + 4],
      ]);
    blob(p, c, 0xb5532b, 30, 33);
    eyes(p, c, 0xffe08a);
  },
  'elite-ranged': (p, c) => {
    poly(p, c, 0x7d4fc0, [
      [0, -18],
      [-17, 14],
      [17, 14],
    ]);
    poly(p, c, 0xe6c46a, [
      [-8, -15],
      [-6, -24],
      [-2, -18],
      [0, -26],
      [2, -18],
      [6, -24],
      [8, -15],
    ]);
    eyes(p, c, 0xf0dcff, 0);
  },
  // Boss: horned, armoured silhouette (aura is a separate sprite).
  boss: (p, c) => {
    const s = u(c);
    poly(p, c, 0x5a1426, [
      [-20, -14],
      [-34, -34],
      [-12, -22],
    ]);
    poly(p, c, 0x5a1426, [
      [20, -14],
      [34, -34],
      [12, -22],
    ]);
    blob(p, c, 0x8e1f3a, 60, 64, 2, 3);
    p.fillStyle(0xb02a4a, 0.7).fillEllipse(s(-8), s(-10), 22 * ART_SCALE, 12 * ART_SCALE);
    p.fillStyle(EYE_BAND).fillEllipse(s(0), s(-4), 34 * ART_SCALE, 14 * ART_SCALE);
    p.fillStyle(0xff5a6e)
      .fillRect(s(-11), s(-8), 7 * ART_SCALE, 4 * ART_SCALE)
      .fillRect(s(4), s(-8), 7 * ART_SCALE, 4 * ART_SCALE);
    p.lineStyle(2 * ART_SCALE, 0x3a0c18, 0.9)
      .lineBetween(s(-14), s(14), s(-4), s(20))
      .lineBetween(s(14), s(14), s(4), s(20));
  },
  // Projectiles (white bolt → tinted per skill/class at runtime; enemy shots keep their colour).
  'proj-bolt': (p, c) => {
    const s = u(c);
    p.fillStyle(0xffffff, 0.25).fillEllipse(s(-4), s(0), 22 * ART_SCALE, 9 * ART_SCALE);
    p.fillStyle(0xffffff, 0.55).fillEllipse(s(-2), s(0), 14 * ART_SCALE, 6 * ART_SCALE);
    p.fillStyle(0xffffff).fillCircle(s(3), s(0), 4 * ART_SCALE);
  },
  'proj-arrow': (p, c) => {
    const s = u(c);
    p.lineStyle(2 * ART_SCALE, 0xe8dcb8).lineBetween(s(-11), s(0), s(8), s(0));
    p.fillStyle(0xffffff).fillTriangle(s(12), s(0), s(6), s(-3), s(6), s(3));
    p.fillStyle(0xb2d58a)
      .fillTriangle(s(-11), s(0), s(-15), s(-4), s(-8), s(0))
      .fillTriangle(s(-11), s(0), s(-15), s(4), s(-8), s(0));
  },
  'proj-enemy': (p, c) => {
    const s = u(c);
    p.fillStyle(0xf3968c, 0.3).fillEllipse(s(-5), s(0), 20 * ART_SCALE, 8 * ART_SCALE);
    p.fillStyle(0xff5a3b, 0.45).fillCircle(s(2), s(0), 7 * ART_SCALE);
    p.fillStyle(0xffa391).fillCircle(s(2), s(0), 4.5 * ART_SCALE);
    p.fillStyle(0xfff0e0).fillCircle(s(3), s(-1), 1.6 * ART_SCALE);
  },
  // Pickups and chests.
  crystal: (p, c) => {
    const s = u(c);
    p.fillStyle(0xb4f1aa, 0.18).fillCircle(s(0), s(0), 12 * ART_SCALE);
    p.lineStyle(2 * ART_SCALE, 0x1d3a1f, 0.9).strokeTriangle(s(0), s(-7), s(-5), s(0), s(5), s(0));
    p.fillStyle(0xa7eaa7)
      .fillTriangle(s(0), s(-7), s(-5), s(0), s(5), s(0))
      .fillTriangle(s(-5), s(0), s(5), s(0), s(0), s(8));
    p.fillStyle(0xe4ffe1, 0.9).fillTriangle(s(0), s(-6), s(-3), s(0), s(0), s(0));
  },
  coin: (p, c) => {
    const s = u(c);
    p.fillStyle(0xf0c862, 0.2).fillCircle(s(0), s(0), 11 * ART_SCALE);
    p.lineStyle(2 * ART_SCALE, 0x5a3f12, 0.9).strokeCircle(s(0), s(0), 6 * ART_SCALE);
    p.fillStyle(0xf0c862).fillCircle(s(0), s(0), 6 * ART_SCALE);
    p.fillStyle(0xfff1c4).fillCircle(s(-2), s(-2), 2 * ART_SCALE);
    p.lineStyle(1 * ART_SCALE, 0xb48a2c, 0.9).strokeCircle(s(0), s(0), 4 * ART_SCALE);
  },
  'chest-wooden': (p, c) => chest(p, c, false),
  'chest-enchanted': (p, c) => chest(p, c, true),
  // Shared helpers: soft ground shadow and a white radial glow (tinted at runtime).
  shadow: (p, c) => {
    const s = u(c);
    for (let i = 0; i < 4; i++)
      p.fillStyle(0x020806, 0.16).fillEllipse(
        s(0),
        s(0),
        (38 - i * 6) * ART_SCALE,
        (14 - i * 2) * ART_SCALE,
      );
  },
  glow: (p, c) => {
    for (let i = 0; i < 16; i++) {
      const r = c * (1 - i / 16);
      p.fillStyle(0xffffff, 0.035 + (i / 16) * 0.05).fillCircle(c, c, r);
    }
  },
});
function chest(p: Pen, c: number, enchanted: boolean) {
  const s = u(c);
  p.fillStyle(enchanted ? 0xb68cff : 0xf0c862, 0.16).fillCircle(s(0), s(0), 26 * ART_SCALE);
  p.lineStyle(4 * ART_SCALE, OUTLINE, 0.9).strokeRoundedRect(
    s(-15),
    s(-13),
    30 * ART_SCALE,
    24 * ART_SCALE,
    4 * ART_SCALE,
  );
  p.fillStyle(enchanted ? 0x4b2f86 : 0x7a4b25).fillRoundedRect(
    s(-15),
    s(-11),
    30 * ART_SCALE,
    22 * ART_SCALE,
    4 * ART_SCALE,
  );
  p.fillStyle(enchanted ? 0x6a46b8 : 0x9a6232).fillRoundedRect(
    s(-15),
    s(-13),
    30 * ART_SCALE,
    9 * ART_SCALE,
    4 * ART_SCALE,
  );
  p.fillStyle(enchanted ? 0xd8c4ff : 0x3a3d40)
    .fillRect(s(-15), s(-5), 30 * ART_SCALE, 3 * ART_SCALE)
    .fillRect(s(-3), s(-6), 6 * ART_SCALE, 8 * ART_SCALE);
  if (enchanted)
    p.lineStyle(1 * ART_SCALE, 0xf1e6ff, 0.85)
      .strokeCircle(s(0), s(4), 4 * ART_SCALE)
      .lineBetween(s(-9), s(6), s(-5), s(2))
      .lineBetween(s(5), s(2), s(9), s(6));
}
/** Draws one texture's art centred in its square (used by the factory and by tests). */
export function drawArt(key: TextureKey, pen: Pen): number {
  const size = textureSize(key);
  ART[key](pen, size / 2);
  return size;
}
export const ART_KEYS = TEXTURE_KEYS;
