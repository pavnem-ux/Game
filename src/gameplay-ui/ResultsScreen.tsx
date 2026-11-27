import { useSyncExternalStore } from 'react';
import { getCampaignMap } from '../campaign';
import { CLASS_LABELS } from '../gameplay';
import type { GameplaySnapshot } from '../gameplay';
import { campaignStore } from './campaign-state';
import { clock } from './campaign-format';
import { SaveWarning } from './SaveManagement';
import { RunStatsPanel } from './RunStatsPanel';
import { EN, formatNumber } from './strings-en';
import { ReportButton } from './ReportButton';
import { CurrencyIcon } from './kit/CurrencyIcon';
import { itemIconId, itemName, runGold, runOre } from '../equipment';
import { ItemIcon } from './kit';
import { ItemArt, rarityColor, rarityLabel } from './item-view';
import { QUEST_BY_ID } from '../quests';

/** Results of a finished campaign run. Rewards come from the committed summary only. */
export function ResultsScreen({ world }: { world: GameplaySnapshot }) {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const c = world.campaign!;
  // Task 39: the run's tier (older snapshots without it are Normal).
  const tier = c.difficulty ?? 'normal';
  const map = getCampaignMap(c.mapId, tier);
  const last = ui.lastResult?.runId === c.runId ? ui.lastResult : null;
  const summary = last?.commit.summary ?? null;
  const victory = c.status === 'victory';
  const saveState = ui.progression.status.state;
  // Task 11: coins collected, victory bonus and the Gold actually credited (same formula).
  const gold = runGold(victory ? 'victory' : 'defeat', c.mapId, world.coins.collected);
  // Task 19: first victory on the map pays ×3 ore (the summary amount is what was credited).
  // Task 24: Ore from activities is credited with a victory on top of the map's Ore.
  const activityOre = victory ? (world.activities?.ore ?? 0) : 0;
  const firstWin =
    !!summary &&
    victory &&
    summary.oreGained - activityOre > Math.round(runOre('victory', c.mapId, false) * map.oreScale);
  return (
    <section
      className="overlay modal-overlay results-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="results-title"
    >
      <div className={`results-panel ${victory ? 'is-victory' : 'is-defeat'}`}>
        <div className="eyebrow centered">
          {map.id}. {map.name}
          {tier !== 'normal' && ` · ${EN.meta.maps.tierNames[tier]}`} ·{' '}
          {CLASS_LABELS[world.character.characterClass]}
        </div>
        <h2 id="results-title">{victory ? 'Victory.' : 'Defeat.'}</h2>
        <dl className="results-grid">
          <dt>Time</dt>
          <dd>{clock(Math.min(c.resolvedAt ?? world.time, c.duration))}</dd>
          <dt>Defeated</dt>
          <dd>{world.kills}</dd>
          <dt>Elites</dt>
          <dd>{c.eliteKills}</dd>
          <dt>Boss</dt>
          <dd>{c.bossKilled ? `${map.bossName} defeated` : 'not defeated'}</dd>
          <dt>Run level</dt>
          <dd>{world.progression.level}</dd>
          <dt>Class XP</dt>
          <dd>{summary ? `+${summary.xpGained} XP` : '…'}</dd>
          <dt>Coins</dt>
          <dd>
            {world.coins.collected}
            {!victory && ` (50% → ${gold.coins})`}
          </dd>
          <dt>Victory bonus</dt>
          {/* Task 39: on a harder tier the bonus includes the tier's Gold scale. */}
          <dd>
            {victory
              ? `+${summary ? summary.goldGained - world.coins.collected : gold.bonus}${
                  map.goldScale !== 1 ? ` (${EN.meta.maps.tierNames[tier]} ×${map.goldScale})` : ''
                }`
              : 'none'}
          </dd>
          <dt>
            <CurrencyIcon kind="gold" /> Gold
          </dt>
          <dd>{summary ? `+${formatNumber(summary.goldGained)}` : '…'}</dd>
          <dt>
            <CurrencyIcon kind="ore" /> Ore
          </dt>
          <dd>
            {summary
              ? summary.oreGained > 0
                ? `+${summary.oreGained}${firstWin ? ' (first victory ×3)' : ''}${
                    activityOre > 0 ? ` (activities +${activityOre})` : ''
                  }`
                : victory
                  ? '+0'
                  : 'none'
              : '…'}
          </dd>
          <dt>Levels</dt>
          <dd>
            {summary
              ? summary.levelsGained > 0
                ? `${summary.levelBefore} → ${summary.levelAfter} (+${summary.levelsGained})`
                : `${summary.levelAfter}`
              : '…'}
          </dd>
          <dt>Talent points</dt>
          <dd>{summary ? `+${summary.talentPointsGained}` : '…'}</dd>
        </dl>
        {summary?.newlyUnlockedTier && (
          <p className="results-unlock">
            ✦ {EN.meta.maps.tierUnlocked(EN.meta.maps.tierNames[summary.newlyUnlockedTier])}
          </p>
        )}
        {summary?.newlyUnlockedMap && (
          <p className="results-unlock">
            ✦ Map {summary.newlyUnlockedMap} unlocked:{' '}
            {getCampaignMap(summary.newlyUnlockedMap).name}
          </p>
        )}
        {!victory && <p className="results-note">A defeat does not unlock the next map.</p>}
        {/* Task 42: items gained this run (from the committed summary: real uids, auto-salvage). */}
        {summary && summary.loot.length > 0 && (
          <div className="results-loot" role="group" aria-label="Loot">
            <strong>Loot</strong>
            <ul>
              {summary.loot.map((e, i) => (
                <li key={`${e.item.uid}-${i}`}>
                  <ItemArt item={e.item} size="itemSmall" />
                  <span style={{ color: rarityColor(e.item.rarity) }}>
                    {rarityLabel(e.item.rarity)} {itemName(e.item)}
                  </span>
                  <small>L{e.item.itemLevel}</small>
                  {e.salvagedOre !== null && (
                    <small className="results-loot-salvaged">
                      auto-salvaged → {e.salvagedOre} Ore
                    </small>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Task 21: quests that became claimable with this run. */}
        {last?.newQuests && last.newQuests.length > 0 && (
          <div className="results-quests" role="status">
            <strong>✧ {EN.meta.quests.completedToast(last.newQuests.length)}</strong>
            <ul>
              {last.newQuests.map((id) => (
                <li key={id}>{QUEST_BY_ID.get(id)?.title ?? id}</li>
              ))}
            </ul>
            <small>Claim the reward under “Quests” on the home screen.</small>
          </div>
        )}
        <RunStatsPanel stats={world.runStats} />
        <p className="results-seed" aria-label={`${EN.seed.label}: ${world.seed}`}>
          {EN.seed.label}: <code>{world.seed}</code>
        </p>
        <p className={`results-save save-${saveState}`} role="status">
          {last?.commit.saved
            ? 'Progress saved.'
            : saveState === 'not-persisted'
              ? 'Browser storage is unavailable: progress is kept only until the page is closed.'
              : last
                ? 'Could not save progress. It stays in this session — try saving in “Settings”.'
                : 'Saving…'}
        </p>
        <SaveWarning />
        <div className="results-actions">
          <button
            className="button primary"
            autoFocus
            onClick={() =>
              campaignStore.startRun(c.mapId, world.character.characterClass, undefined, tier)
            }
          >
            Again →
          </button>
          <button className="text-button" onClick={() => campaignStore.quitToMenu()}>
            To menu
          </button>
          <ReportButton />
        </div>
      </div>
    </section>
  );
}
