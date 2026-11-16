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
import { EN } from '../strings-en';
import { tierLabel } from '../ShopPages';
import {
  PET_CONFIG,
  PET_LEVEL_RULES,
  checkPetUpgrade,
  isPetId,
  petLevel,
  petUpgradeCost,
} from '../../pets';
import { PetPortrait } from '../pets/PetPortrait';
import { petEffectLines, petLevelLabel } from '../pets/pet-text';

const F = EN.meta.forge;
type SlotFilter = GearSlot | 'all';
const fmt = (stat: GearStat, v: number) =>
  `+${Math.round(v * 100) / 100}${GEAR_STAT_LABELS[stat].unit}`;

/**
 * Task 19 «Forge»: owned items (filter by slot), the selected item's current vs next stats, the
 * Gold + ore cost and «Upgrade». An upgrade always succeeds; it goes through the campaign store
 * (Gold, ore and the level in one validated save). Reads state; store actions only.
 */
export function ForgePage() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile;
  // Task 20: «Items» / «Pets» tabs (a `pet:<id>` preselection opens the pets tab).
  const [tab, setTab] = useState<'items' | 'pets'>(
    ui.forgeItem?.startsWith('pet:') ? 'pets' : 'items',
  );
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
  if (!profile) return <p className="campaign-empty">Profile unavailable.</p>;
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
        {/* Task 22: opened from Equipment → back returns there (same class). */}
        {ui.forgeReturn && (
          <Button variant="ghost" onClick={() => campaignStore.forgeBack()}>
            ← {F.backToEquipment}
          </Button>
        )}
        <h2 className="meta-title">{F.title}</h2>
        <span className="forge-wallet">
          <CurrencyBadge amount={profile.gold} />
          <OreBadge amount={profile.ore} />
        </span>
      </header>
      {/* Task 22: a prominent centred mode switch (Items / Pets). */}
      <Tabs
        label="Forge sections"
        className="forge-mode"
        items={[
          {
            id: 'items' as const,
            label: (
              <>
                <span aria-hidden="true">⚒</span> {F.items}
              </>
            ),
          },
          {
            id: 'pets' as const,
            label: (
              <>
                <span aria-hidden="true">❦</span> {EN.meta.pets.title}
              </>
            ),
          },
        ]}
        value={tab}
        onChange={(t) => {
          setTab(t);
          setMessage(null);
        }}
      />
      {tab === 'pets' ? (
        <PetForge initial={ui.forgeItem?.startsWith('pet:') ? ui.forgeItem.slice(4) : null} />
      ) : (
        <>
          <p className="meta-note">{F.intro}</p>
          <section className="forge-layout">
            <Panel
              title={F.items}
              className="forge-items"
              actions={
                <Tabs
                  label="Forge slot filter"
                  items={[
                    { id: 'all' as SlotFilter, label: EN.meta.equipment.all },
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
              aria-label="Item upgrade"
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
        </>
      )}
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
            <th>Stat</th>
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
        ⚒ {maxed ? F.maxed : `${F.upgrade} to +${level + 1}`}
      </Button>
    </div>
  );
}

/**
 * Task 20 forge tab «Pets»: owned pets, the selected pet's effect now and at the next level,
 * the Gold + ore cost and «Upgrade to level N» (one validated save; always succeeds).
 */
function PetForge({ initial }: { initial: string | null }) {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile!;
  const P = EN.meta.pets;
  const owned = profile.ownedPets.filter(isPetId);
  const [picked, setPicked] = useState<string | null>(initial);
  const [message, setMessage] = useState<Readonly<{ tone: 'ok' | 'error'; text: string }> | null>(
    null,
  );
  const selected = owned.find((id) => id === picked) ?? owned[0] ?? null;
  if (!selected) return <p className="meta-empty">{P.locked}: buy a pet in the shop.</p>;
  const level = petLevel(profile.petLevels, selected);
  const maxed = level >= PET_LEVEL_RULES.maxLevel;
  const cost = maxed ? null : petUpgradeCost(level + 1);
  const check = checkPetUpgrade(
    {
      gold: profile.gold,
      ore: profile.ore,
      ownedPets: profile.ownedPets,
      petLevels: profile.petLevels,
      activePet: profile.activePet,
    },
    selected,
  );
  const reason = check.ok ? null : (P.refusals[check.reason] ?? P.failed);
  const upgrade = () => {
    const refused = campaignStore.upgradePet(selected);
    uiSound(refused ? 'ui-error' : 'ui-confirm');
    setMessage(
      refused
        ? { tone: 'error', text: P.refusals[refused] ?? P.failed }
        : { tone: 'ok', text: P.upgraded(PET_CONFIG[selected].name, level + 1) },
    );
  };
  return (
    <section className="forge-layout pet-forge">
      <Panel title={P.title} className="forge-items">
        <ul className="owned-grid forge-grid">
          {owned.map((id) => (
            <li key={id}>
              <button
                className={`item-card forge-card pet-forge-card ${id === selected ? 'selected' : ''}`}
                aria-pressed={id === selected}
                onClick={() => {
                  setPicked(id);
                  setMessage(null);
                }}
              >
                <PetPortrait id={id} size={44} />
                <strong>{PET_CONFIG[id].name}</strong>
                <small className="item-tier">
                  {petLevelLabel(petLevel(profile.petLevels, id))}
                </small>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel
        className="forge-detail"
        role="group"
        aria-label="Pet upgrade"
        title={`${PET_CONFIG[selected].name} · ${petLevelLabel(level)}`}
      >
        <div className="forge-detail-body">
          <div className="pet-effects">
            <small>{P.now}</small>
            <ul>
              {petEffectLines(selected, level).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {!maxed && (
              <>
                <small>{P.next(level + 1)}</small>
                <ul className="pet-next">
                  {petEffectLines(selected, level + 1).map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          {cost ? (
            <div className="forge-cost">
              <span>{F.cost}</span>
              <span className={profile.gold < cost.gold ? 'short' : undefined}>
                <CurrencyBadge amount={cost.gold} size="s" />
              </span>
              <span className={profile.ore < cost.ore ? 'short' : undefined}>
                <OreBadge amount={cost.ore} size="s" />
              </span>
            </div>
          ) : (
            <p className="forge-maxed">{P.maxed}</p>
          )}
          <Button variant="primary" disabledReason={reason} onClick={upgrade}>
            ⚒ {maxed ? P.maxed : P.upgrade(level + 1)}
          </Button>
        </div>
        {message && (
          <p className={`shop-message forge-message forge-${message.tone}`} role="status">
            {message.text}
          </p>
        )}
      </Panel>
    </section>
  );
}
