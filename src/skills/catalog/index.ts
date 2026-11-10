import type { CharacterClass } from '../../character-stats';
import type { SkillDefinition } from '../types';
import { SKILL_RULES } from '../config';
import { ARCHER_SKILLS } from './archer';
import { MAGE_SKILLS } from './mage';
import { ROGUE_SKILLS } from './rogue';
import { UNIVERSAL_SKILLS } from './universal';
import { WARRIOR_SKILLS } from './warrior';

/** Validates the data-driven catalogue before any run can use it. Throws on malformed tuning. */
export function validateCatalog(
  definitions: readonly SkillDefinition[],
): readonly SkillDefinition[] {
  const ids = new Set<string>();
  for (const d of definitions) {
    if (!/^[a-z_]+$/.test(d.id)) throw new TypeError(`Invalid skill id: ${d.id}.`);
    if (ids.has(d.id)) throw new Error(`Duplicate skill id: ${d.id}.`);
    ids.add(d.id);
    if (d.maxRank !== SKILL_RULES.maxRank || d.ranks.length !== SKILL_RULES.maxRank)
      throw new RangeError(`${d.id} must define exactly ${SKILL_RULES.maxRank} ranks.`);
    if (d.rankSummaries.length !== SKILL_RULES.maxRank || d.rankSummaries.some((s) => !s.trim()))
      throw new RangeError(`${d.id} needs a summary for every rank.`);
    const keys = Object.keys(d.ranks[0]).sort().join();
    for (const rank of d.ranks) {
      if (Object.keys(rank).sort().join() !== keys)
        throw new TypeError(`${d.id}: every rank must define the same parameters.`);
      for (const [key, value] of Object.entries(rank))
        if (!Number.isFinite(value) || value < 0)
          throw new RangeError(`${d.id}.${key} must be a finite non-negative number.`);
    }
    if (d.kind === 'auto' && !d.ranks.every((r) => r.cooldown > 0))
      throw new RangeError(`${d.id}: automatic skills need a positive cooldown at every rank.`);
  }
  return Object.freeze([...definitions]);
}

/** All 37 definitions: 4 × (6 automatic + 1 class passive) + 9 universal passives. */
export const SKILL_CATALOG: readonly SkillDefinition[] = validateCatalog([
  ...MAGE_SKILLS,
  ...WARRIOR_SKILLS,
  ...ARCHER_SKILLS,
  ...ROGUE_SKILLS,
  ...UNIVERSAL_SKILLS,
]);
const BY_ID = new Map(SKILL_CATALOG.map((d) => [d.id, d] as const));
export function getSkill(id: string): SkillDefinition {
  const definition = BY_ID.get(id);
  if (!definition) throw new Error(`Unknown skill: ${id}.`);
  return definition;
}
/** The 16 definitions a class may ever see: its own 7 plus the 9 universal passives. */
export function skillsForClass(
  characterClass: CharacterClass,
  catalog: readonly SkillDefinition[] = SKILL_CATALOG,
): readonly SkillDefinition[] {
  return catalog.filter((d) => d.owner === characterClass || d.owner === 'universal');
}
export { MAGE_SKILLS, WARRIOR_SKILLS, ARCHER_SKILLS, ROGUE_SKILLS, UNIVERSAL_SKILLS };
