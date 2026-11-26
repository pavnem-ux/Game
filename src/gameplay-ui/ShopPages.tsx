import { useState, useSyncExternalStore } from 'react';
import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import { CLASS_LABELS } from '../gameplay';
import { uiSound } from './sound';
import { GEAR_SLOTS, SLOT_LABELS, itemIconId, itemName, offerItem } from '../equipment';
import type { GearSlot, ShopOffer } from '../equipment';
import { shopOffersOf } from '../profile';
import { campaignStore } from './campaign-state';
import { PET_CONFIG, PET_IDS, checkPetPurchase, petLevel } from '../pets';
import type { PetId } from '../pets';
import { PetCard } from './meta/PetsScreen';
import {
  Button,
  ConfirmModal,
  CurrencyIcon,
  ItemIcon,
  Tabs,
  TierFrame,
  disabledReason,
} from './kit';
import { ItemStats, ItemTitle, rarityTier } from './item-view';
import { EN, formatNumber } from './strings-en';

/**
 * Task 40 shop (items rework 1/4; minimal UI until the bag screen of Task 41). It sells Common and
 * Uncommon items at item level = the class level: per slot one Common and three Uncommon offers
 * (a seeded stock that stays the same until the class levels up; a bought offer is gone until
 * then). Every change goes through the validated save (one atomic write per action).
 */
const useCampaign = () => useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
export const REFUSALS: Record<string, string> = {
  gold: 'Not enough Gold.',
  'sold-out': 'Already bought at this level.',
  'unknown-offer': 'This offer is gone.',
  'not-owned': 'Item not owned.',
  'not-eligible': 'This class cannot equip the item.',
  level: 'The class level is below the item level.',
};

export function ShopPage() {
  const ui = useCampaign();
  const profile = ui.progression.profile;
  // Task 20: the «Pets» tab sits after the gear slots.
  const [slot, setSlot] = useState<GearSlot | 'pets'>(ui.shopTab === 'pets' ? 'pets' : 'weapon');
  const [shopClass, setShopClass] = useState<CharacterClass>(profile?.selectedClass ?? 'warrior');
  const [confirming, setConfirming] = useState<ShopOffer | null>(null);
  const [message, setMessage] = useState('');
  if (!profile) return <p className="campaign-empty">Profile unavailable.</p>;
  const level = profile.classes[shopClass].level;
  const offers =
    slot === 'pets' ? [] : shopOffersOf(profile, shopClass).filter((o) => o.slot === slot);
  const preview = (o: ShopOffer) => offerItem(o, shopClass, 'preview');
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
        {slot !== 'pets' && (
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
      </header>
      {slot === 'pets' ? (
        <PetShop />
      ) : (
        <>
          <p className="meta-note">
            Items at item level {level} (the {CLASS_LABELS[shopClass]}&apos;s level). The stock
            changes when the class levels up; a bought offer is gone until then. Bought items are
            shared by every class that may equip them.
          </p>
          {message && (
            <p className="shop-message" role="status">
              {message}
            </p>
          )}
          {offers.length === 0 ? (
            <p className="meta-note">Sold out until the next level-up.</p>
          ) : (
            <ul className="shop-rows shop-offers" aria-label="Goods">
              {offers.map((offer) => {
                const item = preview(offer);
                const name = itemName(item);
                const short = profile.gold < offer.price;
                return (
                  <li
                    key={offer.id}
                    className="shop-cell"
                    aria-label={`${name}: ${formatNumber(offer.price)} Gold`}
                  >
                    <TierFrame tier={rarityTier(item.rarity)} className="shop-card">
                      <div className="shop-card-head">
                        <ItemIcon templateId={itemIconId(item)} size="itemCard" />
                        <ItemTitle item={item} />
                      </div>
                      <ItemStats item={item} characterClass={shopClass} />
                      <Button
                        variant="primary"
                        size="s"
                        disabledReason={disabledReason([[short, 'Not enough Gold']])}
                        onClick={() => {
                          setConfirming(offer);
                          setMessage('');
                        }}
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
          )}
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
