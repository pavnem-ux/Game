import type Phaser from 'phaser';

/**
 * Task 33: the VFX texture keys. Each is generated procedurally at boot (white, soft edges; tinted
 * per element by a baked copy). An owner VFX art pack may later replace any of them by manifest
 * key only (`kind: "vfx"`, same key): the registry then serves the art texture instead.
 */
export const VFX_TEXTURE_KEYS = Object.freeze([
  'vfx_glow_soft',
  'vfx_spark_star',
  'vfx_shockwave_ring',
  'vfx_smoke_puff',
  'vfx_slash_arc',
  'vfx_ice_shard',
  'vfx_flame',
  'vfx_poison_drop',
  'vfx_lightning',
  'vfx_rune_circle',
  'vfx_cracks_ground',
  'vfx_arrow_trail',
  'vfx_blood_splash',
  'vfx_frost_burst',
] as const);
export type VfxTextureKey = (typeof VFX_TEXTURE_KEYS)[number];

/** Generated size (px) per key: [width, height]. */
export const VFX_TEXTURE_SIZE: Readonly<Record<VfxTextureKey, readonly [number, number]>> =
  Object.freeze({
    vfx_glow_soft: [64, 64],
    vfx_spark_star: [48, 48],
    vfx_shockwave_ring: [128, 128],
    vfx_smoke_puff: [64, 64],
    vfx_slash_arc: [128, 128],
    vfx_ice_shard: [24, 64],
    vfx_flame: [40, 64],
    vfx_poison_drop: [32, 40],
    vfx_lightning: [128, 32],
    vfx_rune_circle: [128, 128],
    vfx_cracks_ground: [128, 128],
    vfx_arrow_trail: [96, 16],
    vfx_blood_splash: [64, 64],
    vfx_frost_burst: [96, 96],
  });

type Ctx = CanvasRenderingContext2D;
const W = (a: number) => `rgba(255,255,255,${a})`;

