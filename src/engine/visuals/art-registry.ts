import type { CharacterClass } from '../../character-stats';
import { SKILL_CATALOG, SYNERGY_RULES } from '../../skills';
import { TALENT_CATALOG_DATA } from '../../talents';
import { GEAR_TEMPLATES, STARTER_WEAPONS } from '../../equipment/config';
import { PET_IDS } from '../../pets/config';
import { BOSS_DEFINITIONS } from '../../campaign/bosses';
import {
  SKILL_ICON_KEY_PREFIX,
  SYNERGY_ICON_KEY_PREFIX,
  TALENT_BRANCH_KEY_PREFIX,
  ITEM_ICON_KEY_PREFIX,
  PET_ART_KEY_PREFIX,
  DECOR_KEY_PREFIX,
  BOSS_ART_KEY_PREFIX,
  SUMMON_ART_KEY_PREFIX,
} from './art-manifest';
import type { ArtDecorBiome } from './art-manifest';
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
/**
 * Task 31 (pack 7). Decor props come from the manifest (`kind: decor`, `act`, `tall`): each act uses
 * the props of its biome. Backgrounds and the emblem are DOM images (backgrounds lazy-loaded by
 * their screen, never by the boot / scene preload). Buff, currency, open-chest and activity art map
 * to fixed keys; every missing key keeps the current look.
 */
export const DECOR_BIOME_ACT: Readonly<Record<ArtDecorBiome, ActId>> = Object.freeze({
  forest: 1,
  marsh: 2,
  ashlands: 3,
  frost: 4,
});
export const BACKGROUND_ART: Readonly<Record<'menu' | ActId, string>> = Object.freeze({
  menu: 'bg_menu',
  1: 'bg_act1_forest',
  2: 'bg_act2_marsh',
  3: 'bg_act3_ashlands',
  4: 'bg_act4_frost',
});
export const EMBLEM_ART = 'emblem';
/** HUD buff icons and pickup popups (`magnet` is a chest content, not a timed buff). */
export const BUFF_ART: Readonly<Record<'fury' | 'haste' | 'lightStep' | 'magnet', string>> =
  Object.freeze({
    fury: 'buff_fury',
    haste: 'buff_quick_hands',
    lightStep: 'buff_light_step',
    magnet: 'buff_magnet',
  });
/** Task 31: the Gold / Ore UI badges (the in-run pickups keep `coin` / `ore`). */
export const CURRENCY_ICON_ART: Readonly<Record<'gold' | 'ore', string>> = Object.freeze({
  gold: 'icon_gold',
  ore: 'icon_ore',
});
/** Open chest frames (scene), keyed by chest type. */
export const CHEST_OPEN_ART: Readonly<Record<'wooden' | 'enchanted', string>> = Object.freeze({
  wooden: 'chest_wooden_open',
  enchanted: 'chest_enchanted_open',
});
/** Activity objects (scene): the shrine, the Dying Lantern before / after activation. */
export const ACTIVITY_ART: Readonly<Record<'shrine' | 'lanternUnlit' | 'lanternLit', string>> =
  Object.freeze({
    shrine: 'shrine_embers',
    lanternUnlit: 'lantern_unlit',
    lanternLit: 'lantern_lit',
  });
