import { useEffect, useState, useSyncExternalStore } from 'react';
import { uiSound } from '../sound';
import { CHARACTER_CLASSES } from '../../character-stats';
import type { CharacterClass } from '../../character-stats';
import { CLASS_LABELS } from '../../gameplay';
import {
  AFFIX_RULES,
  LEGENDARY_TEXT,
  isLegendaryId,
  bagCapacity,
  canReforge,
  nextExpansionPrice,
  reforgeCost,
  GEAR_SLOTS,
  RARITIES,
  SLOT_LABELS,
  SLOT_UPGRADE_RULES,
  bagView,
  equipBlock,
  equippedBy,
  findOwned,
  isBetter,
  isStarterUid,
  itemIconId,
  itemName,
  lowRaritySalvage,
  nextSlotMilestone,
  salvageOre,
  salvageTotal,
  slotMainMultiplier,
  slotSecondaryMultiplier,
  slotUpgradeCost,
  starterWeapon,
} from '../../equipment';
import type { AffixStat, BagSort, GearSlot, ItemInstance, Rarity } from '../../equipment';
import { equipmentStateOf } from '../../profile';
import { campaignStore } from '../campaign-state';
import { Button, ConfirmModal, CurrencyIcon, ItemIcon, Panel, Tabs, TierFrame } from '../kit';
import { EN, formatNumber } from '../strings-en';
import { REFUSALS } from '../ShopPages';
import { rarityColor, rarityLabel, rarityTier, slottedLines, statNumber } from '../item-view';

const B = EN.meta.bag;
type SlotFilter = GearSlot | 'all';
type RarityFilter = Rarity | 'all';
/** A pending salvage: first the total, then (with any Legendary) a separate confirmation. */
type Salvage = { uids: readonly string[]; step: 'total' | 'legendary' };

/**
 * Task 41 Bag screen (replaces the Equipment page): equipped slots with the slot upgrade (left),
 * the bag grid with filters, sort, markers and multi-select salvage (middle), the selected item's
 * card with slot-bonus stats and differences, Equip / Salvage (right). Every change is one
 * validated save through the campaign store.
 */
