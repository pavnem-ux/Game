import { GameplayWorld, ALPHA_ENEMIES } from '../../src/gameplay';
import type { CharacterClass } from '../../src/character-stats';
import { SKILL_CATALOG } from '../../src/skills';

export const stationaryMelee = { ...ALPHA_ENEMIES.melee, movementSpeed: 0 };
export const stationaryRanged = { ...ALPHA_ENEMIES.ranged, movementSpeed: 0 };
/** Isolated deterministic world: no automatic spawns, player protected unless asked otherwise. */
export function arena(
  characterClass: CharacterClass,
  options: { level?: number; protect?: boolean; seed?: number; onHit?: [] } = {},
): GameplayWorld {
  const w = new GameplayWorld({
    characterClass,
    level: options.level ?? 1,
    seed: options.seed ?? 7,
    initialEnemies: false,
    spawning: { enabled: false },
    ...(options.onHit ? { onHit: options.onHit } : {}),
  });
  if (options.protect !== false) w.setTestProtection(true);
  return w;
}
export function ring(w: GameplayWorld, count: number, distance: number, profile = stationaryMelee) {
  return Array.from({ length: count }, (_, i) =>
    w.spawnEnemy('melee', distance, (i * Math.PI * 2) / count, profile),
  );
}
export const autoSkills = (c: CharacterClass) =>
  SKILL_CATALOG.filter((d) => d.owner === c && d.kind === 'auto').map((d) => d.id);
export const skillEvents = (w: GameplayWorld, type: string) =>
  w.getEvents().filter((e) => e.channel === 'skill' && e.event.type === type);
/** Resolve every queued level-up by choosing the first card. */
export function resolveOffers(w: GameplayWorld) {
  while (w.run.currentOffer) {
    const c = w.run.currentOffer.cards[0];
    w.chooseSkill(c.kind === 'skill' ? c.skillId : `bonus:${c.bonusId}`);
  }
}
/** Run `seconds` of simulation while resolving any level-up offers in between. */
export function play(w: GameplayWorld, seconds: number, step = 0.05) {
  const end = w.time + seconds;
  while (w.time < end - 1e-9) {
    resolveOffers(w);
    w.update(Math.min(step, end - w.time));
    if (w.survival.getState().runState !== 'active') break;
  }
}
/**
 * Task 07.2 v2: one acquired-skill set per class that completes a workbook pair for all three
 * class synergies (fits the 4 automatic + 6 passive slots).
 */
export const ALL_SYNERGY_SKILLS: Readonly<Record<CharacterClass, readonly string[]>> = {
  mage: ['fireball', 'frost_nova', 'flame_burst', 'ice_shards'],
  warrior: ['shield_bash', 'cleave', 'earthquake', 'battle_fury'],
  archer: ['toxic_volley', 'split_shot', 'hunters_mark'],
  rogue: ['blood_blades', 'blade_flurry', 'death_mark'],
};
export function unlockClassSynergies(w: GameplayWorld, c: CharacterClass, rank = 1) {
  for (const skill of ALL_SYNERGY_SKILLS[c]) w.grantTestSkill(skill, rank);
}