/** The UI icon for Gold / Ore: the pack-7 badge icon, else the Task 26 pickup art, else null. */
export function currencyIconEntry(
  manifest: ArtManifest | null,
  kind: 'gold' | 'ore',
): ArtEntry | null {
  const icon = manifest?.get(CURRENCY_ICON_ART[kind]);
  if (icon && icon.kind === 'currency-icon') return icon;
  return manifest?.get(CURRENCY_ART[kind]) ?? null;
}
/** A background (`menu` or act 1–4) for the menus, or null (the current kit backdrop stays). */
export function backgroundEntry(
  manifest: ArtManifest | null,
  which: 'menu' | ActId,
): ArtEntry | null {
  const entry = manifest?.get(BACKGROUND_ART[which]);
  return entry && entry.kind === 'background' ? entry : null;
}
/** The decor props of an act from the manifest (manifest order), or [] (procedural decor). */
export function decorEntriesForAct(manifest: ArtManifest | null, act: ActId): ArtEntry[] {
  if (!manifest) return [];
  return [...manifest.values()].filter(
    (e) => e.kind === 'decor' && e.decor && DECOR_BIOME_ACT[e.decor.act] === act,
  );
}
const FIXED_KEYS: ReadonlyMap<string, ArtKind> = new Map<string, ArtKind>([
  ...Object.values(BACKGROUND_ART).map((k) => [k, 'background'] as [string, ArtKind]),
  [EMBLEM_ART, 'ui'],
  ...Object.values(BUFF_ART).map((k) => [k, 'buff-icon'] as [string, ArtKind]),
  ...Object.values(CURRENCY_ICON_ART).map((k) => [k, 'currency-icon'] as [string, ArtKind]),
  ...Object.values(CHEST_OPEN_ART).map((k) => [k, 'chest-open'] as [string, ArtKind]),
  ...Object.values(ACTIVITY_ART).map((k) => [k, 'activity'] as [string, ArtKind]),
]);
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
/**
 * Task 32 (pack 8): the sprite of a campaign boss (`boss_<boss id>`, 512 px, feet anchor, facing
 * right). Lazy: the run loads only its map's boss, the map-path panel only the selected map's boss;
 * never part of `sceneEntries` (the boot / scene preload). Missing → the procedural boss stays.
 */
export const bossArtKey = (bossId: string): string => `${BOSS_ART_KEY_PREFIX}${bossId}`;
const BOSS_ART_KEYS: ReadonlySet<string> = new Set(Object.keys(BOSS_DEFINITIONS).map(bossArtKey));
/** The sprite entry of a campaign boss, or null (unknown id, no manifest, other kind). */
export function bossArtEntry(manifest: ArtManifest | null, bossId: string): ArtEntry | null {
  const key = bossArtKey(bossId);
  if (!BOSS_ART_KEYS.has(key)) return null;
  const entry = manifest?.get(key);
  return entry && entry.kind === 'boss' ? entry : null;
}
export function petArtEntry(manifest: ArtManifest | null, petId: string): ArtEntry | null {
  const entry = manifest?.get(petArtKey(petId));
  return entry && entry.kind === 'pet' ? entry : null;
}
/**
 * Task 34 (pack 9): sprites of talent-spawned objects (`summon_<id>`, feet anchor, facing right),
 * preloaded with the scene. Missing → the Task 09.1 shape stays.
 */
