import { useState, useSyncExternalStore } from 'react';
import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import { CLASS_LABELS } from '../gameplay';
import { uiSound } from './sound';
import {
  GEAR_SLOTS,
  ITEM_LEVEL_RANGE,
  SLOT_LABELS,
  bagFull,
  findOwned,
  isBetter,
  itemIconId,
  itemName,
  offerItem,
} from '../equipment';
import type { GearSlot, ShopOffer } from '../equipment';
import { equipmentStateOf, shopOffersOf, stockOf } from '../profile';
import { campaignStore } from './campaign-state';
import { PET_CONFIG, PET_IDS, checkPetPurchase, petLevel } from '../pets';
import type { PetId } from '../pets';
import { PetCard } from './meta/PetsScreen';
import {
  Button,
  ConfirmModal,
  CurrencyBadge,
  CurrencyIcon,
  OreBadge,
  ItemIcon,
  Tabs,
  TierFrame,
  disabledReason,
} from './kit';
import { rarityColor, rarityTier, slottedLines } from './item-view';
import { EN, formatNumber } from './strings-en';

/**
 * Task 40 shop: Common and Uncommon items at item level = the class level — per slot one Common
 * and three Uncommon offers (a seeded stock that stays the same until the class levels up; a
 * bought offer is gone until then). Task 41 §5a: compact rows (the 4 offers side by side), «All»
 * first, main-stat compare with the worn item. Every change is one validated save.
 */
const useCampaign = () => useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
export const REFUSALS: Record<string, string> = {
  gold: 'Not enough Gold.',
  'sold-out': 'Already bought at this level.',
  'unknown-offer': 'This offer is gone.',
  'not-owned': 'Item not owned.',
  'not-eligible': 'This class cannot equip the item.',
  level: 'The class level is below the item level.',
  'bag-full': 'Bag is full — salvage something first.',
  equipped: 'An equipped item cannot be salvaged.',
  ore: 'Not enough Ore.',
  max: 'The slot is already at +30.',
};

