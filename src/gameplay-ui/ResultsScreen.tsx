import { useSyncExternalStore } from 'react';
import { getCampaignMap } from '../campaign';
import { CLASS_LABELS } from '../gameplay';
import type { GameplaySnapshot } from '../gameplay';
import { campaignStore } from './campaign-state';
import { clock } from './campaign-format';
import { SaveWarning } from './SaveManagement';
import { RunStatsPanel } from './RunStatsPanel';
import { ReportButton } from './ReportButton';

/** Results of a finished campaign run. Rewards come from the committed summary only. */
export function ResultsScreen({ world }: { world: GameplaySnapshot }) {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const c = world.campaign!;
  const map = getCampaignMap(c.mapId);
  const last = ui.lastResult?.runId === c.runId ? ui.lastResult : null;
  const summary = last?.commit.summary ?? null;
  const victory = c.status === 'victory';
  const saveState = ui.progression.status.state;
  return (
    <section
      className="overlay modal-overlay results-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="results-title"
    >
      <div className={`results-panel ${victory ? 'is-victory' : 'is-defeat'}`}>
        <div className="eyebrow centered">
          {map.id}. {map.name} · {CLASS_LABELS[world.character.characterClass]}
        </div>
        <h2 id="results-title">{victory ? 'Победа.' : 'Поражение.'}</h2>
        <dl className="results-grid">
          <dt>Время</dt>
          <dd>{clock(Math.min(c.resolvedAt ?? world.time, c.duration))}</dd>
          <dt>Повержено</dt>
          <dd>{world.kills}</dd>
          <dt>Элиты</dt>
          <dd>{c.eliteKills}</dd>
          <dt>Босс</dt>
          <dd>{c.bossKilled ? `${map.bossName} повержен` : 'не повержен'}</dd>
          <dt>Уровень забега</dt>
          <dd>{world.progression.level}</dd>
          <dt>Опыт класса</dt>
          <dd>{summary ? `+${summary.xpGained} XP` : '…'}</dd>
          <dt>Золото</dt>
          <dd>{summary ? `+${summary.goldGained}` : '…'}</dd>
          <dt>Уровни</dt>
          <dd>
            {summary
              ? summary.levelsGained > 0
                ? `${summary.levelBefore} → ${summary.levelAfter} (+${summary.levelsGained})`
                : `${summary.levelAfter}`
              : '…'}
          </dd>
          <dt>Очки талантов</dt>
          <dd>{summary ? `+${summary.talentPointsGained}` : '…'}</dd>
        </dl>
        {summary?.newlyUnlockedMap && (
          <p className="results-unlock">
            ✦ Открыта карта {summary.newlyUnlockedMap}:{' '}
            {getCampaignMap(summary.newlyUnlockedMap).name}
          </p>
        )}
        {!victory && <p className="results-note">Поражение не открывает следующую карту.</p>}
        <RunStatsPanel stats={world.runStats} />
        <p className={`results-save save-${saveState}`} role="status">
          {last?.commit.saved
            ? 'Прогресс сохранён.'
            : saveState === 'not-persisted'
              ? 'Хранилище браузера недоступно: прогресс сохранится только до закрытия страницы.'
              : last
                ? 'Не удалось сохранить прогресс. Он остаётся в этой сессии — попробуйте сохранить в «Настройках».'
                : 'Сохранение…'}
        </p>
        <SaveWarning />
        <div className="results-actions">
          <button
            className="button primary"
            autoFocus
            onClick={() => campaignStore.startRun(c.mapId, world.character.characterClass)}
          >
            Ещё раз →
          </button>
          <button className="text-button" onClick={() => campaignStore.quitToMenu()}>
            В меню
          </button>
          <ReportButton />
        </div>
      </div>
    </section>
  );
}