/** A tiny fixed sequence (the drawings are identical every boot; no randomness). */
function seq(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function softDisc(ctx: Ctx, x: number, y: number, r: number, a = 1, hard = 0) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, W(a));
  g.addColorStop(Math.min(0.95, hard), W(a));
  g.addColorStop(1, W(0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Draws one VFX texture (white on transparent) into a context of its `VFX_TEXTURE_SIZE`. */
export function drawVfxTexture(key: VfxTextureKey, ctx: Ctx): void {
  const [w, h] = VFX_TEXTURE_SIZE[key];
  const cx = w / 2,
    cy = h / 2;
  ctx.clearRect(0, 0, w, h);
  switch (key) {
    case 'vfx_glow_soft': {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
      g.addColorStop(0, W(1));
      g.addColorStop(0.25, W(0.7));
      g.addColorStop(0.6, W(0.2));
      g.addColorStop(1, W(0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'vfx_spark_star': {
      softDisc(ctx, cx, cy, cx * 0.45, 0.9);
      ctx.fillStyle = W(1);
      for (const [long, rot] of [
        [cx, 0],
        [cx * 0.6, Math.PI / 4],
      ] as const)
        for (let i = 0; i < 4; i++) {
          const a = rot + (i * Math.PI) / 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * long, cy + Math.sin(a) * long);
          ctx.lineTo(cx + Math.cos(a + Math.PI / 2) * 2.5, cy + Math.sin(a + Math.PI / 2) * 2.5);
          ctx.lineTo(cx + Math.cos(a - Math.PI / 2) * 2.5, cy + Math.sin(a - Math.PI / 2) * 2.5);
          ctx.fill();
        }
      softDisc(ctx, cx, cy, 5, 1, 0.5);
      break;
    }
    case 'vfx_shockwave_ring': {
      const r = cx - 4;
      const g = ctx.createRadialGradient(cx, cy, r * 0.62, cx, cy, r);
      g.addColorStop(0, W(0));
      g.addColorStop(0.7, W(0.55));
      g.addColorStop(0.88, W(1));
      g.addColorStop(1, W(0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'vfx_smoke_puff': {
      const r = seq(7);
      for (let i = 0; i < 7; i++)
        softDisc(ctx, cx + (r() - 0.5) * 22, cy + (r() - 0.5) * 22, 12 + r() * 10, 0.32);
      break;
    }
    case 'vfx_slash_arc': {
      // A crescent sweeping ~150°, bright at the leading edge, fading toward the tail.
      const steps = 40;
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        const a0 = -Math.PI * 0.42 + t * Math.PI * 0.84;
        const a1 = a0 + (Math.PI * 0.84) / steps + 0.01;
        const thick = 3 + 13 * Math.sin(t * Math.PI) ** 0.8;
        const outer = cx - 6;
        ctx.fillStyle = W(0.15 + 0.85 * t ** 1.4);
        ctx.beginPath();
        ctx.arc(cx, cy, outer, a0, a1);
        ctx.arc(cx, cy, outer - thick, a1, a0, true);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'vfx_ice_shard': {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, W(0.55));
      g.addColorStop(0.5, W(1));
      g.addColorStop(1, W(0.55));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, 1);
      ctx.lineTo(w - 3, h * 0.45);
      ctx.lineTo(cx, h - 1);
      ctx.lineTo(3, h * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = W(1);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, 3);
      ctx.lineTo(cx, h - 3);
      ctx.stroke();
      break;
    }
    case 'vfx_flame': {
      const g = ctx.createRadialGradient(cx, h * 0.7, 2, cx, h * 0.6, h * 0.55);
      g.addColorStop(0, W(1));
      g.addColorStop(0.45, W(0.75));
      g.addColorStop(1, W(0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, 2);
      ctx.bezierCurveTo(w * 0.95, h * 0.45, w * 0.9, h * 0.95, cx, h - 2);
      ctx.bezierCurveTo(w * 0.1, h * 0.95, w * 0.05, h * 0.45, cx, 2);
      ctx.fill();
      break;
    }
    case 'vfx_poison_drop': {
      const g = ctx.createRadialGradient(cx - 3, h * 0.62, 1, cx, h * 0.62, w * 0.5);
      g.addColorStop(0, W(1));
      g.addColorStop(0.7, W(0.75));
      g.addColorStop(1, W(0.2));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, 2);
      ctx.quadraticCurveTo(w - 2, h * 0.55, cx + w * 0.38, h * 0.72);
      ctx.arc(cx, h * 0.68, w * 0.38, 0.2, Math.PI - 0.2);
      ctx.quadraticCurveTo(2, h * 0.55, cx, 2);
      ctx.fill();
      break;
    }
    case 'vfx_lightning': {
      const r = seq(31);
      const pts: [number, number][] = [];
      for (let x = 4; x <= w - 4; x += 10) pts.push([x, cy + (r() - 0.5) * (h - 10)]);
      for (const [width, a] of [
        [9, 0.18],
        [4, 0.5],
        [1.6, 1],
      ] as const) {
        ctx.strokeStyle = W(a);
        ctx.lineWidth = width;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
      break;
    }
    case 'vfx_rune_circle': {
      ctx.strokeStyle = W(0.9);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, cx - 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, cx - 18, 0, Math.PI * 2);
      ctx.stroke();
      // Rune marks between the two circles, and a six-point star inside.
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r0 = cx - 15,
          r1 = cx - 9;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a + 0.12) * r1, cy + Math.sin(a + 0.12) * r1);
        ctx.lineTo(cx + Math.cos(a + 0.2) * r0, cy + Math.sin(a + 0.2) * r0);
        ctx.stroke();
      }
      ctx.strokeStyle = W(0.6);
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        for (let i = 0; i <= 3; i++) {
          const a = k * (Math.PI / 3) + (i / 3) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(a) * (cx - 22),
            y = cy + Math.sin(a) * (cx - 22);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }
    case 'vfx_cracks_ground': {
      const r = seq(5);
      ctx.strokeStyle = W(0.85);
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        let a = (i / 9) * Math.PI * 2 + r() * 0.4;
        let x = cx,
          y = cy;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const len = cx * (0.55 + r() * 0.4);
        for (let d = 0; d < len; d += 9) {
          a += (r() - 0.5) * 0.7;
          x += Math.cos(a) * 9;
          y += Math.sin(a) * 9;
          ctx.lineTo(x, y);
          ctx.lineWidth = Math.max(0.8, 3 - d / 20);
        }
        ctx.stroke();
      }
      softDisc(ctx, cx, cy, 14, 0.5);
      break;
    }
    case 'vfx_arrow_trail': {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, W(0));
      g.addColorStop(0.8, W(0.6));
      g.addColorStop(1, W(1));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(w - 2, cy - h * 0.38);
      ctx.quadraticCurveTo(w + 2, cy, w - 2, cy + h * 0.38);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'vfx_blood_splash': {
      const r = seq(13);
      softDisc(ctx, cx, cy, 14, 0.95, 0.6);
      for (let i = 0; i < 10; i++) {
        const a = r() * Math.PI * 2,
          d = 10 + r() * (cx - 16);
        softDisc(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2.5 + r() * 4, 0.95, 0.6);
      }
      break;
    }
    case 'vfx_frost_burst': {
      softDisc(ctx, cx, cy, cx * 0.4, 0.8);
      ctx.strokeStyle = W(0.95);
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const ex = cx + Math.cos(a) * (cx - 6),
          ey = cy + Math.sin(a) * (cx - 6);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.lineWidth = 2;
        for (const f of [0.45, 0.7]) {
          const bx = cx + Math.cos(a) * (cx - 6) * f,
            by = cy + Math.sin(a) * (cx - 6) * f;
          for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + Math.cos(a + s * 0.7) * 10, by + Math.sin(a + s * 0.7) * 10);
            ctx.stroke();
          }
        }
      }
      break;
    }
  }
}

/** Generates every VFX texture once per game (idempotent: kept across scene restarts). */
export function buildVfxTextures(scene: Phaser.Scene): void {
  for (const key of VFX_TEXTURE_KEYS) {
    if (scene.textures.exists(key)) continue;
    const [w, h] = VFX_TEXTURE_SIZE[key];
    const tex = scene.textures.createCanvas(key, w, h);
    if (!tex) continue;
    drawVfxTexture(key, tex.getContext());
    tex.refresh();
  }
}
