import { useState, useSyncExternalStore } from 'react';
import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import { CLASS_LABELS } from '../gameplay';
import { uiSound } from './sound';
import {
  GEAR_SLOTS,
  GEAR_STAT_LABELS,
  SHOP_ITEMS,
  SLOT_LABELS,
  TIER_CONFIG,
  findItem,
  highestClearedMap,
  isOwned,
  isTierUnlocked,
  itemDisplayName,
  itemLevel,
  upgradedStats,
} from '../equipment';
import type { GearItem, GearSlot, GearStat, Tier } from '../equipment';
import { campaignStore } from './campaign-state';
import { PET_CONFIG, PET_IDS, checkPetPurchase, petLevel } from '../pets';
import type { PetId } from '../pets';
import { PetCard } from './meta/PetsScreen';
import { TierRows } from './meta/TierRows';
import {
  Button,
  ConfirmModal,
  CurrencyIcon,
  ItemIcon,
  Tabs,
  TierFrame,
  disabledReason,
} from './kit';
import { EN, formatNumber } from './strings-en';

/**
 * Task 11 §1.5 shop and equipment screens. They only read the profile and call the campaign
 * store; every change goes through the validated save (one atomic write per action).
 */
const useCampaign = () => useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
export const REFUSALS: Record<string, string> = {
  gold: 'Not enough Gold.',
  owned: 'Already bought.',
  locked: 'This item tier is still locked.',
  'not-owned': 'Item not bought.',
  'not-eligible': 'This class cannot equip the item.',
};
const statText = (stat: GearStat, value: number) => {
  const { label, unit } = GEAR_STAT_LABELS[stat];
  return `${label} +${Math.round(value * 10) / 10}${unit}`;
};
/** Item stat lines; Task 19: at the item's forge `level` (default +0). */
export function ItemStats({ item, level = 0 }: { item: GearItem; level?: number }) {
  const entries = Object.entries(upgradedStats(item, level)) as [GearStat, number][];
  if (!entries.length) return <p className="gear-stats">No bonuses</p>;
  return (
    <ul className="gear-stats">
      {entries.map(([stat, v]) => (
        <li key={stat}>{statText(stat, v)}</li>
      ))}
    </ul>
  );
}
const tierStyle = (item: GearItem) =>
  item.tier === 0 ? undefined : { borderColor: TIER_CONFIG[item.tier as Tier].color };
export const tierLabel = (item: GearItem) =>
  item.tier === 0 ? 'Starter' : TIER_CONFIG[item.tier as Tier].name;

/**
 * «Shop» (Task 13 restyle): slot tabs, weapons filtered by a class switcher (the selected class
 * first), item cards in tier frames with price badges, «Bought» / «Equipped» stamps and a locked
 * overlay «unlocks after map N». Buying asks for confirmation (kit modal) and goes through the
 * campaign store (one atomic save).
 */
