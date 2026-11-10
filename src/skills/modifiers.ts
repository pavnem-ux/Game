import type { EffectDefinition } from '../status-effects';
import { getSkill } from './catalog';
import type { CombatTag, SkillParams } from './types';

/**
 * Pure skill-side damage modifiers shared by the combat runtime (SkillEngine) and the read-only
 * damage readout, so both always apply the same rules exactly once. `rankOf` returns 0 when a
 * skill is not acquired.
 */
export type RankLookup = (skillId: string) => number;
const params = (skillId: string, rank: number): SkillParams => getSkill(skillId).ranks[rank - 1];

/**
 * Elemental Mastery coefficient factor for fire/ice skill attacks (applied to the attack
 * coefficient before Combat Core). `alternationStacks` are the current rank-V alternation stacks.
 */
export function elementalDamageMultiplier(
  rankOf: RankLookup,
  tags: ReadonlySet<CombatTag>,
  alternationStacks = 0,
): number {
  const rank = rankOf('elemental_mastery');
  if (rank === 0 || !(tags.has('fire') || tags.has('ice'))) return 1;
  const p = params('elemental_mastery', rank);
  return 1 + (p.elementalDamagePercent + alternationStacks * p.alternateBonusPercent) / 100;
}

/** Player status applications: Toxic Mastery, Lingering Effects and Elemental Mastery Burn. */
export function modifyPlayerEffect(
  definition: EffectDefinition,
  rankOf: RankLookup,
): EffectDefinition {
  let damage = definition.rawDamagePerTick,
    duration = definition.duration;
  const toxic = rankOf('toxic_mastery');
  if (toxic > 0) damage *= 1 + params('toxic_mastery', toxic).dotDamagePercent / 100;
  const lingering = rankOf('lingering_effects');
  if (lingering > 0)
    duration *= 1 + params('lingering_effects', lingering).dotDurationPercent / 100;
  const mastery = rankOf('elemental_mastery');
  if (definition.effectType === 'burn' && mastery > 0)
    damage *= 1 + params('elemental_mastery', mastery).burnDamagePercent / 100;
  return Object.freeze({ ...definition, rawDamagePerTick: damage, duration });
}
