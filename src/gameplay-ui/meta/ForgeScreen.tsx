import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { uiSound } from '../sound';
import { CHARACTER_CLASSES } from '../../character-stats';
import { CLASS_LABELS } from '../../gameplay';
import {
  GEAR_SLOTS,
  GEAR_STAT_LABELS,
  SLOT_LABELS,
  UPGRADE_RULES,
  checkUpgrade,
  findItem,
  isUpgradeable,
  itemDisplayName,
  itemLevel,
  upgradeCost,
  upgradedStats,
} from '../../equipment';
import type { GearItem, GearSlot, GearStat } from '../../equipment';
import { campaignStore } from '../campaign-state';
import { Button, CurrencyBadge, OreBadge, Panel, Tabs, TierFrame } from '../kit';
import { RU } from '../strings-ru';
import { tierLabel } from '../ShopPages';

const F = RU.meta.forge;
type SlotFilter = GearSlot | 'all';
const fmt = (stat: GearStat, v: number) =>
  `+${Math.round(v * 100) / 100}${GEAR_STAT_LABELS[stat].unit}`;

/**
 * Task 19 «Кузница»: owned items (filter by slot), the selected item's current vs next stats, the
 * Gold + ore cost and «Улучшить». An upgrade always succeeds; it goes through the campaign store
 * (Gold, ore and the level in one validated save). Reads state; store actions only.
 */
