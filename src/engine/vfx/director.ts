import type { CharacterClass } from '../../character-stats';
import type { GameplaySnapshot, WorldEvent } from '../../gameplay';
import type { VfxEmitter } from './emitters';
import { ELEMENT_PALETTE } from './palette';
import { AWAKENED, LIGHT, OFFHAND_WEAPON_ID, SKILL_VFX, recipeFor } from './recipes';
import type { AreaFx, ImpactFx, VfxRecipe } from './recipes';

/**
 * Task 33: turns this frame's world events and the snapshot into effects (pure; no Phaser). It
 * only reads: nothing here is passed back to the world, so the simulation is identical with VFX on
 * or off. Also reports render-only "feel" signals for the scene (hero motion, hit-stops, heavy
 * hits) — see `VfxSignals`.
 */
export interface VfxSignals {
  /** Hero motion this frame: a melee lunge / spell cast / bow pull toward `dx, dy` (unit). */
  motion: 'lunge' | 'cast' | 'bow' | null;
  dx: number;
  dy: number;
  /** Struck sprites to freeze briefly (crits, boss hits): entity ids, at most `HIT_STOP_LIMIT`. */
  readonly hitStops: string[];
  /** A heavy hit landed (heavy area, crit on a boss…): small screen shake if the setting allows. */
  heavy: boolean;
}
export const HIT_STOP_LIMIT = 8;
/** Projectile trails: one puff per projectile every `TRAIL_EVERY` frames (Canvas cost). */
const TRAIL_EVERY = 1;
/** Remembered impact attack ids (a damage event after its weapon impact draws nothing more). */
const RECENT_IMPACTS = 32;
/** Remembered zone ids (a zone's decal is drawn once, when it appears). */
const KNOWN_ZONES = 48;

export interface DirectorContext {
  readonly characterClass: CharacterClass;
  /** The equipped weapon's reach (basic slash radius). */
  readonly attackRange: number;
  /** Damage source of an attack (`skill:…`, `synergy:…`, `talent:…`, `pet.…`), if known. */
  readonly attackSource?: (attackId: string) => string | undefined;
  readonly playerId: string;
}

export class VfxDirector {
  readonly signals: VfxSignals = { motion: null, dx: 0, dy: 0, hitStops: [], heavy: false };
  private frameNo = 0;
  private lastTime = 0;
  private readonly impacts: string[] = [];
  private impactAt = 0;
  private readonly zones: string[] = [];
  private zoneAt = 0;
  constructor(private readonly fx: VfxEmitter) {}
  /** A new world: forget remembered ids. */
  reset(): void {
    this.impacts.length = 0;
    this.zones.length = 0;
    this.impactAt = this.zoneAt = 0;
    this.lastTime = 0;
  }
  /** Spawns this frame's effects (the emitter clock must already be `s.time`). */
  frame(s: GameplaySnapshot, events: readonly WorldEvent[], ctx: DirectorContext): VfxSignals {
    const sig = this.signals;
    sig.motion = null;
    sig.heavy = false;
    sig.hitStops.length = 0;
    this.frameNo++;
    for (const entry of events) this.event(s, entry, ctx);
    this.trails(s, ctx);
    this.zonesFrame(s, ctx);
    this.lastTime = s.time;
    return sig;
  }

