import type { CharacterClass } from '../character-stats';
import { RARITIES, RARITY_CONFIG, affixText, itemMainStats, itemName } from '../equipment';
import type { ItemInstance, Rarity } from '../equipment';

/**
 * Task 40 item display helpers (presentation only, kept small until the bag screen of Task 41):
 * rarity as a frame tier / colour / label, flat main stats and secondary stats as text lines.
 */
/** Rarity → the kit's TierFrame tier (1 Common … 5 Legendary). */
export const rarityTier = (rarity: Rarity) => RARITIES.indexOf(rarity) + 1;
export const rarityLabel = (rarity: Rarity) => RARITY_CONFIG[rarity].name;
export const rarityColor = (rarity: Rarity) => RARITY_CONFIG[rarity].color;

/** Main-stat lines of an item for the class wearing it («+12 physical damage», «+35 max HP»). */
export function mainStatLines(item: ItemInstance, characterClass: CharacterClass): string[] {
  const m = itemMainStats(item, characterClass);
  const lines: string[] = [];
  if (m.physicalDamage) lines.push(`+${m.physicalDamage} physical damage`);
  if (m.magicalDamage) lines.push(`+${m.magicalDamage} magic damage`);
  if (m.maxHp) lines.push(`+${m.maxHp} max HP`);
  if (m.resistance) lines.push(`+${m.resistance} resistance`);
  return lines;
}
/** Item level, main stats and secondary stats. */
export function ItemStats({
  item,
  characterClass,
}: {
  item: ItemInstance;
  characterClass: CharacterClass;
}) {
  const main = mainStatLines(item, characterClass);
  return (
    <ul className="gear-stats">
      <li className="gear-stat-level">Item level {item.itemLevel}</li>
      {main.map((line) => (
        <li key={line} className="gear-stat-main">
          {line}
        </li>
      ))}
      {item.affixes.map((a) => (
        <li key={a.stat} className="gear-stat-affix">
          {affixText(a)}
        </li>
      ))}
    </ul>
  );
}
/** «Plate Gauntlets of Fury» with the rarity label in its colour. */
export function ItemTitle({ item }: { item: ItemInstance }) {
  return (
    <>
      <strong>{itemName(item)}</strong>
      <small style={{ color: rarityColor(item.rarity) }}>{rarityLabel(item.rarity)}</small>
    </>
  );
}
