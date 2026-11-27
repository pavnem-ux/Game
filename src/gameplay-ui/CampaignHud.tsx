import type { GameplaySnapshot } from '../gameplay';
import { BUFFS } from '../gameplay/chests';
import type { BuffId, ChestContent } from '../gameplay/chests';
import { nextEventCountdown } from './next-event';
import { BuffIcon } from './kit';
import { EN, formatNumber } from './strings-en';
import { itemName } from '../equipment';
import { rarityColor, rarityLabel } from './item-view';

/** Task 12: seconds a chest pickup popup stays on screen. */
const PICKUP_POPUP = 2.5;
const BUFF_ICONS: Record<BuffId, string> = { fury: '⚔', haste: '≫', lightStep: '➶' };
/** Task 12 pickup popup text: «+15% HP», «+N Gold», buff name, «Magnet». */
export function chestPopupText(content: ChestContent, amount: number): string {
  if (content === 'heal') return '+15% HP';
  if (content === 'gold') return `+${formatNumber(amount)} Gold`;
  if (content === 'magnet') return 'Magnet: everything collected';
  return `${BUFFS[content].name}: ${BUFFS[content].description}`;
}

const ELITE_FRESH = 5;
/** Task 24: seconds an activity toast stays on screen. */
export const ACTIVITY_TOAST = 3;
/** Task 24 toast text for the latest activity notice. */
export function activityToastText(
  notice: NonNullable<NonNullable<GameplaySnapshot['activities']>['notice']>,
): string {
  return EN.activities[notice.kind][notice.activityType];
}

/** Task 08 campaign HUD (reads the throttled snapshot only; no logic beyond formatting). */
export function CampaignHud({ world }: { world: GameplaySnapshot }) {
  const c = world.campaign;
  if (!c) return null;
  const next = c.nextEvent;
  const lastElite = [...c.firedLog].reverse().find((e) => e.id.startsWith('elite-'));
  const freshElite =
    lastElite && world.time - lastElite.time < ELITE_FRESH
      ? c.elites.find((_, i) => `elite-${i + 1}` === lastElite.id)
      : null;
  const countdown = nextEventCountdown(next, world.time);
  const boss = c.boss;
  const chests = world.chests;
  const popup =
    chests?.lastOpened && world.time - chests.lastOpened.time < PICKUP_POPUP
      ? chests.lastOpened
      : null;
  const notice = world.activities?.notice;
  const toast = notice && world.time - notice.time < ACTIVITY_TOAST ? notice : null;
  // Task 42: a short toast naming the item just picked up.
  const loot = world.loot?.last;
  const lootToast =
    loot && c.status === 'active' && world.time - loot.time < ACTIVITY_TOAST ? loot : null;
  return (
    <>
      {lootToast && (
        <div
          key={`loot-${lootToast.item.uid}`}
          className="loot-toast"
          role="status"
          style={{ color: rarityColor(lootToast.item.rarity) }}
        >
          {rarityLabel(lootToast.item.rarity)} {itemName(lootToast.item)}
        </div>
      )}
      {toast && (
        <div
          key={`${toast.kind}-${toast.time}`}
          className={`activity-toast activity-toast-${toast.kind} activity-toast-${toast.activityType}`}
          role="status"
        >
          {activityToastText(toast)}
        </div>
      )}
      {/* Task 12: active chest buffs with remaining time; pickup popup. */}
      {chests && chests.buffs.length > 0 && (
        <ul className="buff-bar" aria-label="Buffs">
          {chests.buffs.map((b) => (
            <li
              key={b.id}
              className={`buff buff-${b.id}`}
              aria-label={`${b.name}: ${Math.ceil(b.remaining)} s`}
            >
              <BuffIcon id={b.id} glyph={BUFF_ICONS[b.id]} size="buff" />
              <strong>{b.name}</strong>
              <small>{Math.ceil(b.remaining)} s</small>
            </li>
          ))}
        </ul>
      )}
      {popup && (
        <div className={`chest-popup chest-popup-${popup.chestType}`} role="status">
          {/* Task 31: buff / magnet icon from art pack 7 (heal and Gold keep text only). */}
          {(popup.content === 'magnet' || popup.content in BUFF_ICONS) && (
            <BuffIcon
              id={popup.content as BuffId | 'magnet'}
              glyph="" // no icon before Task 31: the fallback adds nothing
              size="popup"
            />
          )}
          {chestPopupText(popup.content, popup.amount)}
        </div>
      )}
      {/* Task 22: coins + one countdown to the nearest scheduled event (map name, stage,
          remaining time and the separate boss countdown were removed). */}
      <div className="campaign-hud" aria-label="Campaign">
        {/* Task 11: Gold coins picked up in this run (paid out with the result). */}
        <span
          className="campaign-hud-coins"
          aria-label={`Coins this run: ${world.coins.collected}`}
        >
          ◎ {world.coins.collected}
        </span>
        {countdown && (
          <span className={`campaign-hud-next next-${countdown.kind}`} aria-live="off">
            {countdown.label}
          </span>
        )}
      </div>
      {freshElite && (
        <div className="campaign-alert" role="status">
          ⚠ Elite: {freshElite.name}!
        </div>
      )}
      {boss && boss.alive && (
        <div className="boss-bar" aria-label={`Boss: ${boss.name}`}>
          <span>{boss.name}</span>
          <div
            className="boss-bar-track"
            role="progressbar"
            aria-label="Boss health"
            aria-valuemin={0}
            aria-valuemax={Math.ceil(boss.maxHp)}
            aria-valuenow={Math.ceil(boss.hp)}
          >
            <div style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }} />
          </div>
          <small>
            {Math.ceil(boss.hp)} / {Math.ceil(boss.maxHp)}
          </small>
        </div>
      )}
    </>
  );
}
