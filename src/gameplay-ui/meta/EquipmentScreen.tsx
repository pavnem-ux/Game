import { useState, useSyncExternalStore } from 'react';
import { uiSound } from '../sound';
import { CHARACTER_CLASSES } from '../../character-stats';
import type { CharacterClass } from '../../character-stats';
import { CLASS_LABELS } from '../../gameplay';
import {
  GEAR_SLOTS,
  SLOT_LABELS,
  equipBlock,
  findOwned,
  isStarterUid,
  itemIconId,
  itemName,
  permanentStats,
  starterWeapon,
} from '../../equipment';
import type { GearSlot, ItemInstance, Loadout } from '../../equipment';
import { campaignStore } from '../campaign-state';
import {
  Button,
  ClassEmblem,
  CompareList,
  Panel,
  STAT_ROWS,
  Tabs,
  TierFrame,
  ItemIcon,
  Tooltip,
  compareStats,
  formatStat,
} from '../kit';
import { EN } from '../strings-en';
import { REFUSALS } from '../ShopPages';
import { ItemStats, rarityColor, rarityLabel, rarityTier } from '../item-view';
import { PET_CONFIG, isPetId, petLevel } from '../../pets';
import { PetPortrait } from '../pets/PetPortrait';
import { petLevelLabel } from '../pets/pet-text';

const E = EN.meta.equipment;
type SlotFilter = GearSlot | 'all';

/**
 * Task 13 §3 Equipment: paper doll (class silhouette with the 4 slots around it), owned items grid
 * with slot filters, compare tooltip on hover and a compare preview on selection («Equip»),
 * unequip, link to the shop, final stats. Purchases/equipping stay in the existing store/profile
 * functions (one validated save per action).
 */