  // ── Per-event effects ──
  private event(s: GameplaySnapshot, entry: WorldEvent, ctx: DirectorContext) {
    const e = entry.event;
    const cls = ctx.characterClass;
    switch (e.type) {
      case 'attack-started': {
        if (e.sourceId !== ctx.playerId) return;
        const r = recipeFor(e.weaponId, cls);
        const len = Math.hypot(e.direction.x, e.direction.y) || 1;
        const dx = e.direction.x / len,
          dy = e.direction.y / len;
        const skill = e.weaponId.startsWith('skill:');
        if (!skill && !e.weaponId.startsWith('talent:')) {
          // Hero motion: a melee lunge, a spell cast, a bow pull (render only).
          const main = r === recipeFor('', cls);
          if (main) {
            this.motion(cls === 'mage' ? 'cast' : cls === 'archer' ? 'bow' : 'lunge', dx, dy);
          }
        }
        if (r.cast?.kind === 'slash' && !e.projectileId) {
          const radius = r.cast.size || ctx.attackRange;
          const k = r.light ? LIGHT.scale + 0.2 : 1;
          this.withAlpha(r, () =>
            this.fx.arc(
              e.origin.x,
              e.origin.y,
              Math.atan2(dy, dx),
              radius * k,
              ELEMENT_PALETTE[r.element].color,
              0.16,
              e.weaponId === OFFHAND_WEAPON_ID || e.strike === 2,
            ),
          );
        } else if (r.cast?.kind === 'glow' && !skill)
          this.fx.flash(
            e.origin.x + dx * 14,
            e.origin.y + dy * 14,
            ELEMENT_PALETTE[r.element].core,
            r.cast.size,
            0.12,
            true,
          );
        return;
      }
      case 'impact': {
        // Enemies only ever strike the player: every other impact is the player's side.
        if (e.targetId === ctx.playerId || e.result.status !== 'hit') return;
        const at = this.enemyAt(s, e.targetId);
        if (!at) return;
        this.rememberImpact(e.attack.id);
        const r = recipeFor(e.weaponId, cls);
        this.impact(r, at.x, at.y, e.attack.critical, 1);
        this.struck(s, e.targetId, e.attack.critical);
        return;
      }
      case 'damage': {
        if (e.targetId === ctx.playerId || e.sourceId !== ctx.playerId) return;
        if (this.impacts.includes(e.attackId)) return; // drawn by its weapon impact
        const at = this.enemyAt(s, e.targetId);
        if (!at) return;
        const source = ctx.attackSource?.(e.attackId);
        if (source) this.impact(recipeFor(source, cls), at.x, at.y, e.critical, 0.7);
        else if (e.critical) this.impact(recipeFor('', cls), at.x, at.y, true, 0.7);
        this.struck(s, e.targetId, e.critical);
        return;
      }
      case 'skill-activated': {
        const r = SKILL_VFX[e.skillId];
        if (!r?.cast) return;
        const target = e.targetId ? this.enemyAt(s, e.targetId) : null;
        // Marks are cast on their target; everything else at the hero.
        const at = r.cast.kind === 'rune' && target && !r.area ? target : e.origin;
        this.cast(r, at.x, at.y);
        if (r.cast.kind === 'glow') this.motion('cast', 0, 0);
        return;
      }
      case 'skill-area': {
        const source = e.sourceKey.includes(':') ? e.sourceKey : `skill:${e.sourceKey}`;
        const r = recipeFor(source, cls);
        if (!r.area) return;
        this.area(r, r.area, e.center.x, e.center.y, e.radius, e.direction, 1);
        return;
      }
      case 'synergy-triggered': {
        const r = recipeFor(`synergy:${e.synergyId}`, cls);
        const awakened = e.level === 3;
        const k = awakened ? AWAKENED.scale : e.level === 2 ? 1.15 : 1;
        if (r.impact) this.impact(r, e.position.x, e.position.y, false, k);
        if (r.area) this.area(r, r.area, e.position.x, e.position.y, 34 * k, undefined, k);
        if (awakened) {
          const c = ELEMENT_PALETTE[r.element];
          if (AWAKENED.coreFlash) this.fx.flash(e.position.x, e.position.y, c.core, 70);
          if (AWAKENED.extraRing) this.fx.ring(e.position.x, e.position.y, c.core, 10, 70, 0.4);
        }
        return;
      }
      case 'pet-action': {
        const r = recipeFor(`pet.${e.petId}`, cls);
        this.withAlpha(r, () => {
          if ((e.action === 'shot' || e.action === 'dash') && e.to) {
            if (e.action === 'dash')
              this.fx.plume(e.from.x, e.from.y, 8, 0xd0d0d0, 2, 'vfx_smoke_puff', 16);
            this.impact(r, e.to.x, e.to.y, false, 1);
          } else if (e.action === 'heal')
            this.fx.ring(e.from.x, e.from.y, ELEMENT_PALETTE.poison.core, 6, 26, 0.3, 0.7);
          else if (e.action === 'barrier')
            this.fx.ring(e.from.x, e.from.y, ELEMENT_PALETTE.ice.color, 8, 30, 0.3, 0.7);
        });
        return;
      }
      default:
        return;
    }
  }