export function ShopPage() {
  const ui = useCampaign();
  const profile = ui.progression.profile;
  // Task 20: the «Pets» tab sits after the gear slots.
  const [slot, setSlot] = useState<GearSlot | 'pets'>(ui.shopTab === 'pets' ? 'pets' : 'weapon');
  const [weaponClass, setWeaponClass] = useState<CharacterClass>(
    profile?.selectedClass ?? 'warrior',
  );
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  if (!profile) return <p className="campaign-empty">Profile unavailable.</p>;
  const cleared = highestClearedMap(profile.completedMaps);
  const state = { ownedItems: profile.ownedItems };
  const items = SHOP_ITEMS.filter(
    (i) => i.slot === slot && (slot !== 'weapon' || i.characterClass === weaponClass),
  );
  const equippedBy = (id: string) =>
    CHARACTER_CLASSES.filter((c) => Object.values(profile.classes[c].loadout).includes(id));
  const buying = confirming ? findItem(confirming) : undefined;
  return (
    <div className="campaign-page shop-page">
      <header className="meta-page-head">
        <h2 className="meta-title">Shop</h2>
        <Tabs
          label="Shop slots"
          items={[
            ...GEAR_SLOTS.map((s) => ({ id: s as GearSlot | 'pets', label: SLOT_LABELS[s] })),
            { id: 'pets' as const, label: EN.meta.pets.title },
          ]}
          value={slot}
          onChange={(s) => {
            setSlot(s);
            setConfirming(null);
          }}
        />
        {slot === 'weapon' && (
          <label className="shop-class">
            Weapons for{' '}
            <select
              aria-label="Weapon class"
              value={weaponClass}
              onChange={(e) => setWeaponClass(e.target.value as CharacterClass)}
            >
              {CHARACTER_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {CLASS_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>
      {slot === 'pets' ? (
        <PetShop />
      ) : (
        <>
          <p className="meta-note">
            Buying unlocks an item forever for every eligible class. Equipment changes take effect
            from the next run.
          </p>
          {message && (
            <p className="shop-message" role="status">
              {message}
            </p>
          )}
          <TierRows
            items={items}
            label="Goods"
            className="shop-rows"
            render={(item) => {
              const owned = isOwned(state, item);
              const wearing = equippedBy(item.id);
              const level = itemLevel(profile.itemLevels, item.id);
              const name = itemDisplayName(item, level);
              const open = isTierUnlocked(item.tier as Tier, cleared);
              const short = profile.gold < item.price;
              const unlockAt = TIER_CONFIG[item.tier as Tier].unlockAfterMap;
              const stateText = wearing.length
                ? `Equipped: ${wearing.map((c) => CLASS_LABELS[c]).join(', ')}`
                : owned
                  ? 'Bought'
                  : !open
                    ? `Unlocks after map ${unlockAt}`
                    : `${formatNumber(item.price)} Gold`;
              return (
                <li
                  key={item.id}
                  className={`shop-cell ${owned ? 'owned' : ''} ${open ? '' : 'locked'}`}
                  aria-label={`${name}: ${stateText}`}
                >
                  <TierFrame tier={item.tier} className="shop-card">
                    <div className="shop-card-head">
                      <ItemIcon templateId={item.templateId} size="itemCard" level={level} />
                      <strong>{name}</strong>
                      <small style={{ color: TIER_CONFIG[item.tier as Tier].color }}>
                        {tierLabel(item)}
                      </small>
                    </div>
                    <ItemStats item={item} level={level} />
                    <p className="shop-state">{stateText}</p>
                    {wearing.length > 0 ? (
                      <span className="item-stamp">{EN.meta.shop.equippedStamp}</span>
                    ) : owned ? (
                      <span className="item-stamp owned">{EN.meta.shop.owned}</span>
                    ) : open ? (
                      <Button
                        variant="primary"
                        size="s"
                        disabledReason={disabledReason([[short, 'Not enough Gold']])}
                        onClick={() => {
                          setConfirming(item.id);
                          setMessage('');
                        }}
                      >
                        Buy ·{' '}
                        <span className="price-badge">
                          <CurrencyIcon kind="gold" label="Gold" /> {formatNumber(item.price)}
                        </span>
                      </Button>
                    ) : (
                      <div className="shop-locked-overlay" aria-hidden="true">
                        🔒 {EN.meta.shop.lockedOverlay(unlockAt)}
                      </div>
                    )}
                  </TierFrame>
                </li>
              );
            }}
          />
        </>
      )}
      {buying && (
        <ConfirmModal
          title={`Buy “${buying.name}” for ${formatNumber(buying.price)} Gold?`}
          onConfirm={() => {
            const refused = campaignStore.buyItem(buying.id);
            uiSound(refused ? 'ui-error' : 'ui-buy');
            setConfirming(null);
            setMessage(
              refused ? (REFUSALS[refused] ?? 'Purchase failed.') : `Bought: ${buying.name}.`,
            );
          }}
          onCancel={() => setConfirming(null)}
        >
          <p>
            {formatNumber(profile.gold - buying.price)} Gold will remain. The item unlocks forever
            for every eligible class.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}

/**
 * Task 20 shop tab «Pets»: the three shop pets with price and «Buy» (confirmation, one
 * atomic save); quest pets are shown as «Quest reward» and cannot be bought.
 */
function PetShop() {
  const ui = useCampaign();
  const profile = ui.progression.profile!;
  const P = EN.meta.pets;
  const [confirming, setConfirming] = useState<PetId | null>(null);
  const [message, setMessage] = useState('');
  const pet = confirming ? PET_CONFIG[confirming] : null;
  const price = pet && pet.source.kind === 'shop' ? pet.source.price : 0;
  return (
    <>
      <p className="meta-note">{P.intro}</p>
      {message && (
        <p className="shop-message" role="status">
          {message}
        </p>
      )}
      <ul className="pet-grid" aria-label="Pets in the shop">
        {PET_IDS.map((id) => {
          const def = PET_CONFIG[id];
          const owned = profile.ownedPets.includes(id);
          const check = checkPetPurchase(
            {
              gold: profile.gold,
              ore: profile.ore,
              ownedPets: profile.ownedPets,
              petLevels: profile.petLevels,
              activePet: profile.activePet,
            },
            id,
          );
          return (
            <li key={id}>
              <PetCard
                id={id}
                level={petLevel(profile.petLevels, id)}
                owned={owned}
                active={profile.activePet === id}
                actions={
                  owned ? (
                    <span className="item-stamp owned">{EN.meta.shop.owned}</span>
                  ) : def.source.kind === 'shop' ? (
                    <Button
                      variant="primary"
                      size="s"
                      disabledReason={!check.ok && check.reason === 'gold' ? P.refusals.gold : null}
                      onClick={() => {
                        setConfirming(id);
                        setMessage('');
                      }}
                    >
                      {P.buy} ·{' '}
                      <span className="price-badge">
                        <CurrencyIcon kind="gold" label="Gold" /> {def.source.price}
                      </span>
                    </Button>
                  ) : null
                }
              />
            </li>
          );
        })}
      </ul>
      {pet && (
        <ConfirmModal
          title={P.confirmBuy(pet.name, price)}
          onConfirm={() => {
            const refused = campaignStore.buyPet(pet.id);
            uiSound(refused ? 'ui-error' : 'ui-buy');
            setConfirming(null);
            setMessage(refused ? (P.refusals[refused] ?? P.failed) : P.bought(pet.name));
          }}
          onCancel={() => setConfirming(null)}
        >
          <p>
            {formatNumber(profile.gold - price)} Gold will remain. The pet unlocks forever for the
            whole profile.
          </p>
        </ConfirmModal>
      )}
    </>
  );
}
