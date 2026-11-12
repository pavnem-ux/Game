import { PET_CONFIG, PET_LEVEL_RULES, petParams } from '../../pets';
import type { PetId } from '../../pets';

/** Task 20: Russian effect lines of a pet at a level (numbers from the pet config). */
const n = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
export function petEffectLines(id: PetId, level: number): readonly string[] {
  const p = petParams(id, level);
  switch (id) {
    case 'firefly':
      return [`Каждые ${n(p.interval)} с лечит ${n(p.healPercent)}% макс. здоровья`];
    case 'owlet':
      return [
        `Каждые ${n(p.interval)} с стреляет в ближайшего врага (до ${n(p.range)})`,
        `Урон: ${n(p.damagePercent)}% урона героя`,
      ];
    case 'fox':
      return [
        `Каждые ${n(p.interval)} с прорывается сквозь врага (до ${n(p.range)})`,
        `Магический урон: ${n(p.damagePercent)}% урона героя`,
        `Поджог: ${n(p.burnStacks)} заряд, ${n(p.burnPerTick)} в такт, ${n(p.burnDuration)} с`,
      ];
    case 'hedgehog':
      return [
        `Аура: +${n(p.resistance)} к сопротивлению`,
        `Каждые ${n(p.interval)} с щит ${n(p.barrierPercent)}% макс. здоровья на ${n(p.barrierDuration)} с`,
      ];
    case 'kitten':
      return [
        `+${n(p.coinPercent)}% к собранным монетам`,
        `+${n(p.pickupRadiusPercent)}% радиус подбора`,
      ];
    case 'wolf':
      return [
        `Аура: +${n(p.attackSpeed)} к скорости атаки`,
        `+${n(p.movementSpeedPercent)}% к скорости движения`,
      ];
  }
}
export const petLevelLabel = (level: number) => `Уровень ${level} из ${PET_LEVEL_RULES.maxLevel}`;
export const petSourceLabel = (id: PetId) => {
  const s = PET_CONFIG[id].source;
  return s.kind === 'shop' ? `${s.price} золота` : 'Награда за задание';
};