export function ShopPage() {
  const ui = useCampaign();
  const profile = ui.progression.profile;
  // Task 20: the «Pets» tab sits after the gear slots. Task 41: «All» (every slot) comes first.
  const [tab, setTab] = useState<GearSlot | 'all' | 'pets'>(ui.shopTab === 'pets' ? 'pets' : 'all');
  const [shopClass, setShopClass] = useState<CharacterClass>(profile?.selectedClass ?? 'warrior');
  const [confirming, setConfirming] = useState<ShopOffer | null>(null);
  const [message, setMessage] = useState('');
  if (!profile) return <p className="campaign-empty">Profile unavailable.</p>;
  const level = profile.classes[shopClass].level;
  const preview = (o: ShopOffer) => offerItem(o, shopClass, 'preview');
  const slots = tab === 'all' ? GEAR_SLOTS : tab === 'pets' ? [] : [tab];
  return (
    <div className="campaign-page shop-page">
      <header className="meta-page-head">
        <h2 className="meta-title">Shop</h2>
        <Tabs
          label="Shop slots"
          items={[
            { id: 'all' as const, label: 'All' },
            ...GEAR_SLOTS.map((s) => ({
              id: s as GearSlot | 'all' | 'pets',
              label: SLOT_LABELS[s],
            })),
            { id: 'pets' as const, label: EN.meta.pets.title },
          ]}
          value={tab}
          onChange={(s) => {
            setTab(s);
            setConfirming(null);
          }}
        />
        {tab !== 'pets' && (
          <label className="shop-class">
            Stock for{' '}
            <select
              aria-label="Shop class"
              value={shopClass}
              onChange={(e) => setShopClass(e.target.value as CharacterClass)}
            >
              {CHARACTER_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {CLASS_LABELS[c]} (level {profile.classes[c].level})
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="shop-wallet meta-push">
          <CurrencyBadge amount={profile.gold} size="s" />
          <OreBadge amount={profile.ore} size="s" />
        </span>
      </header>
      {tab === 'pets' ? (
        <PetShop />
      ) : (
        <>
          <p className="meta-note shop-level-line">
            {level >= ITEM_LEVEL_RANGE.max
              ? `Item level ${level}`
              : `Item level ${level} · new stock at level ${level + 1}`}
            {bagFull(profile.items, profile.bagExpansions) && ` · ${REFUSALS['bag-full']}`}
          </p>
          {message && (
            <p className="shop-message" role="status">
              {message}
            </p>
          )}
          <div className="shop-rows-compact" aria-label="Goods">
            {slots.map((slot) => (
              <OfferRow
                key={slot}
                slot={slot}
                characterClass={shopClass}
                onBuy={(offer) => {
                  setConfirming(offer);
                  setMessage('');
                }}
              />
            ))}
          </div>
        </>
      )}
      {confirming && (
        <ConfirmModal
          title={`Buy “${itemName(preview(confirming))}” for ${formatNumber(confirming.price)} Gold?`}
          onConfirm={() => {
            const name = itemName(preview(confirming));
            const refused = campaignStore.buyOffer(shopClass, confirming.id);
            uiSound(refused ? 'ui-error' : 'ui-buy');
            setConfirming(null);
            setMessage(refused ? (REFUSALS[refused] ?? 'Purchase failed.') : `Bought: ${name}.`);
          }}
          onCancel={() => setConfirming(null)}
        >
          <p>{formatNumber(profile.gold - confirming.price)} Gold will remain.</p>
        </ConfirmModal>
      )}
    </div>
  );
}

/**
 * Task 41 §5a: one compact row per slot — the slot's 4 offers (Common + 3 Uncommon) side by side.
 * Each card compares its main stat with what the class wears there (slot bonus included); a bought
 * offer stays as a greyed placeholder so the row doesn't jump.
 */
function OfferRow({
  slot,
  characterClass,
  onBuy,
}: {
  slot: GearSlot;
  characterClass: CharacterClass;
  onBuy: (offer: ShopOffer) => void;
}) {
  const profile = useCampaign().progression.profile!;
  const progress = profile.classes[characterClass];
  const stock = stockOf(profile, characterClass).filter((o) => o.slot === slot);
  const open = new Set(shopOffersOf(profile, characterClass).map((o) => o.id));
  const loadouts = equipmentStateOf(profile).loadouts;
  const wornUid = progress.loadout[slot];
  const worn = wornUid ? findOwned(profile.items, wornUid, characterClass) : null;
  const slotLevel = progress.slotLevels[slot];
  const full = bagFull(profile.items, profile.bagExpansions);
  return (
    <section className="shop-slot-row" aria-label={SLOT_LABELS[slot]}>
      <h4 className="shop-slot-label">{SLOT_LABELS[slot]}</h4>
      <ul className="shop-offers">
        {stock.map((offer) => {
          const item = offerItem(offer, characterClass, 'preview');
          const name = itemName(item);
          if (!open.has(offer.id))
            return (
              <li key={offer.id} className="shop-cell sold" aria-label={`${name}: sold out`}>
                <div className="shop-offer sold">{EN.meta.shop.soldOut}</div>
              </li>
            );
          const lines = slottedLines(item, characterClass, slotLevel, worn);
          const main = lines.filter((l) => MAIN_KEYS.has(l.key));
          const affix = lines.find((l) => !MAIN_KEYS.has(l.key));
          const better = isBetter(item, loadouts, profile.items, characterClass, slotLevel);
          return (
            <li
              key={offer.id}
              className="shop-cell"
              aria-label={`${name}: ${formatNumber(offer.price)} Gold`}
            >
              <TierFrame tier={rarityTier(item.rarity)} className="shop-offer">
                <div className="shop-offer-head">
                  <ItemIcon templateId={itemIconId(item)} size="itemSmall" />
                  <strong style={{ color: rarityColor(item.rarity) }}>{name}</strong>
                  <small>L{item.itemLevel}</small>
                  {better && <span className="bag-marker better">better</span>}
                </div>
                <p className="shop-offer-line">
                  {main.map((l, i) => (
                    <span key={l.key}>
                      {i > 0 && ' · '}
                      {l.text}
                      {l.deltaText !== undefined && l.delta !== 0 && (
                        <span className={`bag-delta ${l.delta! > 0 ? 'up' : 'down'}`}>
                          {' '}
                          {l.deltaText}
                        </span>
                      )}
                    </span>
                  ))}
                </p>
                {affix && <p className="shop-offer-line affix">{affix.text}</p>}
                <Button
                  variant="primary"
                  size="s"
                  disabledReason={disabledReason([
                    [profile.gold < offer.price, 'Not enough Gold'],
                    [full, REFUSALS['bag-full']],
                  ])}
                  onClick={() => onBuy(offer)}
                >
                  Buy ·{' '}
                  <span className="price-badge">
                    <CurrencyIcon kind="gold" label="Gold" /> {formatNumber(offer.price)}
                  </span>
                </Button>
              </TierFrame>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
const MAIN_KEYS = new Set(['physicalDamage', 'magicalDamage', 'maxHp', 'resistance']);

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
