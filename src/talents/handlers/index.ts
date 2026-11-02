import type { CharacterClass } from '../../character-stats';
import type { TalentClassHandlers } from '../combat';
import { MAGE_HANDLERS } from './mage';
import { ROGUE_HANDLERS } from './rogue';

/** Task 09.1: per-class talent handlers (filled phase by phase). */
export const TALENT_HANDLERS: Readonly<Record<CharacterClass, TalentClassHandlers>> = Object.freeze(
  {
    rogue: ROGUE_HANDLERS,
    mage: MAGE_HANDLERS,
    warrior: {},
    archer: {},
  },
);
