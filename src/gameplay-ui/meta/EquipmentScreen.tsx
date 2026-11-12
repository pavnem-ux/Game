import { useState, useSyncExternalStore } from 'react';
import { uiSound } from '../sound';
import { CHARACTER_CLASSES } from '../../character-stats';
import type { CharacterClass } from '../../character-stats';
import { CLASS_LABELS } from '../../gameplay';
import {
  GEAR_SLOTS,
  SLOT_LABELS,
  findItem,
  isEligible,
  isUpgradeable,
  itemDisplayName,
  itemLevel,
  permanentStats,
  starterWeapon,
} from '../../equipment';
import type { GearItem, GearSlot, Loadout } from '../../equipment';
import { campaignStore } from '../campaign-state';
import {
  Button,
  ClassEmblem,
  CompareList,
  Panel,
  STAT_ROWS,
  Tabs,
  TierFrame,
  Tooltip,
  compareStats,
  formatStat,
} from '../kit';
import { RU } from '../strings-ru';
import { ItemStats, REFUSALS, tierLabel } from '../ShopPages';

const E = RU.meta.equipment;
type SlotFilter = GearSlot | 'all';

/**
 * Task 13 §3 Equipment: paper doll (class silhouette with the 4 slots around it), owned items grid
 * with slot filters, compare tooltip on hover and a compare preview on selection («Надеть»),
 * unequip, link to the shop, final stats. Purchases/equipping stay in the existing store/profile
 * functions (one validated save per action).
 */
