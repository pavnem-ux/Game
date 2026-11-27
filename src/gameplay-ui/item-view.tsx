import type { CharacterClass } from '../character-stats';
import {
  RARITIES,
  formatStatLine,
  formatStatValue,
  statExplanation,
  statInfo,
  statNumber as formatNumberPlain,
  RARITY_CONFIG,
  affixText,
  itemMainStats,
  itemName,
  slottedStats,
} from '../equipment';
import type { ItemInstance, Rarity, StatKey } from '../equipment';
import { itemBandIconId, itemIconId } from '../equipment';
import { ItemIcon } from './kit';
import type { IconSize } from './kit/icon-sizes';

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
  // Task 44: flat main stats as plain numbers («Damage +14», «HP +60», «Armor +20»).
  for (const k of MAIN_KEYS) if (m[k]) lines.push(formatStatLine(k, m[k]));
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

const MAIN_KEYS = ['physicalDamage', 'magicalDamage', 'maxHp', 'resistance'] as const;
/** A stat value as text: whole numbers plain, fractions with the given decimals. */
export const statNumber = formatNumberPlain;
export interface StatLine {
  readonly key: StatKey;
  /** «Crit chance» (hover / tap explains it). */
  readonly label: string;
  /** «+3.2%». */
  readonly value: string;
  /** «Crit chance +3.2%». */
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
  const line = (key: StatKey, v: number, delta: number | null | undefined): StatLine => ({
    key,
    label: statInfo(key).label,
    value: formatStatValue(key, v),
    text: formatStatLine(key, v),
    ...(delta !== undefined
      ? { delta, deltaText: delta === null ? 'new' : formatStatValue(key, delta) }
      : {}),
  });
  for (const k of MAIN_KEYS) {
    if (!a.main[k] && !(b && b.main[k])) continue;
    lines.push(line(k, a.main[k], b ? a.main[k] - b.main[k] : undefined));
  }
  for (const af of a.affixes) {
    const other = b?.affixes.find((x) => x.stat === af.stat);
    lines.push(line(af.stat, af.value, b ? (other ? af.value - other.value : null) : undefined));
  }
  return Object.freeze(lines);
}

/**
 * Task 44: a stat name that explains itself — hover (desktop) or tap / focus (mobile) shows a
 * one-line explanation with the cap where one exists.
 */
export function StatName({ statKey }: { statKey: StatKey }) {
  const tip = statExplanation(statKey);
  return (
    <span className="stat-name" tabIndex={0} data-tip={tip} title={tip} aria-label={tip}>
      {statInfo(statKey).label}
    </span>
  );
}

/** Task 45: an item's icon — a Legendary's own art, else (or when missing) the slot's band icon. */
export function ItemArt({ item, size }: { item: ItemInstance; size: IconSize }) {
  return <ItemIcon templateId={itemIconId(item)} fallback={itemBandIconId(item)} size={size} />;
}
