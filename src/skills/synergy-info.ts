import type { CharacterClass } from '../character-stats';
import { getSkill } from './catalog';
import { SYNERGY_RULES, completedPairs, pairComplete, synergyUnlocked } from './synergies';
import type { SynergyId, SynergyPair, SynergyRule } from './synergies';

/**
 * Player-facing synergy information derived only from SYNERGY_RULES (pair table) and the skill
 * catalogue. Nothing here decides combat: "available" means an unlock pair is fully acquired, not
 * that the trigger has happened. Combat uses the same `synergyUnlocked` check.
 */
export interface SynergySkillRef {
  readonly skillId: string;
  readonly name: string;
  readonly icon: string;
  readonly kind: 'auto' | 'passive';
  readonly owned: boolean;
}
export interface SynergyPairInfo {
  readonly skills: readonly [SynergySkillRef, SynergySkillRef];
  readonly complete: boolean;
  /** Names of the pair's skills that are not acquired yet. */
  readonly missing: readonly string[];
}
export interface SynergyInfo {
  readonly id: SynergyId;
  readonly name: string;
  readonly condition: string;
  readonly effect: string;
  readonly status: 'available' | 'locked';
  /** Every allowed pair in workbook order, with ownership. */
  readonly pairs: readonly SynergyPairInfo[];
  /** Human-readable completed pairs ("A + B"); empty while locked. */
  readonly completedPairs: readonly string[];
  /** Which pair opened it, or what is still missing for the closest pair(s). */
  readonly explanation: string;
}
export interface SynergyRef {
  readonly id: SynergyId;
  readonly name: string;
}
export interface CardSynergyHints {
  /** Locked rules this card would unlock now: it completes a pair with an acquired partner. */
  readonly unlocks: readonly {
    readonly synergy: SynergyRef;
    readonly withSkills: readonly string[];
  }[];
  /** Locked rules where this card is one half of a pair whose partner is not acquired yet. */
  readonly halfPairs: readonly {
    readonly synergy: SynergyRef;
    readonly partners: readonly string[];
  }[];
  /** For upgrades of an owned skill: open rules whose completed pair includes it (nothing new). */
  readonly alreadyOpened: readonly SynergyRef[];
}
const NONE: CardSynergyHints = Object.freeze({ unlocks: [], halfPairs: [], alreadyOpened: [] });

export function rulesForClass(characterClass: CharacterClass): readonly SynergyRule[] {
  return SYNERGY_RULES.filter((rule) => rule.characterClass === characterClass);
}
const nameOf = (skillId: string) => getSkill(skillId).name;
export const pairText = (pair: SynergyPair): string => `${nameOf(pair[0])} + ${nameOf(pair[1])}`;
const ref = (rule: SynergyRule): SynergyRef => Object.freeze({ id: rule.id, name: rule.name });
const unique = (names: readonly string[]) => Object.freeze([...new Set(names)]);

/** Overview of the class's synergies for the current acquired skills. */
export function synergyOverview(
  characterClass: CharacterClass,
  ownedIds: readonly string[],
): readonly SynergyInfo[] {
  const owned = new Set(ownedIds);
  return Object.freeze(
    rulesForClass(characterClass).map((rule) => {
      const pairs = rule.unlockPairs.map((pair) => {
        const skills = pair.map((skillId) => {
          const skill = getSkill(skillId);
          return Object.freeze({
            skillId,
            name: skill.name,
            icon: skill.icon,
            kind: skill.kind,
            owned: owned.has(skillId),
          });
        }) as unknown as readonly [SynergySkillRef, SynergySkillRef];
        return Object.freeze({
          skills: Object.freeze(skills),
          complete: pairComplete(pair, owned),
          missing: Object.freeze(skills.filter((s) => !s.owned).map((s) => s.name)),
        });
      });
      const done = completedPairs(rule, owned).map(pairText);
      const available = done.length > 0;
      const fewest = Math.min(...pairs.map((p) => p.missing.length));
      const closest = pairs.filter((p) => p.missing.length === fewest);
      const explanation = available
        ? `Открыто парой: ${done.join('; ')}. Сработает в бою, когда выполнится условие.`
        : fewest === 1
          ? `Не хватает одного навыка: ${unique(closest.flatMap((p) => p.missing)).join(' или ')}.`
          : `Нужна любая пара из списка (оба навыка, ранг I или выше).`;
      return Object.freeze({
        id: rule.id,
        name: rule.name,
        condition: rule.condition,
        effect: rule.effect,
        status: available ? 'available' : 'locked',
        pairs: Object.freeze(pairs),
        completedPairs: Object.freeze(done),
        explanation,
      } satisfies SynergyInfo);
    }),
  );
}

/**
 * Hints for one offered skill card. A new skill reports locked rules it would unlock immediately
 * (its partner is already acquired) and rules where it is one half of a pair. An upgrade never
 * claims a new unlock. Skills outside every pair (all universal passives) produce no hints.
 */
export function cardSynergyHints(
  characterClass: CharacterClass,
  ownedIds: readonly string[],
  skillId: string,
): CardSynergyHints {
  const owned = new Set(ownedIds);
  const relevant = rulesForClass(characterClass).filter((rule) =>
    rule.unlockPairs.some((pair) => pair.includes(skillId)),
  );
  if (relevant.length === 0) return NONE;
  if (owned.has(skillId))
    return Object.freeze({
      unlocks: [],
      halfPairs: [],
      alreadyOpened: Object.freeze(
        relevant
          .filter((rule) => completedPairs(rule, owned).some((pair) => pair.includes(skillId)))
          .map(ref),
      ),
    });
  const unlocks: CardSynergyHints['unlocks'][number][] = [];
  const halfPairs: CardSynergyHints['halfPairs'][number][] = [];
  for (const rule of relevant) {
    if (synergyUnlocked(rule, owned)) continue; // already open: one more pair never stacks
    const partners = rule.unlockPairs
      .filter((pair) => pair.includes(skillId))
      .map((pair) => (pair[0] === skillId ? pair[1] : pair[0]));
    const ownedPartners = partners.filter((id) => owned.has(id)).map(nameOf);
    if (ownedPartners.length > 0)
      unlocks.push(Object.freeze({ synergy: ref(rule), withSkills: unique(ownedPartners) }));
    else
      halfPairs.push(Object.freeze({ synergy: ref(rule), partners: unique(partners.map(nameOf)) }));
  }
  return Object.freeze({
    unlocks: Object.freeze(unlocks),
    halfPairs: Object.freeze(halfPairs),
    alreadyOpened: Object.freeze([]),
  });
}
