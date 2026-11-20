import type { CharacterClass } from '../../character-stats';
import { SKILL_CATALOG, SYNERGY_RULES } from '../../skills';
import { TALENT_CATALOG_DATA } from '../../talents';
import { GEAR_TEMPLATES, STARTER_WEAPONS } from '../../equipment/config';
import { PET_IDS } from '../../pets/config';
import {
  SKILL_ICON_KEY_PREFIX,
  SYNERGY_ICON_KEY_PREFIX,
  TALENT_BRANCH_KEY_PREFIX,
  ITEM_ICON_KEY_PREFIX,
  PET_ART_KEY_PREFIX,
} from './art-manifest';
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
/**
 * Task 30: the in-run pet follower (one look per pet). Same per-look slots as the units and pickups,
 * so the same loader and procedural fallback; the menus use `petArtEntry` for portraits.
 */
export const PET_ART: Readonly<Partial<Record<TextureKey, string>>> = Object.freeze(
  Object.fromEntries(PET_IDS.map((id) => [`pet-${id}`, `pet_${id}`])),
);
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
/**
 * Task 27: the art key of a skill's icon (`skill_<id>`, one per catalogue skill: 28 class skills +
 * 9 universal passives). Icons are DOM `<img>` in the React screens; the catalogue glyph
 * (`SkillDefinition.icon`) stays the fallback.
 */
export const skillIconArtKey = (skillId: string): string => `${SKILL_ICON_KEY_PREFIX}${skillId}`;
const SKILL_ICON_KEYS: ReadonlySet<string> = new Set(
  SKILL_CATALOG.map((d) => skillIconArtKey(d.id)),
);
/**
 * The icon entry of a skill, or null (no manifest yet, no icon for the id, or an entry of another
 * kind): callers then show the glyph.
 */
export function skillIconEntry(manifest: ArtManifest | null, skillId: string): ArtEntry | null {
  const entry = manifest?.get(skillIconArtKey(skillId));
  return entry && entry.kind === 'skill-icon' ? entry : null;
}
/** Every skill icon in the manifest (for preloading; catalogue skills only). */
export function skillIconEntries(manifest: ArtManifest | null): ArtEntry[] {
  return SKILL_CATALOG.map((d) => skillIconEntry(manifest, d.id)).filter(
    (e): e is ArtEntry => e !== null,
  );
}
/**
 * Task 28: the icon of a synergy (`synergy_<id>`, one per rule in `SYNERGY_RULES`). Null (no
 * manifest, unknown id, missing icon or an entry of another kind) keeps the current look.
 */
export const synergyIconArtKey = (synergyId: string): string =>
  `${SYNERGY_ICON_KEY_PREFIX}${synergyId}`;
const SYNERGY_ICON_KEYS: ReadonlySet<string> = new Set(
  SYNERGY_RULES.map((r) => synergyIconArtKey(r.id)),
);
export function synergyIconEntry(manifest: ArtManifest | null, synergyId: string): ArtEntry | null {
  const entry = manifest?.get(synergyIconArtKey(synergyId));
  return entry && entry.kind === 'synergy-icon' ? entry : null;
}
/** Every synergy icon in the manifest (for preloading; known synergies only). */
export function synergyIconEntries(manifest: ArtManifest | null): ArtEntry[] {
  return SYNERGY_RULES.map((r) => synergyIconEntry(manifest, r.id)).filter(
    (e): e is ArtEntry => e !== null,
  );
}
/**
 * Task 28: the emblem of a talent branch, looked up by class + branch number (the manifest's
 * `characterClass` / `branch` fields), not by its key. Null keeps the current look.
 */
export function talentBranchIconEntry(
  manifest: ArtManifest | null,
  characterClass: CharacterClass,
  branch: number,
): ArtEntry | null {
  if (!manifest) return null;
  for (const entry of manifest.values())
    if (
      entry.kind === 'talent-branch-icon' &&
      entry.talentBranch?.characterClass === characterClass &&
      entry.talentBranch.branch === branch
    )
      return entry;
  return null;
}
/** Every talent branch emblem in the manifest that matches a catalog branch (for preloading). */
export function talentBranchIconEntries(manifest: ArtManifest | null): ArtEntry[] {
  return TALENT_CATALOG_DATA.branches
    .map((b) => talentBranchIconEntry(manifest, b.characterClass, b.branch))
    .filter((e): e is ArtEntry => e !== null);
}
/** Key a pack uses for a branch emblem: `talent_branch_` + the branch name as a slug. */
export const talentBranchArtKey = (branchName: string): string =>
  `${TALENT_BRANCH_KEY_PREFIX}${branchName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')}`;
const TALENT_BRANCH_KEYS: ReadonlySet<string> = new Set(
  TALENT_CATALOG_DATA.branches.map((b) => talentBranchArtKey(b.name)),
);
/**
 * Task 30: the icon of a gear template (`item_<template id>`: 26 templates + 4 starter weapons).
 * Every tier of a template shares its icon (`GearItem.templateId`); the tier frame / colour and the
 * forge badge stay in the UI. Null (no manifest, unknown id, other kind) keeps the current look.
 */
export const itemIconArtKey = (templateId: string): string =>
  `${ITEM_ICON_KEY_PREFIX}${templateId}`;
/** All template ids that have (or should have) an icon: gear templates, then starter weapons. */
export const ITEM_TEMPLATE_IDS: readonly string[] = Object.freeze([
  ...GEAR_TEMPLATES.map((t) => t.id),
  ...Object.values(STARTER_WEAPONS).map((w) => w.id),
]);
const ITEM_ICON_KEYS: ReadonlySet<string> = new Set(ITEM_TEMPLATE_IDS.map(itemIconArtKey));
export function itemIconEntry(manifest: ArtManifest | null, templateId: string): ArtEntry | null {
  const entry = manifest?.get(itemIconArtKey(templateId));
  return entry && entry.kind === 'item-icon' ? entry : null;
}
/** Every item icon in the manifest (for preloading; known templates only). */
export function itemIconEntries(manifest: ArtManifest | null): ArtEntry[] {
  return ITEM_TEMPLATE_IDS.map((id) => itemIconEntry(manifest, id)).filter(
    (e): e is ArtEntry => e !== null,
  );
}
/**
 * Task 30: a pet's sprite (`pet_<pet id>`, 256 px, bottom-centre anchor): the in-run follower and
 * the pet portraits in the menus. Null keeps the procedural / SVG look.
 */
export const petArtKey = (petId: string): string => `${PET_ART_KEY_PREFIX}${petId}`;
const PET_ART_KEYS: ReadonlySet<string> = new Set(PET_IDS.map(petArtKey));
export function petArtEntry(manifest: ArtManifest | null, petId: string): ArtEntry | null {
  const entry = manifest?.get(petArtKey(petId));
  return entry && entry.kind === 'pet' ? entry : null;
}
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
  if (SKILL_ICON_KEYS.has(artKey)) return 'skill-icon';
  if (SYNERGY_ICON_KEYS.has(artKey)) return 'synergy-icon';
  if (TALENT_BRANCH_KEYS.has(artKey)) return 'talent-branch-icon';
  if (ITEM_ICON_KEYS.has(artKey)) return 'item-icon';
  if (PET_ART_KEYS.has(artKey)) return 'pet';
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
    const looks = [
      ...Object.entries(UNIT_ART),
      ...Object.entries(PICKUP_ART),
      ...Object.entries(PET_ART),
    ] as [TextureKey, string][];
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