export function BagPage() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile;
  const [shown, setShown] = useState<CharacterClass | null>(null);
  const [slot, setSlot] = useState<GearSlot>('weapon');
  const [slotFilter, setSlotFilter] = useState<SlotFilter>('all');
  const [rarity, setRarity] = useState<RarityFilter>('all');
  const [sort, setSort] = useState<BagSort>('level');
  const [allClasses, setAllClasses] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [marked, setMarked] = useState<readonly string[]>([]);
  const [salvage, setSalvage] = useState<Salvage | null>(null);
  const [message, setMessage] = useState('');
  const [expanding, setExpanding] = useState(false);
  const [reforging, setReforging] = useState<{ uid: string; stat: AffixStat } | null>(null);
  // Viewing an item's card clears its «new» marker (saved).
  useEffect(() => {
    if (selected) campaignStore.markItemsSeen([selected]);
  }, [selected]);
  if (!profile) return <p className="campaign-empty">Profile unavailable.</p>;
  const cls = shown ?? ui.viewClass ?? profile.selectedClass;
  const progress = profile.classes[cls];
  const loadouts = equipmentStateOf(profile).loadouts;
  const loadout = progress.loadout;
  const find = (uid: string | null) => (uid ? findOwned(profile.items, uid, cls) : null);
  const worn = (s: GearSlot) => find(loadout[s]);
  const level = (s: GearSlot) => progress.slotLevels[s];
  const isNew = (uid: string) => profile.newItems.includes(uid);
  const wornBy = (uid: string) => equippedBy(loadouts, uid);
  const grid = bagView(profile.items, {
    characterClass: cls,
    rarity,
    slot: slotFilter,
    showAllClasses: allClasses,
    sort,
  });
  // The class's starter weapon is not in the bag, but stays selectable to re-equip it.
  const starter = starterWeapon(cls);
  const showStarter = (slotFilter === 'all' || slotFilter === 'weapon') && rarity !== 'legendary';
  const card = find(selected) ?? (selected ? null : worn(slot));
  const lowRarity = lowRaritySalvage(profile.items, loadouts);
  const itemsOf = (uids: readonly string[]) =>
    uids.map((u) => profile.items.find((i) => i.uid === u)).filter((i): i is ItemInstance => !!i);
  const flash = (refused: string | null, ok: string) => {
    uiSound(refused ? 'ui-error' : 'ui-confirm');
    setMessage(refused ? (REFUSALS[refused] ?? B.failed) : ok);
  };
  const runSalvage = (uids: readonly string[]) => {
    const ore = salvageTotal(itemsOf(uids));
    const refused = campaignStore.salvageItems(uids);
    flash(refused, B.salvaged(uids.length, ore));
    if (!refused) {
      setMarked([]);
      setMarking(false);
      if (selected && uids.includes(selected)) setSelected(null);
    }
    setSalvage(null);
  };
  const askSalvage = (uids: readonly string[]) => {
    if (uids.length) setSalvage({ uids, step: 'total' });
  };
  // ── Left: the upgrade of the selected slot ──
  const lv = level(slot);
  const atMax = lv >= SLOT_UPGRADE_RULES.maxLevel;
  const cost = atMax ? null : slotUpgradeCost(lv + 1);
  const short = cost
    ? [
        profile.gold < cost.gold ? B.needGold(cost.gold - profile.gold) : null,
        profile.ore < cost.ore ? B.needOre(cost.ore - profile.ore) : null,
      ].filter((s): s is string => !!s)
    : [];
  const milestone = nextSlotMilestone(lv);
  const expansionPrice = nextExpansionPrice(profile.bagExpansions);
  const reforgeTarget = reforging ? profile.items.find((i) => i.uid === reforging.uid) : null;
  return (
    <div className="bag-screen">
      <header className="meta-page-head">
        <h2 className="meta-title">{B.title}</h2>
        <Tabs
          label="Bag class"
          items={CHARACTER_CLASSES.map((c) => ({ id: c, label: CLASS_LABELS[c] }))}
          value={cls}
          onChange={(c) => {
            setShown(c);
            setSelected(null);
            setMarked([]);
          }}
        />
        <Button variant="ghost" className="meta-push" onClick={() => campaignStore.setPage('shop')}>
          ⚖ {EN.meta.equipment.toShop} →
        </Button>
      </header>
      {message && (
        <p className="shop-message" role="status">
          {message}
        </p>
      )}
      <section className="bag-layout" aria-label={`Bag: ${CLASS_LABELS[cls]}`}>
        <Panel title={B.equipped} className="bag-equipped" role="group" aria-label={B.equipped}>
          <ul className="bag-slot-rows">
            {GEAR_SLOTS.map((s) => {
              const item = worn(s);
              return (
                <li key={s}>
                  <button
                    className={`bag-slot-row ${slot === s ? 'selected' : ''}`}
                    aria-pressed={slot === s}
                    aria-label={`${SLOT_LABELS[s]} +${level(s)}: ${item ? itemName(item) : B.empty}`}
                    onClick={() => {
                      setSlot(s);
                      setSlotFilter(s);
                      setSelected(null);
                    }}
                  >
                    <span className="bag-slot-name">{SLOT_LABELS[s]}</span>
                    <span className="bag-slot-level">+{level(s)}</span>
                    <span
                      className="bag-slot-item"
                      style={item ? { color: rarityColor(item.rarity) } : undefined}
                    >
                      {item ? itemName(item) : B.empty}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="bag-upgrade" role="group" aria-label="Slot upgrade">
            <h4>
              {SLOT_LABELS[slot]} +{lv}
            </h4>
            <p className="meta-note">
              {B.bonuses(
                statNumber(slotMainMultiplier(lv), 2),
                statNumber(slotSecondaryMultiplier(lv), 2),
              )}
            </p>
            <p className="meta-note">{milestone ? B.nextMilestone(milestone) : B.allMilestones}</p>
            <Button
              variant="primary"
              disabledReason={atMax ? B.maxed : short.length ? short.join(' · ') : null}
              onClick={() =>
                flash(campaignStore.upgradeSlot(cls, slot), B.upgraded(SLOT_LABELS[slot], lv + 1))
              }
            >
              {atMax ? B.maxed : B.upgrade(lv + 1)}
              {cost && (
                <span className="price-badge">
                  <CurrencyIcon kind="gold" label="Gold" /> {formatNumber(cost.gold)}{' '}
                  <CurrencyIcon kind="ore" label="Ore" /> {formatNumber(cost.ore)}
                </span>
              )}
            </Button>
            {short.length > 0 && <p className="bag-short">{short.join(' · ')}</p>}
          </div>
        </Panel>
        <Panel
          title={
            <span
              className={
                profile.items.length > bagCapacity(profile.bagExpansions) ? 'bag-over' : undefined
              }
            >
              {B.count(profile.items.length, bagCapacity(profile.bagExpansions))}
            </span>
          }
          className="bag-items"
          actions={
            <>
              {expansionPrice !== null && (
                <Button
                  size="s"
                  variant="ghost"
                  disabledReason={
                    profile.gold < expansionPrice ? B.needGold(expansionPrice - profile.gold) : null
                  }
                  onClick={() => setExpanding(true)}
                >
                  {B.expand} ·{' '}
                  <span className="price-badge">
                    <CurrencyIcon kind="gold" label="Gold" /> {formatNumber(expansionPrice)}
                  </span>
                </Button>
              )}
              <Button
                size="s"
                variant={marking ? 'primary' : 'ghost'}
                aria-pressed={marking}
                onClick={() => {
                  setMarking(!marking);
                  setMarked([]);
                }}
              >
                {B.select}
              </Button>
            </>
          }
        >
          <div className="bag-filters">
            <Tabs
              label="Filter by rarity"
              items={[
                { id: 'all' as RarityFilter, label: B.all },
                ...RARITIES.map((r) => ({ id: r as RarityFilter, label: rarityLabel(r) })),
              ]}
              value={rarity}
              onChange={setRarity}
            />
            <Tabs
              label="Filter by slot"
              items={[
                { id: 'all' as SlotFilter, label: B.all },
                ...GEAR_SLOTS.map((s) => ({ id: s as SlotFilter, label: SLOT_LABELS[s] })),
              ]}
              value={slotFilter}
              onChange={setSlotFilter}
            />
            <Tabs
              label="Sort"
              items={[
                { id: 'level' as BagSort, label: B.sortLevel },
                { id: 'rarity' as BagSort, label: B.sortRarity },
                { id: 'newest' as BagSort, label: B.sortNewest },
              ]}
              value={sort}
              onChange={setSort}
            />
            {slotFilter === 'weapon' && (
              <label className="bag-toggle">
                <input
                  type="checkbox"
                  checked={allClasses}
                  onChange={(e) => setAllClasses(e.target.checked)}
                />{' '}
                {B.allClasses}
              </label>
            )}
          </div>
          {marking && (
            <div className="bag-bulk">
              <Button
                variant="danger"
                size="s"
                disabledReason={marked.length ? null : B.markFirst}
                onClick={() => askSalvage(marked)}
              >
                {B.salvageMarked(marked.length, salvageTotal(itemsOf(marked)))}
              </Button>
              <Button
                size="s"
                disabledReason={lowRarity.length ? null : B.nothingLow}
                onClick={() => askSalvage(lowRarity)}
              >
                {B.salvageLow(salvageTotal(itemsOf(lowRarity)))}
              </Button>
            </div>
          )}
          {grid.length === 0 && !showStarter ? (
            <p className="meta-empty">{B.noItems}</p>
          ) : (
            <ul className="bag-grid" aria-label="Bag items">
              {[...(showStarter ? [starter] : []), ...grid].map((item) => {
                const starterItem = isStarterUid(item.uid);
                const equippedHere = loadout[item.slot] === item.uid;
                const better =
                  !equippedHere && isBetter(item, loadouts, profile.items, cls, level(item.slot));
                const locked = wornBy(item.uid).length > 0;
                const isMarked = marked.includes(item.uid);
                const name = itemName(item);
                return (
                  <li key={item.uid}>
                    <TierFrame tier={starterItem ? 0 : rarityTier(item.rarity)}>
                      <button
                        className={`bag-cell ${selected === item.uid ? 'selected' : ''} ${isMarked ? 'marked' : ''}`}
                        aria-pressed={marking ? isMarked : selected === item.uid}
                        aria-label={[
                          name,
                          `L${item.itemLevel}`,
                          isNew(item.uid) ? B.markerNew : null,
                          better ? B.markerBetter : null,
                          equippedHere ? B.markerEquipped : null,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                        title={name}
                        onClick={() => {
                          if (marking) {
                            if (starterItem || locked) return;
                            setMarked(
                              isMarked
                                ? marked.filter((u) => u !== item.uid)
                                : [...marked, item.uid],
                            );
                          } else setSelected(selected === item.uid ? null : item.uid);
                        }}
                      >
                        <ItemIcon templateId={itemIconId(item)} size="itemCard" />
                        <span className="bag-cell-level">L{item.itemLevel}</span>
                        <span className="bag-markers">
                          {isNew(item.uid) && <span className="bag-marker new">{B.markerNew}</span>}
                          {better && <span className="bag-marker better">▲</span>}
                          {equippedHere && <span className="bag-marker equipped">E</span>}
                          {marking && (locked || starterItem) && (
                            <span className="bag-marker locked">🔒</span>
                          )}
                        </span>
                      </button>
                    </TierFrame>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel className="bag-card" role="group" aria-label="Item card">
          {card ? (
            <ItemCard
              key={card.uid}
              item={card}
              cls={cls}
              slotLevel={level(card.slot)}
              worn={worn(card.slot)}
              equippedHere={loadout[card.slot] === card.uid}
              wornBy={wornBy(card.uid)}
              classLevel={progress.level}
              onEquip={() => {
                const refused = campaignStore.equipItem(cls, card.uid);
                flash(refused, B.equippedMsg(itemName(card)));
              }}
              onUnequip={() => {
                const refused = campaignStore.unequipSlot(cls, card.slot);
                flash(refused, B.unequippedMsg(itemName(card)));
              }}
              onSalvage={() => askSalvage([card.uid])}
              onReforge={(stat) => setReforging({ uid: card.uid, stat })}
            />
          ) : (
            <p className="meta-empty">{B.pick}</p>
          )}
        </Panel>
      </section>
      {expanding && expansionPrice !== null && (
        <ConfirmModal
          title={B.expandTitle(formatNumber(expansionPrice))}
          onConfirm={() => {
            setExpanding(false);
            flash(
              campaignStore.buyBagExpansion(),
              B.expanded(bagCapacity(profile.bagExpansions + 1)),
            );
          }}
          onCancel={() => setExpanding(false)}
        >
          <p>{B.expandText}</p>
        </ConfirmModal>
      )}
      {reforging && reforgeTarget && (
        <ConfirmModal
          title={B.reforgeTitle(
            AFFIX_RULES[reforging.stat].label,
            formatNumber(reforgeCost(reforgeTarget)),
          )}
          onConfirm={() => {
            const name = itemName(reforgeTarget);
            setReforging(null);
            flash(campaignStore.reforgeItem(reforging.uid, reforging.stat, cls), B.reforged(name));
          }}
          onCancel={() => setReforging(null)}
        >
          <p>{B.reforgeText}</p>
        </ConfirmModal>
      )}
      {salvage && (
        <SalvageConfirm
          items={itemsOf(salvage.uids)}
          step={salvage.step}
          onConfirm={() => {
            const legendary = itemsOf(salvage.uids).filter((i) => i.rarity === 'legendary');
            if (salvage.step === 'total' && legendary.length)
              setSalvage({ ...salvage, step: 'legendary' });
            else runSalvage(salvage.uids);
          }}
          onCancel={() => setSalvage(null)}
        />
      )}
    </div>
  );
}

function ItemCard({
  item,
  cls,
  slotLevel,
  worn,
  equippedHere,
  wornBy,
  classLevel,
  onEquip,
  onUnequip,
  onSalvage,
  onReforge,
}: {
  item: ItemInstance;
  cls: CharacterClass;
  slotLevel: number;
  worn: ItemInstance | null;
  equippedHere: boolean;
  wornBy: readonly CharacterClass[];
  classLevel: number;
  onEquip: () => void;
  onUnequip: () => void;
  onSalvage: () => void;
  onReforge: (stat: AffixStat) => void;
}) {
  const [stat, setStat] = useState<AffixStat | ''>('');
  const reforgeable = canReforge(item) && !isStarterUid(item.uid);
  const starter = isStarterUid(item.uid);
  const block = equipBlock(item, cls, classLevel);
  const lines = slottedLines(item, cls, slotLevel, equippedHere ? null : worn);
  return (
    <div className="bag-card-body">
      <div className="bag-card-head">
        <ItemIcon templateId={itemIconId(item)} size="itemDetail" />
        <div>
          <h3 style={{ color: rarityColor(item.rarity) }}>{itemName(item)}</h3>
          <p className="bag-card-meta">
            {rarityLabel(item.rarity)} · {SLOT_LABELS[item.slot]} · Item level {item.itemLevel}
            {slotLevel > 0 && ` · slot +${slotLevel}`}
          </p>
        </div>
      </div>
      <ul className="bag-card-stats">
        {lines.map((l) => (
          <li key={l.key}>
            <span>{l.text}</span>
            {l.deltaText !== undefined && (
              <span
                className={`bag-delta ${l.delta === null ? 'new' : l.delta! > 0 ? 'up' : l.delta! < 0 ? 'down' : 'same'}`}
              >
                {l.deltaText}
              </span>
            )}
          </li>
        ))}
      </ul>
      {reforgeable && (
        <div className="bag-reforge" role="group" aria-label="Reforge">
          <select
            aria-label="Stat to reforge"
            value={stat}
            onChange={(e) => setStat(e.target.value as AffixStat | '')}
          >
            <option value="">{B.pickStat}</option>
            {item.affixes.map((a) => (
              <option key={a.stat} value={a.stat}>
                {AFFIX_RULES[a.stat].label}
              </option>
            ))}
          </select>
          <Button
            size="s"
            disabledReason={stat ? null : B.pickStat}
            onClick={() => stat && onReforge(stat)}
          >
            {B.reforge} ·{' '}
            <span className="price-badge">
              <CurrencyIcon kind="gold" label="Gold" /> {formatNumber(reforgeCost(item))}
            </span>
          </Button>
        </div>
      )}
      {item.legendaryId && isLegendaryId(item.legendaryId) && (
        <p className="bag-legendary-effect">
          <strong>Unique:</strong> {LEGENDARY_TEXT[item.legendaryId]}
        </p>
      )}
      {block === 'level' && <p className="bag-gate">{B.requires(item.itemLevel)}</p>}
      {wornBy.length > 0 && (
        <p className="bag-worn">{B.equippedBy(wornBy.map((c) => CLASS_LABELS[c]).join(', '))}</p>
      )}
      <div className="preview-actions">
        {equippedHere ? (
          !starter && <Button onClick={onUnequip}>{EN.meta.equipment.unequip}</Button>
        ) : (
          <Button
            variant="primary"
            disabledReason={
              block === 'level'
                ? B.requires(item.itemLevel)
                : block === 'not-eligible'
                  ? REFUSALS['not-eligible']
                  : null
            }
            onClick={onEquip}
          >
            {EN.meta.equipment.equip}
          </Button>
        )}
        {!starter && (
          <Button
            variant="danger"
            disabledReason={
              wornBy.length ? B.equippedBy(wornBy.map((c) => CLASS_LABELS[c]).join(', ')) : null
            }
            onClick={onSalvage}
          >
            {B.salvageOne(salvageOre(item))}
          </Button>
        )}
      </div>
    </div>
  );
}

function SalvageConfirm({
  items,
  step,
  onConfirm,
  onCancel,
}: {
  items: readonly ItemInstance[];
  step: 'total' | 'legendary';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const legendary = items.filter((i) => i.rarity === 'legendary');
  return step === 'total' ? (
    <ConfirmModal
      title={B.confirmTitle(items.length, salvageTotal(items))}
      variant="danger"
      confirmLabel={B.confirm}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>{B.confirmText}</p>
    </ConfirmModal>
  ) : (
    <ConfirmModal
      title={B.confirmLegendary(legendary.length)}
      variant="danger"
      confirmLabel={B.confirm}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>{legendary.map((i) => itemName(i)).join(', ')}</p>
    </ConfirmModal>
  );
}
