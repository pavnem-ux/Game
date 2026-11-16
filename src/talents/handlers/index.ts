import type { CharacterClass } from '../../character-stats';
import type { TalentClassHandlers } from '../combat';
import { TalentRuntime } from '../runtime';
import type { TalentConfig, TalentRanks } from '../types';
import { ARCHER_HANDLERS } from './archer';
import { MAGE_HANDLERS } from './mage';
import { ROGUE_HANDLERS } from './rogue';
import { WARRIOR_HANDLERS } from './warrior';

/** Task 09.1: per-class talent handlers (filled phase by phase). */
export const TALENT_HANDLERS: Readonly<Record<CharacterClass, TalentClassHandlers>> = Object.freeze(
  {
    rogue: ROGUE_HANDLERS,
    mage: MAGE_HANDLERS,
    warrior: WARRIOR_HANDLERS,
    archer: ARCHER_HANDLERS,
  },
);

/**
 * Task 09.1: the basic weapon's talent range factor, needed before the weapon is equipped (e.g.
 * Archer «basic bow range +4/7%»). Reads the same active ranks as the runtime.
 */
export function talentWeaponRangeFactor(
  characterClass: CharacterClass,
  ranks: TalentRanks,
  config?: TalentConfig,
): number {
  const runtime = new TalentRuntime({
    ranks,
    ...(config ? { config } : {}),
    now: () => 0,
    random: () => {
      throw new Error('No randomness when reading weapon range.');
    },
  });
  return TALENT_HANDLERS[characterClass].weaponRangeFactor?.((id) => runtime.params(id)) ?? 1;
}
