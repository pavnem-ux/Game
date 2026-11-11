import type { CharacterClass } from '../character-stats';
import { getSkill } from './catalog';
import {
  SYNERGY_RULES,
  bestSynergyPair,
  completedPairs,
  pairComplete,
  synergyUnlocked,
} from './synergies';
import type { SynergyId, SynergyLevel, SynergyPair, SynergyRule } from './synergies';

/**
 * Task 15 (catalog v3): player-facing Level II / III texts. Numbers are the catalog's (provisional);
 * combat uses SYNERGY_TUNING_LEVEL_II and SYNERGY_AWAKENING, never these strings.
 */
export const SYNERGY_LEVEL_TEXT: Readonly<
  Record<SynergyId, Readonly<{ levelTwo: string; awakened: string; awakenedEffect: string }>>
> = Object.freeze({
  thermal_shock: Object.freeze({
    levelTwo: 'коэффициент взрыва ×0.825',
    awakened: 'Паровой взрыв',
    awakenedEffect: 'взрыв бьёт всех врагов в радиусе 80 от цели (одно попадание по врагу)',
  }),
  wildfire: Object.freeze({
    levelTwo: 'урон Burn 4.5 за тик',
    awakened: 'Огненная буря',
    awakenedEffect: '5 соседей вместо 3, каждому 2 стака Burn (всего не более 7 целей с талантами)',
  }),
  shattered_ice: Object.freeze({
    levelTwo: 'бонус ×0.675',
    awakened: 'Ледяная шрапнель',
    awakenedEffect: '3 осколка в 3 ближайших врагов в радиусе 150: ×0.25 ледяного урона и Slow',
  }),
  skull_crusher: Object.freeze({
    levelTwo: 'доп. урон ×0.75',
    awakened: 'Сотрясение',
    awakenedEffect:
      'продлевает текущее оглушение цели на 0.3 с (раз за оглушение, в пределах лимитов)',
  }),
  battle_momentum: Object.freeze({
    levelTwo: '+22.5 скорости атаки',
    awakened: 'Неудержимый',
    awakenedEffect: 'до 3 стаков (каждое убийство +1), пока бафф активен — +10% скорости бега',
  }),
  seismic_impact: Object.freeze({
    levelTwo: 'волна ×0.75',
    awakened: 'Разлом',
    awakenedEffect: 'трещина радиусом 90 на 2 с: каждые 0.5 с ×0.15 физического урона и Slow',
  }),
  toxic_barrage: Object.freeze({
    levelTwo: 'взрыв ×0.9',
    awakened: 'Чумной ливень',
    awakenedEffect: 'взрыв бьёт всех в радиусе 80 и накладывает каждому 2 стака Poison',
  }),
  plague_chain: Object.freeze({
    levelTwo: 'урон Poison 4.5 за тик',
    awakened: 'Мор',
    awakenedEffect: '5 соседей; каждый получает половину стаков Poison погибшего (1–5)',
  }),
  deadly_precision: Object.freeze({
    levelTwo: '+22.5% урона по цели',
    awakened: 'Инстинкт охотника',
    awakenedEffect:
      'если цель с бонусом погибает, бонус переходит на ближайшего отравленного врага (до 3 раз)',
  }),
  blood_frenzy: Object.freeze({
    levelTwo: '+22.5 скорости атаки',
    awakened: 'Кровавый пир',
    awakenedEffect: 'удары кинжалом по кровоточащим лечат 0.5% Max HP (не чаще раза в 0.5 с)',
  }),
  deep_wounds: Object.freeze({
    levelTwo: 'урон Bleed 4.5 за тик',
    awakened: 'Рваные раны',
    awakenedEffect: 'крит добавляет 2 стака Bleed и обновляет длительность',
  }),
  final_cut: Object.freeze({
    levelTwo: 'добивание ×1.8',
    awakened: 'Казнь',
    awakenedEffect:
      'порог 40%; если удар убивает — кровавый взрыв радиусом 80 (×0.4 и 1 стак Bleed)',
  }),
});
export const LEVEL_ROMAN = Object.freeze(['', 'I', 'II', 'III'] as const);
/** Rank lookup from the snapshot's owned skills. */
export function ranksOf(owned: readonly { skillId: string; rank: number }[]) {
  return new Map(owned.map((s) => [s.skillId, s.rank]));
}
/**
 * Task 15 card hint «▲ <Синергия> II/III»: synergies whose level this pick would raise to II or III
 * (a new skill enters at rank I; an upgrade adds one rank). Unlocks (level I) keep their own hint.
 */
export function cardLevelRaises(
  characterClass: CharacterClass,
  ranks: ReadonlyMap<string, number>,
  skillId: string,
): readonly { readonly synergy: SynergyRef; readonly level: 2 | 3 }[] {
  const next = new Map(ranks);
  next.set(skillId, (ranks.get(skillId) ?? 0) + 1);
  const raises: { synergy: SynergyRef; level: 2 | 3 }[] = [];
  for (const rule of rulesForClass(characterClass)) {
    if (!rule.unlockPairs.some((pair) => pair.includes(skillId))) continue;
    const before = bestSynergyPair(rule, ranks).level;
    const after = bestSynergyPair(rule, next).level;
    if (after > before && after >= 2)
      raises.push(Object.freeze({ synergy: ref(rule), level: after as 2 | 3 }));
  }
  return Object.freeze(raises);
}

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
  /** Task 15: level 0–3 from the best pair's weakest rank (0 while locked; I without ranks). */
  readonly level: SynergyLevel;
  /** Task 15: the pair giving the level ("A + B"), or null while locked. */
  readonly bestPair: string | null;
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
  /** Task 15: owned ranks; without it every owned skill counts as rank I (level ≤ I). */
  ranks: ReadonlyMap<string, number> = new Map(ownedIds.map((id) => [id, 1])),
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
        ...(() => {
          const best = bestSynergyPair(rule, ranks);
          return { level: best.level, bestPair: best.pair ? pairText(best.pair) : null };
        })(),
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
