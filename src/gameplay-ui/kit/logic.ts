import type { CombatAttributes } from '../../character-stats';
import { EN } from '../strings-en';

/**
 * Task 13 UI kit — pure presentation helpers (no gameplay rules: they only format values the
 * existing modules computed). Unit-tested in `tests/ui-kit/`.
 */

/** Rows of the final-stats panels and compare tooltips: attribute, label, decimals. */
export const STAT_ROWS: readonly (readonly [keyof CombatAttributes, string, number])[] =
  Object.freeze([
    ['maxHp', EN.meta.stats.maxHp, 0],
    ['physicalDamage', EN.meta.stats.physicalDamage, 0],
    ['magicalDamage', EN.meta.stats.magicalDamage, 0],
    ['attackSpeed', EN.meta.stats.attackSpeed, 0],
    ['criticalChance', EN.meta.stats.criticalChance, 1],
    ['criticalDamage', EN.meta.stats.criticalDamage, 0],
    ['resistance', EN.meta.stats.resistance, 0],
    ['dodgeChance', EN.meta.stats.dodgeChance, 1],
    ['movementSpeed', EN.meta.stats.movementSpeed, 0],
    ['cooldownReduction', EN.meta.stats.cooldownReduction, 1],
    ['areaSize', EN.meta.stats.areaSize, 0],
  ]);

/** Rounds for display (no trailing zeros), e.g. 12.345 → "12.3" with 1 decimal. */
export function formatStat(value: number, digits: number): string {
  if (!Number.isFinite(value)) return '—';
  const p = 10 ** digits;
  return String(Math.round(value * p) / p);
}

export interface StatDelta {
  readonly key: keyof CombatAttributes;
  readonly label: string;
  readonly before: number;
  readonly after: number;
  /** Rounded difference shown to the player (after − before at the row's precision). */
  readonly diff: number;
  /** 'up' (green), 'down' (red) or 'same'. */
  readonly direction: 'up' | 'down' | 'same';
  /** «+8», «−2.5» (U+2212 minus), «±0». */
  readonly text: string;
}
/**
 * Compare tooltip rows: every stat whose displayed value changes between `before` and `after`
 * (differences that round to zero at the row's precision are hidden unless `all`).
 */
export function compareStats(
  before: CombatAttributes,
  after: CombatAttributes,
  options: Readonly<{ all?: boolean }> = {},
): readonly StatDelta[] {
  const out: StatDelta[] = [];
  for (const [key, label, digits] of STAT_ROWS) {
    const p = 10 ** digits;
    const diff = Math.round((after[key] - before[key]) * p) / p;
    if (diff === 0 && !options.all) continue;
    const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
    const text =
      direction === 'same'
        ? '±0'
        : `${direction === 'up' ? '+' : '−'}${formatStat(Math.abs(diff), digits)}`;
    out.push(
      Object.freeze({ key, label, before: before[key], after: after[key], diff, direction, text }),
    );
  }
  return Object.freeze(out);
}

/** Fraction 0–1 for progress bars (max ≤ 0 or non-finite input → 0; values clamp). */
export function progressFraction(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

/**
 * A disabled control's reason (shown as tooltip / accessible description). The first failing
 * condition wins; null = enabled.
 */
export function disabledReason(
  checks: readonly (readonly [failed: boolean, reason: string])[],
): string | null {
  for (const [failed, reason] of checks) if (failed) return reason;
  return null;
}

/** Roman rank labels I–III (0 → empty). */
export function romanRank(rank: number): string {
  return ['', 'I', 'II', 'III'][rank] ?? String(rank);
}

/** Gold amounts with comma thousands, e.g. 12500 → 12,500 (Task 23: English format). */
export function formatGold(amount: number): string {
  if (!Number.isFinite(amount)) return '0';
  return Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
