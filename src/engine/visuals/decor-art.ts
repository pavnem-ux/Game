import type { Pen } from './art';
import { DECOR_KEYS } from './biomes';
import type { DecorKey } from './biomes';

/**
 * Task 18 decor props (original procedural art, drawn once into textures). Each prop sits on its
 * base point (sprite origin 0.5 / BASE_Y) with a baked soft shadow. Pure: tests use a recording pen.
 */
export const DECOR_SIZE = 128;
/** Vertical origin of decor sprites: the base point is near the bottom of the texture. */
export const DECOR_BASE_Y = 0.82;
const B = DECOR_SIZE * DECOR_BASE_Y; // base line (px)
const C = DECOR_SIZE / 2;
type Draw = (p: Pen) => void;
const shadow = (p: Pen, w: number, a = 0.32) =>
  p.fillStyle(0x020806, a).fillEllipse(C + 3, B + 2, w, w * 0.34);
const tri = (p: Pen, color: number, x: number, top: number, half: number, base: number) =>
  p.fillStyle(color).fillTriangle(C + x, top, C + x - half, base, C + x + half, base);
const rock = (p: Pen, color: number, light: number, w: number, h: number, x = 0) => {
  p.fillStyle(0x0a0f0e, 0.7).fillEllipse(C + x, B - h / 2 + 1, w + 4, h + 4);
  p.fillStyle(color).fillEllipse(C + x, B - h / 2, w, h);
  p.fillStyle(light, 0.55).fillEllipse(C + x - w * 0.15, B - h * 0.7, w * 0.45, h * 0.3);
};
const trunk = (p: Pen, color: number, w: number, h: number) =>
  p.fillStyle(color).fillRect(C - w / 2, B - h, w, h);
const branches = (
  p: Pen,
  color: number,
  width: number,
  list: [number, number, number, number][],
) => {
  p.lineStyle(width, color);
  for (const [x1, y1, x2, y2] of list) p.lineBetween(C + x1, B - y1, C + x2, B - y2);
};
const dots = (p: Pen, color: number, alpha: number, list: [number, number, number][]) => {
  p.fillStyle(color, alpha);
  for (const [x, y, r] of list) p.fillCircle(C + x, B - y, r);
};