export function EquipmentPage() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile;
  const [shown, setShown] = useState<CharacterClass | null>(null);
  const [filter, setFilter] = useState<SlotFilter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  // Task 22: details of the item equipped in a paper-doll slot.
  const [slotDetail, setSlotDetail] = useState<GearSlot | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  if (!profile) return <p className="campaign-empty">Profile unavailable.</p>;
  const cls = shown ?? ui.viewClass ?? profile.selectedClass;
  const progress = profile.classes[cls];
  const loadout = progress.loadout;
  // Task 40: item instances (uids); stats include the flat main stats of the equipped items.
  const stats = (l: Loadout | null) =>
    permanentStats(cls, progress.level, progress.talents, l, profile.items);
  const withGear = stats(loadout);
  const without = stats(null);
  const find = (uid: string | null) => (uid ? findOwned(profile.items, uid, cls) : null);
  const owned: ItemInstance[] = [starterWeapon(cls), ...profile.items].filter(
    (i) =>
      (i.slot !== 'weapon' || i.characterClass === cls) && (filter === 'all' || i.slot === filter),
  );
  const isEquipped = (item: ItemInstance) => loadout[item.slot] === item.uid;
  const nameOf = (item: ItemInstance) => itemName(item);
  const lockedBy = (item: ItemInstance) =>
    equipBlock(item, cls, progress.level) === 'level' ? E.needsLevel(item.itemLevel) : null;
  const preview = (uid: string | null) => {
    const item = find(uid);
    if (!item || isEquipped(item)) return null;
    return { item, deltas: compareStats(withGear, stats({ ...loadout, [item.slot]: item.uid })) };
  };
  const chosen = preview(selected);
  const equippedDetail = slotDetail ? find(loadout[slotDetail]) : null;
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
          label="Equipment class"
          items={CHARACTER_CLASSES.map((c) => ({ id: c, label: CLASS_LABELS[c] }))}
          value={cls}
          onChange={(c) => {
            setShown(c);
            setSelected(null);
            setSlotDetail(null);
          }}
        />
        <Button variant="ghost" className="meta-push" onClick={() => campaignStore.setPage('shop')}>
          ⚖ {E.toShop} →
        </Button>
      </header>
      <section className="equipment-layout" aria-label={`Equipment: ${CLASS_LABELS[cls]}`}>
        <div className="paper-doll">
          <div className={`doll-figure doll-${cls}`} aria-hidden="true">
            <DollSilhouette />
            <ClassEmblem characterClass={cls} size={56} glow />
          </div>
          {GEAR_SLOTS.map((slot) => {
            const item = find(loadout[slot]);
            return (
              <TierFrame
                key={slot}
                tier={item && !isStarterUid(item.uid) ? rarityTier(item.rarity) : 0}
                className={`doll-slot doll-slot-${slot} ${filter === slot ? 'active' : ''}`}
              >
                <button
                  className="doll-slot-button"
                  aria-label={`${SLOT_LABELS[slot]}: ${item ? `${nameOf(item)}, details` : E.empty}`}
                  aria-pressed={item ? slotDetail === slot : filter === slot}
                  onClick={() => {
                    // Task 22: a filled slot opens the item details; an empty one filters the list.
                    if (item) {
                      setSlotDetail(slotDetail === slot ? null : slot);
                      setSelected(null);
                    } else setFilter(filter === slot ? 'all' : slot);
                  }}
                >
                  {item && <ItemIcon templateId={itemIconId(item)} size="itemSlot" />}
                  <small>{SLOT_LABELS[slot]}</small>
                  <strong>{item ? nameOf(item) : E.empty}</strong>
                  {item && (
                    <span className="doll-tier">
                      {rarityLabel(item.rarity)} · L{item.itemLevel}
                    </span>
                  )}
                </button>
                {item && !isStarterUid(item.uid) && (
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
          <PetSlot />
        </div>
        <div className="equipment-side">
          {/* Task 22: the details / «Equip» panel sits at the top of the item area (sticky on
              phones), never at the bottom of the page. */}
          {(chosen || equippedDetail || message) && (
            <div className="equipment-detail">
              {equippedDetail && slotDetail && (
                <Panel
                  className="equipment-preview equipped-detail"
                  role="group"
                  aria-label="Equipped item"
                  title={nameOf(equippedDetail)}
                >
                  <ItemIcon templateId={itemIconId(equippedDetail)} size="itemDetail" />
                  <p className="equipped-detail-meta">
                    {SLOT_LABELS[slotDetail]} ·{' '}
                    <span style={{ color: rarityColor(equippedDetail.rarity) }}>
                      {rarityLabel(equippedDetail.rarity)}
                    </span>
                  </p>
                  <ItemStats item={equippedDetail} characterClass={cls} />
                  <div className="preview-actions">
                    {!isStarterUid(equippedDetail.uid) && (
                      <Button
                        onClick={() => {
                          unequip(slotDetail);
                          setSlotDetail(null);
                        }}
                      >
                        {E.unequip}
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => setSlotDetail(null)}>
                      {E.close}
                    </Button>
                  </div>
                </Panel>
              )}
              {chosen && (
                <Panel
                  className="equipment-preview"
                  role="group"
                  aria-label="Equipment preview"
                  title={E.compare(nameOf(chosen.item))}
                >
                  <ItemIcon templateId={itemIconId(chosen.item)} size="itemDetail" />
                  <ItemStats item={chosen.item} characterClass={cls} />
                  <CompareList deltas={chosen.deltas} empty={E.noChange} />
                  <div className="preview-actions">
                    <Button
                      variant="primary"
                      disabledReason={lockedBy(chosen.item)}
                      onClick={() => equip(chosen.item.uid)}
                    >
                      {E.equip}
                    </Button>
                    <Button onClick={() => setSelected(null)}>{EN.meta.modal.cancel}</Button>
                  </div>
                </Panel>
              )}
              {message && (
                <p className="shop-message" role="status">
                  {message}
                </p>
              )}
            </div>
          )}
          <Panel
            title={E.owned}
            className="owned-panel"
            actions={
              <Tabs
                label="Filter by slot"
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
              <ul className="owned-rows" aria-label={E.owned}>
                {owned.map((item) => (
                  <li key={item.uid} className="owned-cell">
                    <TierFrame tier={isStarterUid(item.uid) ? 0 : rarityTier(item.rarity)}>
                      <button
                        className={`item-card ${selected === item.uid ? 'selected' : ''}`}
                        aria-pressed={selected === item.uid}
                        aria-label={`${nameOf(item)}${isEquipped(item) ? `, ${E.equipped.toLowerCase()}` : ''}`}
                        onClick={() => {
                          setSelected(selected === item.uid ? null : item.uid);
                          setSlotDetail(null);
                        }}
                        // Task 16: pointer events (mouse only: a touch tap must not leave a stuck
                        // hover preview; a tap selects the item instead).
                        onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(item.uid)}
                        onPointerLeave={(e) => e.pointerType === 'mouse' && setHovered(null)}
                        onFocus={() => setHovered(item.uid)}
                        onBlur={() => setHovered(null)}
                      >
                        <ItemIcon templateId={itemIconId(item)} size="itemCard" />
                        <strong>{nameOf(item)}</strong>
                        <small className="item-tier" style={{ color: rarityColor(item.rarity) }}>
                          {SLOT_LABELS[item.slot]} · {rarityLabel(item.rarity)}
                        </small>
                        <ItemStats item={item} characterClass={cls} />
                        {lockedBy(item) && <small className="item-locked">{lockedBy(item)}</small>}
                        {isEquipped(item) && <span className="item-stamp">{E.equipped}</span>}
                      </button>
                    </TierFrame>
                    {hover?.item.uid === item.uid && (
                      <Tooltip placement="top">
                        <strong className="compare-title">
                          <ItemIcon templateId={itemIconId(item)} size="itemSmall" />
                          {E.compare(nameOf(item))}
                        </strong>
                        <CompareList deltas={hover.deltas} empty={E.noChange} />
                      </Tooltip>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <Panel title={E.finalStats} className="final-stats">
          <table className="equipment-stats">
            <thead>
              <tr>
                <th>Stat</th>
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

/** Task 20: the profile's one active pet — the same slot for every class; opens «Pets». */
function PetSlot() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile!;
  const P = EN.meta.pets;
  const id = profile.activePet && isPetId(profile.activePet) ? profile.activePet : null;
  return (
    <div className="doll-slot doll-slot-pet kit-tier-frame tier-0">
      <button
        className="doll-slot-button pet-slot-button"
        aria-label={`${P.slot}: ${id ? PET_CONFIG[id].name : P.none}. ${P.change}`}
        onClick={() => campaignStore.setPage('pets')}
      >
        {id && <PetPortrait id={id} size={40} />}
        <span>
          <small>{P.slot}</small>
          <strong>{id ? PET_CONFIG[id].name : P.none}</strong>
          {id && (
            <span className="doll-tier">{petLevelLabel(petLevel(profile.petLevels, id))}</span>
          )}
        </span>
        <span className="pet-slot-change">{P.change} →</span>
      </button>
    </div>
  );
}