export const SUMMON_IDS = Object.freeze(['ballista'] as const);
export type SummonId = (typeof SUMMON_IDS)[number];
export const summonArtKey = (id: string): string => `${SUMMON_ART_KEY_PREFIX}${id}`;
const SUMMON_ART_KEYS: ReadonlySet<string> = new Set(SUMMON_IDS.map(summonArtKey));
/** The sprite entry of a summon, or null (unknown id, no manifest, other kind). */
export function summonArtEntry(manifest: ArtManifest | null, id: string): ArtEntry | null {
  const key = summonArtKey(id);
  if (!SUMMON_ART_KEYS.has(key)) return null;
  const entry = manifest?.get(key);
  return entry && entry.kind === 'summon' ? entry : null;
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
  if (BOSS_ART_KEYS.has(artKey)) return 'boss';
  if (SUMMON_ART_KEYS.has(artKey)) return 'summon';
  if (artKey.startsWith(DECOR_KEY_PREFIX)) return 'decor';
  return FIXED_KEYS.get(artKey) ?? null;
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
  /** Task 31: decor props per act, and scene objects (open chests, activities) by art key. */
  private readonly decor = new Map<ActId, Slot[]>();
  private readonly extras = new Map<string, Slot>();
  /** Task 32: boss sprites by boss id (lazy: kept out of `byArt`, so out of the scene preload). */
  private readonly bosses = new Map<string, Slot>();
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
    for (const act of [1, 2, 3, 4] as ActId[]) {
      const slots = decorEntriesForAct(manifest, act).map((entry) => {
        const slot: Slot = { texture: artTextureKey(entry.key), entry, loaded: false };
        this.byArt.set(entry.key, slot);
        return slot;
      });
      this.decor.set(act, slots);
    }
    for (const artKey of [...Object.values(CHEST_OPEN_ART), ...Object.values(ACTIVITY_ART)]) {
      const entry = manifest.get(artKey);
      if (!entry) continue;
      const slot: Slot = { texture: artTextureKey(artKey), entry, loaded: false };
      this.extras.set(artKey, slot);
      this.byArt.set(artKey, slot);
    }
    for (const id of SUMMON_IDS) {
      const entry = summonArtEntry(manifest, id);
      if (!entry) continue;
      const slot: Slot = { texture: artTextureKey(entry.key), entry, loaded: false };
      this.extras.set(entry.key, slot);
      this.byArt.set(entry.key, slot);
    }
    for (const bossId of Object.keys(BOSS_DEFINITIONS)) {
      const entry = bossArtEntry(manifest, bossId);
      if (entry)
        this.bosses.set(bossId, { texture: artTextureKey(entry.key), entry, loaded: false });
    }
  }
  /** Task 34: a summon's loaded sprite (ballista), else null (the Task 09.1 shape is drawn). */
  summon(id: string): { readonly texture: string; readonly entry: ArtEntry } | null {
    return this.object(summonArtKey(id));
  }
  /** Task 32: the sprite entry to load lazily for a boss, or null (procedural boss). */
  bossEntry(bossId: string): ArtEntry | null {
    return this.bosses.get(bossId)?.entry ?? null;
  }
  /** Task 32: a boss's loaded sprite, else null (the procedural boss is drawn until it loads). */
  boss(bossId: string): { readonly texture: string; readonly entry: ArtEntry } | null {
    const slot = this.bosses.get(bossId);
    return slot && slot.loaded ? slot : null;
  }
  /**
   * Task 31: the act's decor props once every one of them has loaded (one consistent set: never a
   * mix of art and procedural props), else null (the procedural decor stays).
   */
  decorProps(act: ActId): readonly { readonly texture: string; readonly entry: ArtEntry }[] | null {
    const slots = this.decor.get(act);
    if (!slots || slots.length === 0 || slots.some((s) => !s.loaded)) return null;
    return slots;
  }
  /** Task 31: a loaded scene object (open chest, shrine, lantern) by art key, else null. */
  object(artKey: string): { readonly texture: string; readonly entry: ArtEntry } | null {
    const slot = this.extras.get(artKey);
    return slot && slot.loaded ? slot : null;
  }
  /** Unit art entries (Task 25). */
  unitEntries(): ArtEntry[] {
    const units = new Set(Object.values(UNIT_ART));
    return [...this.byArt.values()].filter((s) => units.has(s.entry.key)).map((s) => s.entry);
  }
  /**
   * Every manifest entry the in-run scene loads: units, pickups and grounds (Task 26), pets
   * (Task 30), decor, open chests and activity objects (Task 31). Portraits, icons, the emblem and
   * the menu backgrounds are DOM images loaded by the menus (backgrounds lazily, per screen). Boss
   * sprites (Task 32) are loaded lazily per run (`loadBossArt`), never here.
   */
  sceneEntries(): ArtEntry[] {
    return [...this.byArt.values()].map((s) => s.entry);
  }
  markLoaded(artKey: string): void {
    const slot = this.byArt.get(artKey);
    if (slot) slot.loaded = true;
    if (artKey.startsWith(BOSS_ART_KEY_PREFIX)) {
      const boss = this.bosses.get(artKey.slice(BOSS_ART_KEY_PREFIX.length));
      if (boss) boss.loaded = true;
    }
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
