import type { CharacterClass } from '../../character-stats';
import type { ArtEntry, ArtManifest } from './art-manifest';
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
/** Character select / hub portrait of a class (DOM `<img>`, not a Phaser texture). */
export const portraitArtKey = (c: CharacterClass): string => `portrait_${c}`;
/** Phaser texture key of an art image (prefixed: never collides with a procedural key). */
export const artTextureKey = (artKey: string): string => `art:${artKey}`;

/** What an art key is used for; null = not used by this build (a later pack may add it early). */
export function artUsage(artKey: string): 'unit' | 'portrait' | null {
  if (Object.values(UNIT_ART).includes(artKey)) return 'unit';
  if (/^portrait_(warrior|mage|archer|rogue)$/.test(artKey)) return 'portrait';
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
  constructor(manifest: ArtManifest) {
    for (const [look, artKey] of Object.entries(UNIT_ART) as [TextureKey, string][]) {
      const entry = manifest.get(artKey);
      if (!entry) continue;
      const slot: Slot = { texture: artTextureKey(artKey), entry, loaded: false };
      this.slots.set(look, slot);
      this.byArt.set(artKey, slot);
    }
  }
  /** Manifest entries the in-run scene should load (unit art only; portraits are DOM images). */
  unitEntries(): ArtEntry[] {
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
  /** Number of looks currently drawn with art (diagnostics / tests). */
  loadedLooks(): number {
    let n = 0;
    for (const slot of this.slots.values()) if (slot.loaded) n++;
    return n;
  }
}