export function ForgePage() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile;
  const [filter, setFilter] = useState<SlotFilter>('all');
  const [picked, setPicked] = useState<string | null>(null);
  const [message, setMessage] = useState<Readonly<{ tone: 'ok' | 'error'; text: string }> | null>(
    null,
  );
  // Phones (one column): bring the detail panel into view when an item is picked.
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picked || !window.matchMedia?.('(max-width: 760px)').matches) return;
    detailRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [picked]);
  if (!profile) return <p className="campaign-empty">Профиль недоступен.</p>;
  const levels = profile.itemLevels;
  const equippedBy = (id: string) =>
    CHARACTER_CLASSES.filter((c) => Object.values(profile.classes[c].loadout).includes(id));
  const owned = profile.ownedItems
    .map((id) => findItem(id))
    .filter((i): i is GearItem => !!i && isUpgradeable(i));
  // Equipped items first, then purchase order.
  const list = owned
    .filter((i) => filter === 'all' || i.slot === filter)
    .sort((a, b) => Number(equippedBy(b.id).length > 0) - Number(equippedBy(a.id).length > 0));
  const selectedId = picked ?? ui.forgeItem;
  const selected = selectedId ? (owned.find((i) => i.id === selectedId) ?? null) : null;
  const upgrade = (item: GearItem) => {
    const refused = campaignStore.upgradeItem(item.id);
    if (refused) {
      uiSound('ui-error');
      setMessage({ tone: 'error', text: F.refusals[refused] ?? F.failed });
      return;
    }
    uiSound('ui-confirm');
    setMessage({
      tone: 'ok',
      text: F.upgraded(itemDisplayName(item, itemLevel(levels, item.id) + 1)),
    });
  };
  return (
    <div className="forge-screen">
      <header className="meta-page-head">
        <h2 className="meta-title">{F.title}</h2>
        <span className="forge-wallet">
          <CurrencyBadge amount={profile.gold} />
          <OreBadge amount={profile.ore} />
        </span>
      </header>
      <p className="meta-note">{F.intro}</p>
      <section className="forge-layout">
        <Panel
          title={F.items}
          className="forge-items"
          actions={
            <Tabs
              label="Фильтр кузницы по слоту"
              items={[
                { id: 'all' as SlotFilter, label: RU.meta.equipment.all },
                ...GEAR_SLOTS.map((s) => ({ id: s as SlotFilter, label: SLOT_LABELS[s] })),
              ]}
              value={filter}
              onChange={setFilter}
            />
          }
        >
          {list.length === 0 ? (
            <p className="meta-empty">{F.noItems}</p>
          ) : (
            <ul className="owned-grid forge-grid">
              {list.map((item) => {
                const level = itemLevel(levels, item.id);
                const wearers = equippedBy(item.id);
                return (
                  <li key={item.id}>
                    <TierFrame tier={item.tier}>
                      <button
                        className={`item-card forge-card ${selected?.id === item.id ? 'selected' : ''}`}
                        aria-pressed={selected?.id === item.id}
                        onClick={() => {
                          setPicked(item.id);
                          setMessage(null);
                        }}
                      >
                        <strong>{itemDisplayName(item, level)}</strong>
                        <small className="item-tier">
                          {SLOT_LABELS[item.slot]} · {tierLabel(item)}
                        </small>
                        <LevelPips level={level} />
                        {wearers.length > 0 && (
                          <small className="forge-wearers">
                            {F.equippedBy(wearers.map((c) => CLASS_LABELS[c]).join(', '))}
                          </small>
                        )}
                      </button>
                    </TierFrame>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel
          className="forge-detail"
          role="group"
          aria-label="Улучшение предмета"
          title={selected ? itemDisplayName(selected, itemLevel(levels, selected.id)) : F.title}
        >
          <div ref={detailRef} className="forge-detail-anchor" aria-hidden="true" />
          {selected ? (
            <ForgeDetail
              item={selected}
              level={itemLevel(levels, selected.id)}
              gold={profile.gold}
              ore={profile.ore}
              onUpgrade={() => upgrade(selected)}
            />
          ) : (
            <p className="meta-empty">{F.pick}</p>
          )}
          {message && (
            <p className={`shop-message forge-message forge-${message.tone}`} role="status">
              {message.text}
            </p>
          )}
        </Panel>
      </section>
    </div>
  );
}

function LevelPips({ level }: { level: number }) {
  return (
    <span className="forge-pips" role="img" aria-label={F.level(level, UPGRADE_RULES.maxLevel)}>
      {Array.from({ length: UPGRADE_RULES.maxLevel }, (_, i) => (
        <i key={i} className={i < level ? 'on' : undefined} />
      ))}
    </span>
  );
}

function ForgeDetail({
  item,
  level,
  gold,
  ore,
  onUpgrade,
}: {
  item: GearItem;
  level: number;
  gold: number;
  ore: number;
  onUpgrade: () => void;
}) {
  const maxed = level >= UPGRADE_RULES.maxLevel;
  const now = upgradedStats(item, level);
  const next = maxed ? null : upgradedStats(item, level + 1);
  const cost = maxed ? null : upgradeCost(item, level + 1);
  const check = checkUpgrade(
    { gold, ore, ownedItems: [item.id], itemLevels: { ...(level ? { [item.id]: level } : {}) } },
    item.id,
  );
  const reason = check.ok ? null : (F.refusals[check.reason] ?? F.failed);
  return (
    <div className="forge-detail-body">
      <p className="forge-level">
        <LevelPips level={level} /> {F.level(level, UPGRADE_RULES.maxLevel)}
      </p>
      <table className="forge-stats">
        <thead>
          <tr>
            <th>Характеристика</th>
            <th>{F.now}</th>
            <th>{maxed ? '' : F.next(level + 1)}</th>
          </tr>
        </thead>
        <tbody>
          {(Object.entries(now) as [GearStat, number][]).map(([stat, v]) => (
            <tr key={stat}>
              <td>{GEAR_STAT_LABELS[stat].label}</td>
              <td>{fmt(stat, v)}</td>
              <td className={next ? 'changed' : undefined}>{next ? fmt(stat, next[stat]!) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {cost ? (
        <div className="forge-cost">
          <span>{F.cost}</span>
          <span className={gold < cost.gold ? 'short' : undefined}>
            <CurrencyBadge amount={cost.gold} size="s" />
          </span>
          <span className={ore < cost.ore ? 'short' : undefined}>
            <OreBadge amount={cost.ore} size="s" />
          </span>
        </div>
      ) : (
        <p className="forge-maxed">{F.maxed}</p>
      )}
      <Button variant="primary" disabledReason={reason} onClick={onUpgrade}>
        ⚒ {maxed ? F.maxed : `${F.upgrade} до +${level + 1}`}
      </Button>
    </div>
  );
}
