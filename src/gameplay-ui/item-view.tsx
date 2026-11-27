import type { CharacterClass } from '../character-stats';
import {
  AFFIX_RULES,
  RARITIES,
  RARITY_CONFIG,
  affixText,
  itemMainStats,
  itemName,
  slottedStats,
} from '../equipment';
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

// ── Task 41: stats with the slot bonus and their difference to the worn item ──

const MAIN_LABELS = {
  physicalDamage: 'physical damage',
  magicalDamage: 'magic damage',
  maxHp: 'max HP',
  resistance: 'resistance',
} as const;
/** A stat value as text: whole numbers plain, fractions with the given decimals. */
export function statNumber(value: number, decimals = 1): string {
  const r = Math.round(value * 10 ** decimals) / 10 ** decimals;
  return Number.isInteger(r) ? String(r) : r.toFixed(decimals);
}
export interface StatLine {
  readonly key: string;
  readonly text: string;
  /** Difference to the worn item (null: the worn item lacks this stat → «new»; undefined: none). */
  readonly delta?: number | null;
  readonly deltaText?: string;
}
/**
 * The card lines of `item` in the class's slot (slot bonuses applied), each with its difference
 * to `worn` (the item the class wears there, also with the bonus).
 */
export function slottedLines(
  item: ItemInstance,
  characterClass: CharacterClass,
  slotLevel: number,
  worn: ItemInstance | null,
): readonly StatLine[] {
  const a = slottedStats(item, characterClass, slotLevel);
  const b = worn && worn.uid !== item.uid ? slottedStats(worn, characterClass, slotLevel) : null;
  const lines: StatLine[] = [];
  for (const k of Object.keys(MAIN_LABELS) as (keyof typeof MAIN_LABELS)[]) {
    if (!a.main[k] && !(b && b.main[k])) continue;
    const delta = b ? a.main[k] - b.main[k] : undefined;
    lines.push({
      key: k,
      text: `+${statNumber(a.main[k])} ${MAIN_LABELS[k]}`,
      ...(delta !== undefined ? { delta, deltaText: signed(delta, 1) } : {}),
    });
  }
  for (const af of a.affixes) {
    const r = AFFIX_RULES[af.stat];
    const other = b?.affixes.find((x) => x.stat === af.stat);
    const delta = b ? (other ? af.value - other.value : null) : undefined;
    lines.push({
      key: af.stat,
      text: `+${statNumber(af.value, r.decimals)}${r.unit} ${r.label}`,
      ...(delta !== undefined
        ? { delta, deltaText: delta === null ? 'new' : signed(delta, r.decimals) }
        : {}),
    });
  }
  return Object.freeze(lines);
}
const signed = (v: number, decimals: number) =>
  `${v >= 0 ? '+' : '−'}${statNumber(Math.abs(v), decimals)}`;
