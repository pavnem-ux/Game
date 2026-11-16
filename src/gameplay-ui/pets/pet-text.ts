import { PET_CONFIG, PET_LEVEL_RULES, petParams } from '../../pets';
import type { PetId } from '../../pets';
import { formatNumber } from '../strings-en';

/** Task 20: English effect lines of a pet at a level (numbers from the pet config). */
const n = (v: number) => String(Math.round(v * 100) / 100);
export function petEffectLines(id: PetId, level: number): readonly string[] {
  const p = petParams(id, level);
  switch (id) {
    case 'firefly':
      return [`Every ${n(p.interval)} s heals ${n(p.healPercent)}% of max health`];
    case 'owlet':
      return [
        `Every ${n(p.interval)} s shoots the nearest enemy (range ${n(p.range)})`,
        `Damage: ${n(p.damagePercent)}% of hero damage`,
      ];
    case 'fox':
      return [
        `Every ${n(p.interval)} s dashes through an enemy (range ${n(p.range)})`,
        `Magic damage: ${n(p.damagePercent)}% of hero damage`,
        `Burn: ${n(p.burnStacks)} stack, ${n(p.burnPerTick)} per tick, ${n(p.burnDuration)} s`,
      ];
    case 'hedgehog':
      return [
        `Aura: +${n(p.resistance)} Resistance`,
        `Every ${n(p.interval)} s a shield of ${n(p.barrierPercent)}% max health for ${n(p.barrierDuration)} s`,
      ];
    case 'kitten':
      return [
        `+${n(p.coinPercent)}% coins collected`,
        `+${n(p.pickupRadiusPercent)}% pickup radius`,
      ];
    case 'wolf':
      return [
        `Aura: +${n(p.attackSpeed)} Attack speed`,
        `+${n(p.movementSpeedPercent)}% Movement speed`,
      ];
  }
}
export const petLevelLabel = (level: number) => `Level ${level} of ${PET_LEVEL_RULES.maxLevel}`;
export const petSourceLabel = (id: PetId) => {
  const s = PET_CONFIG[id].source;
  return s.kind === 'shop' ? `${formatNumber(s.price)} Gold` : 'Quest reward';
};
