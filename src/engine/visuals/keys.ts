import type { ActivityType } from '../../gameplay/activities';
import type { CharacterClass } from '../../character-stats';
import type { EnemyKind } from '../../gameplay/enemy-types';
import type { PetId } from '../../pets/config';

/**
 * Task 18 sprite texture keys (pure; no Phaser). Every unit/item look is drawn once into a texture
 * at boot (`texture-factory.ts`) and rendered with pooled sprites.
 */
export const CLASS_KEYS = Object.freeze(['warrior', 'mage', 'archer', 'rogue'] as const);
export const ENEMY_KIND_KEYS = Object.freeze([
  'melee',
  'ranged',
  'swift',
  'brute',
  'bombard',
] as const satisfies readonly EnemyKind[]);
export type UnitRole = 'normal' | 'elite' | 'boss';
export const TEXTURE_KEYS = Object.freeze([
  'player-warrior',
  'player-mage',
  'player-archer',
  'player-rogue',
  'enemy-melee',
  'enemy-ranged',
  'enemy-swift',
  'enemy-brute',
  'enemy-bombard',
  'elite-melee',
  'elite-ranged',
  'boss',
  'proj-bolt',
  'proj-arrow',
  'proj-enemy',
  'crystal',
  'coin',
  'chest-wooden',
  'chest-enchanted',
  'shadow',
  'glow',
  // Task 20 pets.
  'pet-firefly',
  'pet-owlet',
  'pet-fox',
  'pet-hedgehog',
  'pet-kitten',
  'pet-wolf',
  // Task 24 map activities.
  'activity-shrine',
  'activity-lantern',
  'activity-lantern-lit',
  'activity-thief',
  'activity-nest',
  // Task 38 map activities.
  'activity-snare',
  'activity-altar',
  'activity-chain',
  'activity-seals',
  'activity-seal',
] as const);
export type TextureKey = (typeof TEXTURE_KEYS)[number];

export const playerTextureKey = (c: CharacterClass): TextureKey => `player-${c}`;
/** Elites and bosses keep the melee/ranged profiles; normal enemies use their kind. */
export function enemyTextureKey(kind: EnemyKind, role: UnitRole, ranged: boolean): TextureKey {
  if (role === 'boss') return 'boss';
  if (role === 'elite') return ranged ? 'elite-ranged' : 'elite-melee';
  return `enemy-${kind}`;
}
/** Player projectiles: the archer's basic attack is an arrow, everything else a glowing bolt. */
export function playerProjectileKey(weaponId: string, characterClass: CharacterClass): TextureKey {
  return characterClass === 'archer' && !weaponId.startsWith('skill:') ? 'proj-arrow' : 'proj-bolt';
}
export const chestTextureKey = (type: 'wooden' | 'enchanted'): TextureKey => `chest-${type}`;
/**
 * Task 24: activity looks (the lantern has a lit variant after a successful defence). Task 38: the
 * Lantern Chain's cold lanterns, the snare, the altar and the sealed chest (seals: `activity-seal`).
 */
export const activityTextureKey = (type: ActivityType, lit = false): TextureKey =>
  type === 'lantern' && lit ? 'activity-lantern-lit' : `activity-${type}`;
/** Task 20: one texture per pet. */
export const petTextureKey = (id: PetId): TextureKey => `pet-${id}`;

/**
 * Art is drawn at this scale into textures and displayed at 1 / ART_SCALE. 1: the Canvas renderer
 * draws at CSS resolution, so 1:1 textures avoid a downscale on every draw (measured faster).
 */
export const ART_SCALE = 1;
/** Texture size (px) per key; units are centred, items too. */
export function textureSize(key: TextureKey): number {
  if (key === 'boss') return 112 * ART_SCALE;
  if (key.startsWith('elite')) return 64 * ART_SCALE;
  if (key === 'glow') return 128;
  if (key.startsWith('proj')) return 32 * ART_SCALE;
  if (key === 'shadow') return 48 * ART_SCALE;
  return 64 * ART_SCALE;
}
/** Display scale of a unit texture for the simulation radius (elites/bosses scale with radius). */
export function unitScale(role: UnitRole, radius: number, ranged: boolean): number {
  if (role === 'boss') return Math.max(0.6, radius / 34) / ART_SCALE;
  if (role === 'elite') return radius / (ranged ? 15 : 14) / 1.5 / ART_SCALE;
  return 1 / ART_SCALE;
}