export const DECOR_ART: Readonly<Record<DecorKey, Draw>> = Object.freeze({
  // ── Act I: forest ──
  'decor-pine': (p) => {
    shadow(p, 52);
    trunk(p, 0x3a2a1c, 6, 14);
    tri(p, 0x1d3a26, 0, B - 70, 24, B - 10);
    tri(p, 0x24482e, 0, B - 84, 18, B - 34);
    tri(p, 0x2c5636, 0, B - 96, 12, B - 58);
  },
  'decor-oak': (p) => {
    shadow(p, 60);
    trunk(p, 0x3d2c1d, 9, 30);
    dots(p, 0x1f3b25, 1, [
      [-16, 40, 18],
      [16, 42, 17],
      [0, 56, 22],
    ]);
    dots(p, 0x2e5534, 0.9, [
      [-8, 52, 10],
      [10, 58, 8],
    ]);
  },
  'decor-bush': (p) => {
    shadow(p, 44);
    dots(p, 0x1e3a24, 1, [
      [-10, 10, 12],
      [10, 10, 12],
      [0, 18, 14],
    ]);
    dots(p, 0xb84a5a, 0.85, [
      [-6, 18, 2],
      [8, 14, 2],
      [2, 24, 2],
    ]);
  },
  'decor-mushrooms': (p) => {
    shadow(p, 30, 0.25);
    for (const [x, h, r, cap] of [
      [-8, 12, 9, 0xb0453c],
      [6, 9, 7, 0xc9a24a],
      [14, 6, 5, 0xb0453c],
    ] as const) {
      p.fillStyle(0xe8dcc0).fillRect(C + x - 2, B - h, 4, h);
      p.fillStyle(cap).fillEllipse(C + x, B - h, r * 2, r);
      p.fillStyle(0xfff3dc, 0.8).fillCircle(C + x - r / 3, B - h - 1, 1.4);
    }
  },
  'decor-flowers': (p) => {
    for (const [x, y, c] of [
      [-12, 4, 0xd8d27a],
      [-2, 8, 0xc8a2ef],
      [8, 3, 0xf0a8b0],
      [14, 9, 0xd8d27a],
      [2, 1, 0xa8d8f0],
    ] as const) {
      p.lineStyle(1.5, 0x3d6a3a).lineBetween(C + x, B, C + x, B - y - 4);
      p.fillStyle(c).fillCircle(C + x, B - y - 6, 3);
    }
  },
  'decor-stump': (p) => {
    shadow(p, 34);
    p.fillStyle(0x3a2a1c).fillRect(C - 11, B - 14, 22, 14);
    p.fillStyle(0x6a5236).fillEllipse(C, B - 14, 22, 8);
    p.lineStyle(1, 0x3a2a1c, 0.8).strokeEllipse(C, B - 14, 12, 4);
  },
  'decor-mossrock': (p) => {
    shadow(p, 46);
    rock(p, 0x3c4440, 0x5a6660, 40, 24);
    p.fillStyle(0x2f5a32, 0.85).fillEllipse(C - 4, B - 22, 26, 9);
  },
  'decor-grass': (p) => {
    p.lineStyle(2, 0x2f5a32);
    for (let i = -10; i <= 10; i += 4)
      p.lineBetween(C + i, B, C + i * 1.4, B - 12 - Math.abs(i) * 0.3);
  },
  // ── Act II: marsh ──
  'decor-bogtuft': (p) => {
    p.fillStyle(0x1a2f2a, 0.8).fillEllipse(C, B, 40, 10);
    p.lineStyle(2, 0x4b6a4a);
    for (let i = -12; i <= 12; i += 4)
      p.lineBetween(C + i, B, C + i * 1.6, B - 16 + Math.abs(i) * 0.4);
  },
  'decor-reeds': (p) => {
    p.lineStyle(2, 0x5a6a3a);
    for (const x of [-8, -2, 5, 11]) p.lineBetween(C + x, B, C + x + 2, B - 34 - x);
    p.fillStyle(0x4a3624);
    for (const x of [-8, 5]) p.fillEllipse(C + x + 2, B - 30 - x, 5, 12);
  },
  'decor-bones': (p) => {
    p.lineStyle(3, 0xcfc6a8);
    p.lineBetween(C - 14, B - 2, C + 10, B - 8).lineBetween(C - 4, B - 12, C + 12, B + 2);
    dots(p, 0xcfc6a8, 1, [
      [-14, 2, 3],
      [10, 8, 3],
      [12, -2, 3],
    ]);
  },
  'decor-skull': (p) => {
    shadow(p, 22, 0.25);
    p.fillStyle(0xd8d0b4)
      .fillCircle(C, B - 8, 8)
      .fillRect(C - 5, B - 3, 10, 5);
    dots(p, 0x1a1a1a, 1, [
      [-3, 9, 2],
      [3, 9, 2],
    ]);
  },
  'decor-barrow': (p) => {
    shadow(p, 70, 0.3);
    p.fillStyle(0x223a30).fillEllipse(C, B - 10, 64, 26);
    p.fillStyle(0x2c4a3a, 0.8).fillEllipse(C - 8, B - 16, 36, 10);
    rock(p, 0x5a5e58, 0x7a7e78, 12, 16, 0);
  },
  'decor-menhir': (p) => {
    shadow(p, 30);
    p.fillStyle(0x0a0f0e, 0.7).fillRoundedRect(C - 9, B - 46, 18, 46, 6);
    p.fillStyle(0x56605a).fillRoundedRect(C - 8, B - 45, 16, 45, 6);
    p.lineStyle(1.5, 0x8fb4a8, 0.5)
      .lineBetween(C - 2, B - 34, C + 2, B - 26)
      .lineBetween(C + 2, B - 26, C - 2, B - 18);
  },
  'decor-puddle': (p) => {
    p.fillStyle(0x0b1a1e, 0.85).fillEllipse(C, B - 2, 54, 16);
    p.fillStyle(0x2a5058, 0.5).fillEllipse(C - 6, B - 4, 22, 5);
  },
  'decor-deadlog': (p) => {
    shadow(p, 56, 0.28);
    p.fillStyle(0x3a3226).fillRoundedRect(C - 26, B - 10, 52, 10, 5);
    p.fillStyle(0x5a4c38).fillEllipse(C + 26, B - 5, 8, 10);
    p.fillStyle(0x3e5a3a, 0.8).fillEllipse(C - 8, B - 10, 16, 4);
  },
  // ── Act III: ashlands ──
  'decor-ruinwall': (p) => {
    shadow(p, 64, 0.3);
    p.fillStyle(0x4a4648).fillRect(C - 28, B - 30, 56, 30);
    p.fillStyle(0x2a2628)
      .fillRect(C - 28, B - 30, 12, 8)
      .fillRect(C + 10, B - 36, 18, 6);
    p.lineStyle(1, 0x2a2628, 0.9);
    for (let y = 8; y < 30; y += 8) p.lineBetween(C - 28, B - y, C + 28, B - y);
  },
  'decor-column': (p) => {
    shadow(p, 32);
    p.fillStyle(0x6a6460).fillRect(C - 8, B - 52, 16, 52);
    p.fillStyle(0x7e7874)
      .fillRect(C - 11, B - 56, 22, 6)
      .fillRect(C - 11, B - 6, 22, 6);
    p.lineStyle(1, 0x4a4440, 0.8)
      .lineBetween(C - 3, B - 50, C - 3, B - 8)
      .lineBetween(C + 3, B - 50, C + 3, B - 8);
    p.fillStyle(0x232224).fillTriangle(C + 8, B - 52, C - 2, B - 52, C + 8, B - 40);
  },
  'decor-fallencolumn': (p) => {
    shadow(p, 66, 0.28);
    p.fillStyle(0x6a6460).fillRect(C - 30, B - 13, 52, 13);
    p.fillStyle(0x7e7874).fillEllipse(C + 22, B - 6, 8, 14);
    p.lineStyle(1, 0x4a4440, 0.8)
      .lineBetween(C - 28, B - 9, C + 20, B - 9)
      .lineBetween(C - 28, B - 4, C + 20, B - 4);
  },
  'decor-rubble': (p) => {
    shadow(p, 44, 0.25);
    rock(p, 0x4a4648, 0x6a6668, 16, 10, -10);
    rock(p, 0x55504e, 0x726c6a, 14, 12, 8);
    rock(p, 0x3e3a3c, 0x5a5658, 10, 7, -1);
  },
  'decor-embercrack': (p) => {
    p.lineStyle(5, 0xff7a3d, 0.25)
      .lineBetween(C - 26, B - 2, C - 6, B - 8)
      .lineBetween(C - 6, B - 8, C + 24, B - 1);
    p.lineStyle(2, 0xffb36b, 0.9)
      .lineBetween(C - 26, B - 2, C - 6, B - 8)
      .lineBetween(C - 6, B - 8, C + 24, B - 1);
    p.lineStyle(1.5, 0xffd27a, 0.8).lineBetween(C - 6, B - 8, C, B - 16);
  },
  'decor-burnttree': (p) => {
    shadow(p, 40);
    trunk(p, 0x1e1a1a, 7, 46);
    branches(p, 0x1e1a1a, 3, [
      [0, 30, -14, 44],
      [0, 36, 12, 50],
      [-8, 40, -16, 38],
    ]);
    dots(p, 0xff7a3d, 0.7, [[2, 18, 1.5]]);
  },
  'decor-ashpile': (p) => {
    p.fillStyle(0x3a3838, 0.9).fillEllipse(C, B - 4, 40, 12);
    p.fillStyle(0x5a5858, 0.7).fillEllipse(C - 4, B - 7, 22, 6);
    dots(p, 0xff8a4c, 0.6, [
      [6, 6, 1.4],
      [-8, 5, 1.2],
    ]);
  },
  'decor-brazier': (p) => {
    shadow(p, 26);
    p.lineStyle(3, 0x3a3434)
      .lineBetween(C - 8, B, C, B - 14)
      .lineBetween(C + 8, B, C, B - 14);
    p.fillStyle(0x4a4444).fillEllipse(C, B - 16, 22, 8);
    p.fillStyle(0xff8a4c, 0.85).fillTriangle(C - 6, B - 18, C + 6, B - 18, C, B - 32);
    p.fillStyle(0xffd27a, 0.9).fillTriangle(C - 3, B - 18, C + 3, B - 18, C, B - 26);
  },
  // ── Act IV: frost ──
  'decor-icecrystal': (p) => {
    shadow(p, 34, 0.25);
    for (const [x, h, w] of [
      [-8, 30, 7],
      [4, 40, 8],
      [12, 22, 6],
    ] as const) {
      p.fillStyle(0x7fb8e0, 0.9).fillTriangle(C + x, B - h, C + x - w, B, C + x + w, B);
      p.fillStyle(0xd8f0ff, 0.7).fillTriangle(C + x, B - h, C + x - w * 0.4, B - 4, C + x, B - 4);
    }
  },
  'decor-icespire': (p) => {
    shadow(p, 36);
    p.fillStyle(0x5f8fb8).fillTriangle(C, B - 64, C - 12, B, C + 12, B);
    p.fillStyle(0xbfe4ff, 0.7).fillTriangle(C, B - 64, C - 4, B - 6, C, B - 6);
  },
  'decor-deadtree': (p) => {
    shadow(p, 40);
    trunk(p, 0x3e4650, 6, 44);
    branches(p, 0x3e4650, 2.5, [
      [0, 28, -16, 42],
      [0, 34, 14, 48],
      [-8, 38, -12, 50],
    ]);
    p.fillStyle(0xe8f4ff, 0.8)
      .fillRect(C - 16, B - 43, 6, 2)
      .fillRect(C + 10, B - 49, 6, 2);
  },
  'decor-frozenstone': (p) => {
    shadow(p, 44);
    rock(p, 0x46566a, 0x6a8098, 38, 22);
    p.fillStyle(0xe8f4ff, 0.85).fillEllipse(C - 2, B - 21, 28, 6);
  },
  'decor-snowdrift': (p) => {
    p.fillStyle(0xcfe2f2, 0.85).fillEllipse(C, B - 5, 56, 14);
    p.fillStyle(0xffffff, 0.6).fillEllipse(C - 8, B - 8, 26, 5);
  },
  'decor-icerock': (p) => {
    shadow(p, 40);
    rock(p, 0x3c4a5c, 0x5c6c80, 30, 26, -4);
    p.fillStyle(0xbfe4ff, 0.8).fillTriangle(C + 8, B - 26, C + 3, B - 4, C + 13, B - 4);
  },
  'decor-frostbush': (p) => {
    shadow(p, 40);
    dots(p, 0x3a5a6a, 1, [
      [-9, 9, 10],
      [9, 9, 10],
      [0, 16, 12],
    ]);
    dots(p, 0xe8f4ff, 0.75, [
      [-6, 20, 4],
      [8, 16, 3],
      [0, 26, 4],
    ]);
  },
  'decor-runestone': (p) => {
    shadow(p, 30);
    p.fillStyle(0x4c5a6c).fillRoundedRect(C - 10, B - 38, 20, 38, 5);
    p.lineStyle(2, 0x9fdcff, 0.8)
      .lineBetween(C - 4, B - 30, C + 4, B - 22)
      .lineBetween(C + 4, B - 22, C - 4, B - 14)
      .lineBetween(C - 4, B - 14, C + 4, B - 8);
  },
});
/** Ambient particle and light textures (white, tinted at runtime). */
export const FX_SIZE = 64;
export const FX_ART = Object.freeze({
  mote: (p: Pen) => {
    p.fillStyle(0xffffff, 0.35).fillCircle(32, 32, 6);
    p.fillStyle(0xffffff).fillCircle(32, 32, 3);
  },
  fog: (p: Pen) => {
    for (let i = 0; i < 12; i++) p.fillStyle(0xffffff, 0.035).fillCircle(32, 32, 32 - i * 2.4);
  },
});
export const DECOR_ART_KEYS = DECOR_KEYS;