export function EquipmentPage() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile;
  const [shown, setShown] = useState<CharacterClass | null>(null);
  const [filter, setFilter] = useState<SlotFilter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  if (!profile) return <p className="campaign-empty">Профиль недоступен.</p>;
  const cls = shown ?? ui.viewClass ?? profile.selectedClass;
  const progress = profile.classes[cls];
  const loadout = progress.loadout;
  const stats = (l: Loadout | null) =>
    permanentStats(cls, progress.level, progress.talents, l, profile.itemLevels);
  const withGear = stats(loadout);
  const without = stats(null);
  const owned: GearItem[] = [
    starterWeapon(cls),
    ...profile.ownedItems.map((id) => findItem(id)).filter((i): i is GearItem => !!i),
  ].filter((i) => isEligible(i, cls, i.slot) && (filter === 'all' || i.slot === filter));
  const isEquipped = (item: GearItem) => loadout[item.slot] === item.id;
  // Task 19: names and stats at the item's forge level («Кольцо точности +3»).
  const levelOf = (item: GearItem) => itemLevel(profile.itemLevels, item.id);
  const nameOf = (item: GearItem) => itemDisplayName(item, levelOf(item));
  const preview = (id: string | null) => {
    const item = id ? findItem(id) : null;
    if (!item || isEquipped(item)) return null;
    return { item, deltas: compareStats(withGear, stats({ ...loadout, [item.slot]: item.id })) };
  };
  const chosen = preview(selected);
  const hover = hovered !== selected ? preview(hovered) : null;
  const equip = (id: string) => {
    const refused = campaignStore.equipItem(cls, id);
    if (refused) uiSound('ui-error');
    setMessage(refused ? (REFUSALS[refused] ?? E.equipFailed) : '');
    setSelected(null);
  };
  const unequip = (slot: GearSlot) => {
    const refused = campaignStore.unequipSlot(cls, slot);
    setMessage(refused ? E.unequipFailed : '');
  };
  return (
    <div className="equipment-screen">
      <header className="meta-page-head">
        <h2 className="meta-title">{E.title}</h2>
        <Tabs
          label="Класс экипировки"
          items={CHARACTER_CLASSES.map((c) => ({ id: c, label: CLASS_LABELS[c] }))}
          value={cls}
          onChange={(c) => {
            setShown(c);
            setSelected(null);
          }}
        />
        <Button variant="ghost" className="meta-push" onClick={() => campaignStore.setPage('shop')}>
          ⚖ {E.toShop} →
        </Button>
      </header>
      <section className="equipment-layout" aria-label={`Снаряжение: ${CLASS_LABELS[cls]}`}>
        <div className="paper-doll">
          <div className={`doll-figure doll-${cls}`} aria-hidden="true">
            <DollSilhouette />
            <ClassEmblem characterClass={cls} size={56} glow />
          </div>
          {GEAR_SLOTS.map((slot) => {
            const item = loadout[slot] ? findItem(loadout[slot]!) : null;
            return (
              <TierFrame
                key={slot}
                tier={item?.tier ?? 0}
                className={`doll-slot doll-slot-${slot} ${filter === slot ? 'active' : ''}`}
              >
                <button
                  className="doll-slot-button"
                  aria-label={`${SLOT_LABELS[slot]}: ${item ? nameOf(item) : E.empty}`}
                  aria-pressed={filter === slot}
                  onClick={() => setFilter(filter === slot ? 'all' : slot)}
                >
                  <small>{SLOT_LABELS[slot]}</small>
                  <strong>{item ? nameOf(item) : E.empty}</strong>
                  {item && <span className="doll-tier">{tierLabel(item)}</span>}
                </button>
                {item && !item.starter && (
                  <Button
                    variant="ghost"
                    size="s"
                    aria-label={`${E.unequip}: ${SLOT_LABELS[slot]}`}
                    onClick={() => unequip(slot)}
                  >
                    {E.unequip}
                  </Button>
                )}
              </TierFrame>
            );
          })}
        </div>
        <div className="equipment-side">
          <Panel
            title={E.owned}
            className="owned-panel"
            actions={
              <Tabs
                label="Фильтр по слоту"
                items={[
                  { id: 'all' as SlotFilter, label: E.all },
                  ...GEAR_SLOTS.map((s) => ({ id: s as SlotFilter, label: SLOT_LABELS[s] })),
                ]}
                value={filter}
                onChange={setFilter}
              />
            }
          >
            {owned.length === 0 ? (
              <p className="meta-empty">{E.noItems}</p>
            ) : (
              <ul className="owned-grid">
                {owned.map((item) => (
                  <li key={item.id} className="owned-cell">
                    <TierFrame tier={item.tier}>
                      <button
                        className={`item-card ${selected === item.id ? 'selected' : ''}`}
                        aria-pressed={selected === item.id}
                        aria-label={`${nameOf(item)}${isEquipped(item) ? `, ${E.equipped.toLowerCase()}` : ''}`}
                        onClick={() => setSelected(selected === item.id ? null : item.id)}
                        // Task 16: pointer events (mouse only: a touch tap must not leave a stuck
                        // hover preview; a tap selects the item instead).
                        onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(item.id)}
                        onPointerLeave={(e) => e.pointerType === 'mouse' && setHovered(null)}
                        onFocus={() => setHovered(item.id)}
                        onBlur={() => setHovered(null)}
                      >
                        <strong>{nameOf(item)}</strong>
                        <small className="item-tier">
                          {SLOT_LABELS[item.slot]} · {tierLabel(item)}
                        </small>
                        <ItemStats item={item} level={levelOf(item)} />
                        {isEquipped(item) && <span className="item-stamp">{E.equipped}</span>}
                      </button>
                    </TierFrame>
                    {hover?.item.id === item.id && (
                      <Tooltip placement="top">
                        <strong>{E.compare(nameOf(item))}</strong>
                        <CompareList deltas={hover.deltas} empty={E.noChange} />
                      </Tooltip>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {chosen && (
            <Panel
              className="equipment-preview"
              role="group"
              aria-label="Предпросмотр снаряжения"
              title={E.compare(nameOf(chosen.item))}
            >
              <CompareList deltas={chosen.deltas} empty={E.noChange} />
              <div className="preview-actions">
                <Button variant="primary" onClick={() => equip(chosen.item.id)}>
                  {E.equip}
                </Button>
                {isUpgradeable(chosen.item) && (
                  <Button onClick={() => campaignStore.openForge(chosen.item.id)}>
                    ⚒ {RU.meta.forge.toForge}
                  </Button>
                )}
                <Button onClick={() => setSelected(null)}>{RU.meta.modal.cancel}</Button>
              </div>
            </Panel>
          )}
          {message && (
            <p className="shop-message" role="status">
              {message}
            </p>
          )}
        </div>
        <Panel title={E.finalStats} className="final-stats">
          <table className="equipment-stats">
            <thead>
              <tr>
                <th>Характеристика</th>
                <th>{E.without}</th>
                <th>{E.with}</th>
              </tr>
            </thead>
            <tbody>
              {STAT_ROWS.map(([k, label, d]) => (
                <tr key={k}>
                  <td>{label}</td>
                  <td>{formatStat(without[k], d)}</td>
                  <td className={withGear[k] !== without[k] ? 'changed' : undefined}>
                    {formatStat(withGear[k], d)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="meta-note">{E.nextRun}</p>
        </Panel>
      </section>
    </div>
  );
}

/** Original procedural hero silhouette (inline SVG). */
function DollSilhouette() {
  return (
    <svg className="doll-silhouette" viewBox="0 0 120 220" aria-hidden="true">
      <circle cx="60" cy="30" r="20" />
      <path d="M30 60 Q60 48 90 60 L100 120 L86 124 L82 92 L80 150 L88 214 L70 214 L60 160 L50 214 L32 214 L40 150 L38 92 L34 124 L20 120 Z" />
    </svg>
  );
}