  // ── Building blocks ──
  private withAlpha(r: VfxRecipe, draw: () => void) {
    if (!r.light) return draw();
    const before = this.fx.alpha;
    this.fx.alpha = before * LIGHT.alpha;
    draw();
    this.fx.alpha = before;
  }
  private cast(r: VfxRecipe, x: number, y: number) {
    const cast = r.cast!;
    const c = ELEMENT_PALETTE[r.element];
    if (cast.kind === 'glow') this.fx.flash(x, y, c.core, cast.size, 0.18);
    else if (cast.kind === 'rune') {
      this.fx.decal(x, y, 'vfx_rune_circle', c.color, cast.size / 2, 0.5, 0.85, 2);
      this.fx.flash(x, y, c.color, cast.size * 0.8, 0.2, true);
    } else if (cast.kind === 'ring') this.fx.ring(x, y, c.color, 8, cast.size, 0.4);
  }
  /** An impact at (x, y): `k` scales the size (light recipes, awakened synergies). */
  private impact(r: VfxRecipe, x: number, y: number, critical: boolean, k: number) {
    const hit: ImpactFx | undefined = r.impact;
    if (!hit) return;
    const c = ELEMENT_PALETTE[r.element];
    const scale = (r.light ? LIGHT.scale : 1) * k;
    this.withAlpha(r, () => {
      this.fx.flash(x, y, critical ? c.core : c.color, hit.flash * scale * (critical ? 1.6 : 1));
      this.fx.sparks(x, y, c.color, hit.sparks + (critical ? 3 : 0), 150, 12 * scale, hit.spark);
      if (hit.shards) this.fx.shards(x, y, c.color, hit.shards.count, hit.shards.tex, 14 * scale);
      if (hit.ring) this.fx.ring(x, y, c.color, 4, hit.ring * scale, 0.25, 0.8);
      if (critical) {
        // Crit: a bigger flash and a white star.
        this.fx.sparks(x, y, 0xffffff, 1, 0, 34 * scale, 'vfx_spark_star');
        this.fx.ring(x, y, c.core, 6, 30 * scale, 0.22);
      }
    });
  }
  private area(
    r: VfxRecipe,
    a: AreaFx,
    x: number,
    y: number,
    radius: number,
    dir: { x: number; y: number } | undefined,
    k: number,
  ) {
    const c = ELEMENT_PALETTE[r.element];
    if (a.decal) this.fx.decal(x, y, a.decal, c.color, radius * 0.9, 0.6, 0.6);
    if (a.ring) this.fx.ring(x, y, c.color, radius * 0.25, radius, 0.32);
    if (a.plume) this.fx.plume(x, y, radius * 0.7, c.color, a.plume.count, a.plume.tex, 24 * k);
    if (a.slashes) {
      const base = dir ? Math.atan2(dir.y, dir.x) : this.fx.rng.next() * Math.PI * 2;
      for (let i = 0; i < a.slashes; i++) {
        const ang = dir ? base + (i - (a.slashes - 1) / 2) * 0.35 : base + (i / a.slashes) * 6.283;
        this.fx.arc(x, y, ang, Math.max(24, radius * 0.85), c.color, 0.18, i % 2 === 1);
      }
    }
    if (a.bolts)
      for (let i = 0; i < a.bolts; i++) {
        const ang = this.fx.rng.next() * Math.PI * 2;
        this.fx.bolt(x, y, x + Math.cos(ang) * radius, y + Math.sin(ang) * radius, c.color);
      }
    if (a.heavy) this.signals.heavy = true;
  }
  private trails(s: GameplaySnapshot, ctx: DirectorContext) {
    if (this.frameNo % TRAIL_EVERY !== 0) return;
    for (const p of s.playerProjectiles) {
      const r = recipeFor(p.weaponId, ctx.characterClass);
      const t = r.trail;
      if (!t) continue;
      const c = ELEMENT_PALETTE[r.element];
      const ang = Math.atan2(p.direction.y, p.direction.x);
      const len = t.length * (r.light ? LIGHT.scale + 0.2 : 1);
      this.fx.trail(p.x, p.y, ang, len, c.color, t.tex);
      if (t.sparks && this.frameNo % 3 === 0)
        this.fx.sparks(p.x, p.y, c.core, 1, 40, 8, 'vfx_spark_star');
    }
  }
  private zonesFrame(s: GameplaySnapshot, ctx: DirectorContext) {
    const zones = s.skillCombat.zones;
    for (const z of zones) {
      const r = recipeFor(
        z.sourceKey.includes(':') ? z.sourceKey : `skill:${z.sourceKey}`,
        ctx.characterClass,
      );
      const zone = r.zone;
      if (!zone) continue;
      const c = ELEMENT_PALETTE[r.element];
      if (!this.zones.includes(z.id)) {
        this.zones[this.zoneAt] = z.id;
        this.zoneAt = (this.zoneAt + 1) % KNOWN_ZONES;
        if (zone.decal)
          this.fx.decal(
            z.center.x,
            z.center.y,
            zone.decal,
            c.color,
            z.radius,
            Math.max(0.3, z.expiresAt - s.time),
            0.45,
            0.6,
          );
      }
      // `perSecond` puffs, spread evenly over time (frame rate never changes the count).
      const rate = zone.plume.perSecond;
      const n = Math.floor(s.time * rate) - Math.floor(Math.max(0, this.lastTime) * rate);
      if (n > 0 && s.time > this.lastTime)
        this.fx.plume(
          z.center.x,
          z.center.y,
          z.radius * 0.8,
          c.color,
          Math.min(n, 4),
          zone.plume.tex,
          22,
        );
    }
  }
  private rememberImpact(id: string) {
    this.impacts[this.impactAt] = id;
    this.impactAt = (this.impactAt + 1) % RECENT_IMPACTS;
  }
  private motion(kind: 'lunge' | 'cast' | 'bow', dx: number, dy: number) {
    const sig = this.signals;
    sig.motion = kind;
    sig.dx = dx;
    sig.dy = dy;
  }
  /** Crits and boss hits freeze the struck pose; a crit on the boss also counts as heavy. */
  private struck(s: GameplaySnapshot, id: string, critical: boolean) {
    const boss = this.isBoss(s, id);
    if (!critical && !boss) return;
    const list = this.signals.hitStops;
    if (list.length < HIT_STOP_LIMIT && !list.includes(id)) list.push(id);
    if (critical && boss) this.signals.heavy = true;
  }
  private enemyAt(s: GameplaySnapshot, id: string) {
    for (const e of s.enemies) if (e.entityId === id) return e.position;
    return null;
  }
  private isBoss(s: GameplaySnapshot, id: string) {
    return s.campaign?.boss?.enemyId === id;
  }
}
