import type { CharacterClass } from '../../character-stats';
import type { ArtEntry, ArtKind, ArtManifest } from './art-manifest';
import type { ActId } from './biomes';
import type { TextureKey } from './keys';

/**
 * Task 25: which owner-art key replaces which procedural look (pure; no Phaser). Any look whose art
 * key is missing from the manifest, or whose image has not loaded (yet, or at all), keeps its
 * Task 18 procedural texture — partial packs work, and bosses / items / projectiles keep their art.
 */
export const UNIT_ART: Readonly<Partial<Record<TextureKey, string>>> = Object.freeze({
  'player-warrior': 'player_warrior',
  'player-mage': 'player_mage',
  'player-archer': 'player_archer',
  'player-rogue': 'player_rogue',
  'enemy-melee': 'enemy_melee',
  'enemy-ranged': 'enemy_ranged',
  'enemy-swift': 'enemy_swift_imp',
  'enemy-brute': 'enemy_stone_troll',
  'enemy-bombard': 'enemy_bombard_warlock',
  // Elite profiles keep the melee / ranged split (Task 08).
  'elite-melee': 'elite_savage_brute',
  'elite-ranged': 'elite_dark_conjurer',
  // Task 24 activity enemies.
  'activity-thief': 'enemy_treasure_thief',
  'activity-nest': 'nest_blight',
});
/**
 * Task 26: pickups and chests (closed state). Same per-look slots as the units, so the same
 * procedural fallback. Ore is never a world pickup (activity Ore is banked), so `ore` is UI only.
 */
export const PICKUP_ART: Readonly<Partial<Record<TextureKey, string>>> = Object.freeze({
  crystal: 'xp_crystal',
  coin: 'coin',
  'chest-wooden': 'chest_wooden',
  'chest-enchanted': 'chest_enchanted',
});
/** Task 26: the tiling ground texture of each act (I forest, II marsh, III ashlands, IV frost). */
export const GROUND_ART: Readonly<Record<ActId, string>> = Object.freeze({
  1: 'ground_forest',
  2: 'ground_marsh',
  3: 'ground_ashlands',
  4: 'ground_frost',
});
/** Task 26: the Gold and Ore badges in the menus (DOM `<img>`, emblem-style fallback). */
export const CURRENCY_ART: Readonly<Record<'gold' | 'ore', string>> = Object.freeze({
  gold: 'coin',
  ore: 'ore',
});
/** Character select / hub portrait of a class (DOM `<img>`, not a Phaser texture). */
export const portraitArtKey = (c: CharacterClass): string => `portrait_${c}`;
/** Phaser texture key of an art image (prefixed: never collides with a procedural key). */
export const artTextureKey = (artKey: string): string => `art:${artKey}`;

/** What an art key is used for; null = not used by this build (a later pack may add it early). */
export function artUsage(artKey: string): ArtKind | null {
  if (Object.values(UNIT_ART).includes(artKey)) return 'unit';
  if (/^portrait_(warrior|mage|archer|rogue)$/.test(artKey)) return 'portrait';
  if ((Object.values(GROUND_ART) as string[]).includes(artKey)) return 'ground';
  if (
    Object.values(PICKUP_ART).includes(artKey) ||
    (Object.values(CURRENCY_ART) as string[]).includes(artKey)
  )
    return 'pickup';
  return null;
}

interface Slot {
  readonly texture: string;
  readonly entry: ArtEntry;
  loaded: boolean;
}

/**
 * Resolves a procedural look to the texture to draw. `markLoaded` is called by the loader when an
 * image is ready; `texture(key)` then returns the art texture. Lookups allocate nothing (the slot
 * per look is built once from the manifest), so the render loop can call them every frame.
 */
export class ArtRegistry {
  private readonly slots = new Map<string, Slot>();
  private readonly byArt = new Map<string, Slot>();
  private readonly grounds = new Map<ActId, Slot>();
  constructor(manifest: ArtManifest) {
    const looks = [...Object.entries(UNIT_ART), ...Object.entries(PICKUP_ART)] as [
      TextureKey,
      string,
    ][];
    for (const [look, artKey] of looks) {
      const entry = manifest.get(artKey);
      if (!entry) continue;
      const slot: Slot = { texture: artTextureKey(artKey), entry, loaded: false };
      this.slots.set(look, slot);
      this.byArt.set(artKey, slot);
    }
    for (const [act, artKey] of Object.entries(GROUND_ART)) {
      const entry = manifest.get(artKey);
      if (!entry) continue;
      const slot: Slot = { texture: artTextureKey(artKey), entry, loaded: false };
      this.grounds.set(Number(act) as ActId, slot);
      this.byArt.set(artKey, slot);
    }
  }
  /** Unit art entries (Task 25). */
  unitEntries(): ArtEntry[] {
    const units = new Set(Object.values(UNIT_ART));
    return [...this.byArt.values()].filter((s) => units.has(s.entry.key)).map((s) => s.entry);
  }
  /**
   * Every manifest entry the in-run scene loads: units, pickups and grounds (Task 26). Portraits
   * and the currency-only `ore` image are DOM images loaded by the menus.
   */
  sceneEntries(): ArtEntry[] {
    return [...this.byArt.values()].map((s) => s.entry);
  }
  markLoaded(artKey: string): void {
    const slot = this.byArt.get(artKey);
    if (slot) slot.loaded = true;
  }
  /** The texture to draw for a look: its loaded art, else the procedural texture itself. */
  texture(key: TextureKey): string {
    const slot = this.slots.get(key);
    return slot && slot.loaded ? slot.texture : key;
  }
  /** The art entry drawn for a look (size / anchor), or null while it uses procedural art. */
  art(key: TextureKey): ArtEntry | null {
    const slot = this.slots.get(key);
    return slot && slot.loaded ? slot.entry : null;
  }
  /** Task 26: the act's tiling ground texture once loaded, else null (procedural ground). */
  ground(act: ActId): string | null {
    const slot = this.grounds.get(act);
    return slot && slot.loaded ? slot.texture : null;
  }
  /** Number of acts whose ground texture has loaded (diagnostics / tests). */
  loadedGrounds(): number {
    let n = 0;
    for (const slot of this.grounds.values()) if (slot.loaded) n++;
    return n;
  }
  /** Number of looks (units + pickups) currently drawn with art (diagnostics / tests). */
  loadedLooks(): number {
    let n = 0;
    for (const slot of this.slots.values()) if (slot.loaded) n++;
    return n;
  }
}
