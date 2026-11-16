import type { ReactNode } from 'react';
import { TIERS, TIER_CONFIG } from '../../equipment';
import type { GearItem, Tier } from '../../equipment';

/**
 * Task 22 §1.4: items grouped into rows by rarity — Обычный → Добротный → Редкий → Эпический →
 * Легендарный — each with a tier-coloured header; empty rows are hidden. Starter weapons (tier 0)
 * sit in the «Обычный» row. Filters are applied by the caller before grouping.
 */
export function TierRows({
  items,
  label,
  className = '',
  render,
}: {
  items: readonly GearItem[];
  label: string;
  className?: string;
  render: (item: GearItem) => ReactNode;
}) {
  const rows = TIERS.map((tier) => ({
    tier,
    items: items.filter((i) => Math.max(1, i.tier) === tier),
  })).filter((r) => r.items.length > 0);
  return (
    <div className={`tier-rows ${className}`} aria-label={label}>
      {rows.map((r) => (
        <section
          key={r.tier}
          className={`tier-row tier-row-${r.tier}`}
          aria-label={TIER_CONFIG[r.tier as Tier].name}
          style={{ ['--row-tier' as string]: TIER_CONFIG[r.tier as Tier].color }}
        >
          <h3 className="tier-row-head">
            <span>{TIER_CONFIG[r.tier as Tier].name}</span>
            <small>{r.items.length}</small>
          </h3>
          <ul className="tier-row-grid">{r.items.map((item) => render(item))}</ul>
        </section>
      ))}
    </div>
  );
}
