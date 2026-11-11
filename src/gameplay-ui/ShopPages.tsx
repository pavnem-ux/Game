import { useState, useSyncExternalStore } from 'react';
import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass, CombatAttributes } from '../character-stats';
import { CLASS_LABELS } from '../gameplay';
import {
  GEAR_SLOTS,
  GEAR_STAT_LABELS,
  SHOP_ITEMS,
  SLOT_LABELS,
  TIER_CONFIG,
  findItem,
  highestClearedMap,
  isEligible,
  isOwned,
  isTierUnlocked,
  permanentStats,
  starterWeapon,
} from '../equipment';
import type { GearItem, GearSlot, GearStat, Loadout, Tier } from '../equipment';
import { campaignStore } from './campaign-state';

/**
 * Task 11 §1.5 shop and equipment screens. They only read the profile and call the campaign
 * store; every change goes through the validated save (one atomic write per action).
 */
const useCampaign = () => useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
const REFUSALS: Record<string, string> = {
  gold: 'Не хватает золота.',
  owned: 'Уже куплено.',
  locked: 'Этот уровень предметов ещё закрыт.',
  'not-owned': 'Предмет не куплен.',
  'not-eligible': 'Этот класс не может надеть предмет.',
};
const statText = (stat: GearStat, value: number) => {
  const { label, unit } = GEAR_STAT_LABELS[stat];
  return `${label} +${Math.round(value * 10) / 10}${unit}`;
};
function ItemStats({ item }: { item: GearItem }) {
  const entries = Object.entries(item.stats) as [GearStat, number][];
  if (!entries.length) return <p className="gear-stats">Без бонусов</p>;
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
const tierLabel = (item: GearItem) =>
  item.tier === 0 ? 'Стартовое' : TIER_CONFIG[item.tier as Tier].name;

/** «Магазин»: tabs by slot; weapons filtered by a class switcher (the selected class first). */
export function ShopPage() {
  const ui = useCampaign();
  const profile = ui.progression.profile;
  const [slot, setSlot] = useState<GearSlot>('weapon');
  const [weaponClass, setWeaponClass] = useState<CharacterClass>(
    profile?.selectedClass ?? 'warrior',
  );
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  if (!profile) return <p className="campaign-empty">Профиль недоступен.</p>;
  const cleared = highestClearedMap(profile.completedMaps);
  const state = { ownedItems: profile.ownedItems };
  const items = SHOP_ITEMS.filter(
    (i) => i.slot === slot && (slot !== 'weapon' || i.characterClass === weaponClass),
  );
  const equippedBy = (id: string) =>
    CHARACTER_CLASSES.filter((c) => Object.values(profile.classes[c].loadout).includes(id));
  return (
    <div className="campaign-page shop-page">
      <h2>Магазин</h2>
      <p className="campaign-note">
        Покупка открывает предмет навсегда для всех подходящих классов. Изменения снаряжения
        действуют со следующего забега.
      </p>
      <div className="act-tabs" role="group" aria-label="Слоты магазина">
        {GEAR_SLOTS.map((s) => (
          <button
            key={s}
            className={`act-tab ${s === slot ? 'active' : ''}`}
            aria-pressed={s === slot}
            onClick={() => {
              setSlot(s);
              setConfirming(null);
            }}
          >
            {SLOT_LABELS[s]}
          </button>
        ))}
      </div>
      {slot === 'weapon' && (
        <label className="shop-class">
          Оружие класса{' '}
          <select
            aria-label="Класс оружия"
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
      {message && (
        <p className="shop-message" role="status">
          {message}
        </p>
      )}
      <ul className="shop-grid" aria-label="Товары">
        {items.map((item) => {
          const owned = isOwned(state, item);
          const wearing = equippedBy(item.id);
          const open = isTierUnlocked(item.tier as Tier, cleared);
          const short = profile.gold < item.price;
          const stateText = wearing.length
            ? `Надето: ${wearing.map((c) => CLASS_LABELS[c]).join(', ')}`
            : owned
              ? 'Куплено'
              : !open
                ? `Откроется после карты ${TIER_CONFIG[item.tier as Tier].unlockAfterMap}`
                : `${item.price} золота`;
          return (
            <li
              key={item.id}
              className={`shop-card tier-${item.tier} ${owned ? 'owned' : ''}`}
              style={tierStyle(item)}
              aria-label={`${item.name}: ${stateText}`}
            >
              <div className="shop-card-head">
                <strong>{item.name}</strong>
                <small style={{ color: TIER_CONFIG[item.tier as Tier].color }}>
                  {tierLabel(item)}
                </small>
              </div>
              <ItemStats item={item} />
              <p className="shop-state">{stateText}</p>
              {!owned && open && confirming !== item.id && (
                <button
                  className="button"
                  disabled={short}
                  title={short ? 'Не хватает золота' : undefined}
                  onClick={() => {
                    setConfirming(item.id);
                    setMessage('');
                  }}
                >
                  Купить · {item.price}
                </button>
              )}
              {confirming === item.id && (
                <div className="shop-confirm" role="group" aria-label="Подтверждение покупки">
                  <span>
                    Купить за {item.price} золота? Останется {profile.gold - item.price}.
                  </span>
                  <button
                    className="button primary"
                    onClick={() => {
                      const refused = campaignStore.buyItem(item.id);
                      setConfirming(null);
                      setMessage(
                        refused
                          ? (REFUSALS[refused] ?? 'Покупка не удалась.')
                          : `Куплено: ${item.name}.`,
                      );
                    }}
                  >
                    Подтвердить
                  </button>
                  <button className="button" onClick={() => setConfirming(null)}>
                    Отмена
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const STAT_ROWS: readonly [keyof CombatAttributes, string, number][] = [
  ['maxHp', 'Здоровье', 0],
  ['physicalDamage', 'Физ. урон', 0],
  ['magicalDamage', 'Маг. урон', 0],
  ['attackSpeed', 'Скорость атаки', 0],
  ['criticalChance', 'Шанс крита', 1],
  ['criticalDamage', 'Крит. урон', 0],
  ['resistance', 'Сопротивление', 0],
  ['dodgeChance', 'Уклонение', 1],
  ['movementSpeed', 'Скорость движения', 0],
  ['cooldownReduction', 'Сокр. перезарядки', 1],
  ['areaSize', 'Размер области', 0],
];
const fmt = (v: number, digits: number) => (Math.round(v * 10 ** digits) / 10 ** digits).toString();

/**
 * Character screen equipment (§1.5): the class's 4 slots, owned eligible items to pick from,
 * unequip, final stats with / without gear, and a +/− preview before equipping.
 */
export function EquipmentPanel({ characterClass }: { characterClass: CharacterClass }) {
  const ui = useCampaign();
  const profile = ui.progression.profile;
  const [preview, setPreview] = useState<{ slot: GearSlot; id: string } | null>(null);
  const [message, setMessage] = useState('');
  if (!profile) return null;
  const progress = profile.classes[characterClass];
  const loadout = progress.loadout;
  const withGear = permanentStats(characterClass, progress.level, progress.talents, loadout);
  const without = permanentStats(characterClass, progress.level, progress.talents, null);
  const previewLoadout: Loadout | null = preview
    ? { ...loadout, [preview.slot]: preview.id }
    : null;
  const previewStats = previewLoadout
    ? permanentStats(characterClass, progress.level, progress.talents, previewLoadout)
    : null;
  const options = (slot: GearSlot) =>
    [
      ...(slot === 'weapon' ? [starterWeapon(characterClass)] : []),
      ...profile.ownedItems.map((id) => findItem(id)!).filter(Boolean),
    ].filter((i) => isEligible(i, characterClass, slot));
  return (
    <section className="equipment-panel" aria-label={`Снаряжение: ${CLASS_LABELS[characterClass]}`}>
      <h3>Снаряжение · {CLASS_LABELS[characterClass]}</h3>
      <div className="equipment-slots">
        {GEAR_SLOTS.map((slot) => {
          const current = loadout[slot] ? findItem(loadout[slot]!) : null;
          const choices = options(slot);
          return (
            <div
              key={slot}
              className="equipment-slot"
              style={current ? tierStyle(current) : undefined}
            >
              <small>{SLOT_LABELS[slot]}</small>
              <strong>{current ? current.name : 'Пусто'}</strong>
              {current && <ItemStats item={current} />}
              <select
                aria-label={`Выбрать: ${SLOT_LABELS[slot]}`}
                value={preview?.slot === slot ? preview.id : (loadout[slot] ?? '')}
                onChange={(e) =>
                  setPreview(
                    e.target.value && e.target.value !== loadout[slot]
                      ? { slot, id: e.target.value }
                      : null,
                  )
                }
              >
                {!loadout[slot] && <option value="">—</option>}
                {choices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              {current && !current.starter && (
                <button
                  className="text-button"
                  onClick={() => {
                    setPreview(null);
                    const refused = campaignStore.unequipSlot(characterClass, slot);
                    setMessage(refused ? 'Не удалось снять предмет.' : '');
                  }}
                >
                  Снять
                </button>
              )}
            </div>
          );
        })}
      </div>
      {preview && previewStats && (
        <div className="equipment-preview" role="group" aria-label="Предпросмотр снаряжения">
          <strong>Если надеть «{findItem(preview.id)?.name}»:</strong>
          <ul>
            {STAT_ROWS.filter(([k]) => previewStats[k] !== withGear[k]).map(([k, label, d]) => {
              const diff = previewStats[k] - withGear[k];
              return (
                <li key={k} className={diff > 0 ? 'up' : 'down'}>
                  {label} {diff > 0 ? '+' : '−'}
                  {fmt(Math.abs(diff), d)}
                </li>
              );
            })}
          </ul>
          <button
            className="button primary"
            onClick={() => {
              const refused = campaignStore.equipItem(characterClass, preview.id);
              setMessage(refused ? (REFUSALS[refused] ?? 'Не удалось надеть.') : '');
              setPreview(null);
            }}
          >
            Надеть
          </button>
          <button className="button" onClick={() => setPreview(null)}>
            Отмена
          </button>
        </div>
      )}
      {message && <p className="shop-message">{message}</p>}
      <table className="equipment-stats">
        <thead>
          <tr>
            <th>Характеристика</th>
            <th>Без снаряжения</th>
            <th>Со снаряжением</th>
          </tr>
        </thead>
        <tbody>
          {STAT_ROWS.map(([k, label, d]) => (
            <tr key={k}>
              <td>{label}</td>
              <td>{fmt(without[k], d)}</td>
              <td className={withGear[k] !== without[k] ? 'changed' : undefined}>
                {fmt(withGear[k], d)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="campaign-note">Изменения действуют со следующего забега.</p>
    </section>
  );
}
