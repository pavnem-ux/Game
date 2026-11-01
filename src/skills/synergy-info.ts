import type { CharacterClass } from '../character-stats';
import { getSkill, skillsForClass } from './catalog';
import { SYNERGY_RULES, skillUnlocksSynergy } from './synergies';
import type { SynergyId, SynergyRule } from './synergies';
import type { CombatTag } from './types';

/**
 * Player-facing synergy information derived only from SYNERGY_RULES and the skill catalogue.
 * Nothing here decides combat: "available" means the prerequisite is met, not that the trigger
 * has happened. The combat resolver uses the same `skillUnlocksSynergy` check.
 */

/** UI wording for prerequisite tags (presentation only; rules live in SYNERGY_RULES). */
export const SYNERGY_TAG_LABELS: Readonly<Partial<Record<CombatTag, string>>> = Object.freeze({
  ice: 'ледяной навык',
  fire: 'огненный навык',
  melee: 'навык ближнего боя',
  heavy_melee: 'тяжёлый удар ближнего боя',
  projectile: 'навык со снарядами',
  poison: 'навык с ядом (Poison)',
  dagger: 'навык с кинжалами',
  mark: 'навык-метка',
  bleed: 'навык с кровотечением (Bleed)',
  burn: 'навык с горением (Burn)',
  slow: 'навык с замедлением (Slow)',
  stun: 'навык с оглушением (Stun)',
});
export interface SynergySkillRef {
  readonly skillId: string;
  readonly name: string;
  readonly icon: string;
  readonly owned: boolean;
}
export interface SynergyInfo {
  readonly id: SynergyId;
  readonly name: string;
  readonly condition: string;
  readonly effect: string;
  readonly status: 'available' | 'locked';
  /** Human-readable prerequisite, e.g. "ледяной навык". */
  readonly requirement: string;
  /** Every class skill that would satisfy the prerequisite, with ownership. */
  readonly unlockingSkills: readonly SynergySkillRef[];
  /** Acquired skills that currently satisfy it (empty while locked). */
  readonly contributors: readonly string[];
  /** What is still missing, or which skill opened it. */
  readonly explanation: string;
}
export interface SynergyRef {
  readonly id: SynergyId;
  readonly name: string;
}
export interface CardSynergyHints {
  /** Rules that are locked now and become available if this card is chosen. */
  readonly unlocks: readonly SynergyRef[];
  /** Rules already available that this skill would also feed, with the owned skills it pairs with. */
  readonly combinesWith: readonly {
    readonly synergy: SynergyRef;
    readonly ownedSkills: readonly string[];
  }[];
  /** For upgrades of an owned skill: rules it already opens (nothing new). */
  readonly alreadyOpened: readonly SynergyRef[];
}
const NONE: CardSynergyHints = Object.freeze({ unlocks: [], combinesWith: [], alreadyOpened: [] });

export function rulesForClass(characterClass: CharacterClass): readonly SynergyRule[] {
  return SYNERGY_RULES.filter((rule) => rule.characterClass === characterClass);
}
export function requirementText(rule: Pick<SynergyRule, 'requiredSkillTags'>): string {
  return rule.requiredSkillTags.map((tag) => SYNERGY_TAG_LABELS[tag] ?? tag).join(' или ');
}
function unlocked(rule: SynergyRule, ownedIds: readonly string[]): boolean {
  return ownedIds.some((id) => skillUnlocksSynergy(rule, getSkill(id)));
}
const listNames = (names: readonly string[]) => names.join(', ');

/** Overview of the class's synergies for the current acquired skills. */
export function synergyOverview(
  characterClass: CharacterClass,
  ownedIds: readonly string[],
): readonly SynergyInfo[] {
  const owned = new Set(ownedIds);
  const classSkills = skillsForClass(characterClass);
  return Object.freeze(
    rulesForClass(characterClass).map((rule) => {
      const unlockingSkills = classSkills
        .filter((skill) => skillUnlocksSynergy(rule, skill))
        .map((skill) =>
          Object.freeze({
            skillId: skill.id,
            name: skill.name,
            icon: skill.icon,
            owned: owned.has(skill.id),
          }),
        );
      const contributors = unlockingSkills.filter((s) => s.owned).map((s) => s.name);
      const available = contributors.length > 0;
      const requirement = requirementText(rule);
      return Object.freeze({
        id: rule.id,
        name: rule.name,
        condition: rule.condition,
        effect: rule.effect,
        status: available ? 'available' : 'locked',
        requirement,
        unlockingSkills: Object.freeze(unlockingSkills),
        contributors: Object.freeze(contributors),
        explanation: available
          ? `Открыто навыком: ${listNames(contributors)}. Сработает в бою, когда выполнится условие.`
          : `Не хватает: ${requirement}. Подойдёт: ${listNames(unlockingSkills.map((s) => s.name))}.`,
      } satisfies SynergyInfo);
    }),
  );
}

/**
 * Hints for one offered card. A new skill reports rules it would newly unlock and rules it would
 * also feed (already open through owned skills). An upgrade never claims a new unlock.
 * Universal passives have no prerequisite tags and therefore never produce hints.
 */
export function cardSynergyHints(
  characterClass: CharacterClass,
  ownedIds: readonly string[],
  skillId: string,
): CardSynergyHints {
  const skill = getSkill(skillId);
  const relevant = rulesForClass(characterClass).filter((rule) => skillUnlocksSynergy(rule, skill));
  if (relevant.length === 0) return NONE;
  const ref = (rule: SynergyRule): SynergyRef => Object.freeze({ id: rule.id, name: rule.name });
  if (ownedIds.includes(skillId))
    return Object.freeze({
      unlocks: [],
      combinesWith: [],
      alreadyOpened: Object.freeze(relevant.map(ref)),
    });
  const unlocks = relevant.filter((rule) => !unlocked(rule, ownedIds)).map(ref);
  const combinesWith = relevant
    .filter((rule) => unlocked(rule, ownedIds))
    .map((rule) =>
      Object.freeze({
        synergy: ref(rule),
        ownedSkills: Object.freeze(
          ownedIds
            .filter((id) => skillUnlocksSynergy(rule, getSkill(id)))
            .map((id) => getSkill(id).name),
        ),
      }),
    );
  return Object.freeze({
    unlocks: Object.freeze(unlocks),
    combinesWith: Object.freeze(combinesWith),
    alreadyOpened: Object.freeze([]),
  });
}
