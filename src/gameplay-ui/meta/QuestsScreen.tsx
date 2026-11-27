import { useState, useSyncExternalStore } from 'react';
import { uiSound } from '../sound';
import { PET_CONFIG, isPetId } from '../../pets';
import { QUEST_GROUPS, QUEST_GROUP_LABELS, allQuestProgress, questPayout } from '../../quests';
import type { QuestGroup, QuestProgress } from '../../quests';
import type { PlayerProfile } from '../../profile';
import { campaignStore } from '../campaign-state';
import { Button, CurrencyBadge, formatGold, OreBadge, ProgressBar, Tabs } from '../kit';
import { EN } from '../strings-en';
import { PetPortrait } from '../pets/PetPortrait';
import { HomeButton } from './HomeButton';

const Q = EN.meta.quests;
type GroupFilter = QuestGroup | 'all';

/**
 * Task 21 «Quests»: group tabs, «Claimable only» filter, each quest with its progress bar,
 * rewards (owned item / pet rewards show their Gold fallback) and «Claim» (one atomic save).
 * Completion is evaluated from the profile; this screen only reads it and calls the store.
 */
export function QuestsPage() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile;
  const [group, setGroup] = useState<GroupFilter>('all');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [message, setMessage] = useState<Readonly<{ tone: 'ok' | 'error'; text: string }> | null>(
    null,
  );
  if (!profile) return <p className="campaign-empty">Profile unavailable.</p>;
  const all = allQuestProgress(profile);
  const available = (g: GroupFilter) =>
    all.filter((q) => q.state === 'complete' && (g === 'all' || q.quest.group === g)).length;
  const list = all
    .filter((q) => group === 'all' || q.quest.group === group)
    .filter((q) => !onlyAvailable || q.state === 'complete')
    // Claimable first, then in progress, then claimed (catalogue order inside each).
    .sort((a, b) => ORDER[a.state] - ORDER[b.state]);
  const claim = (q: QuestProgress) => {
    const refused = campaignStore.claimQuest(q.quest.id);
    uiSound(refused ? 'ui-error' : 'ui-confirm');
    setMessage(
      refused
        ? { tone: 'error', text: Q.refusals[refused] ?? Q.failed }
        : { tone: 'ok', text: Q.claimedToast(q.quest.title) },
    );
  };
  return (
    <div className="quests-screen">
      <header className="meta-page-head">
        <HomeButton />
        <h2 className="meta-title">{Q.title}</h2>
        <label className="quests-filter">
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
          />
          {Q.onlyAvailable}
          {available('all') > 0 && <span className="hub-badge inline">{available('all')}</span>}
        </label>
      </header>
      <p className="meta-note">{Q.intro}</p>
      <Tabs
        label="Quest groups"
        items={[
          { id: 'all' as GroupFilter, label: labelWithCount(Q.all, available('all')) },
          ...QUEST_GROUPS.map((g) => ({
            id: g as GroupFilter,
            label: labelWithCount(QUEST_GROUP_LABELS[g], available(g)),
          })),
        ]}
        value={group}
        onChange={setGroup}
      />
      {message && (
        <p className={`shop-message forge-message forge-${message.tone}`} role="status">
          {message.text}
        </p>
      )}
      {list.length === 0 ? (
        <p className="meta-empty">{Q.empty}</p>
      ) : (
        <ul className="quest-list" aria-label={Q.title}>
          {list.map((q) => (
            <li key={q.quest.id}>
              <QuestRow q={q} profile={profile} onClaim={() => claim(q)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
const ORDER = { complete: 0, 'in-progress': 1, claimed: 2 } as const;
const labelWithCount = (label: string, n: number) => (n > 0 ? `${label} · ${n}` : label);

function QuestRow({
  q,
  profile,
  onClaim,
}: {
  q: QuestProgress;
  profile: PlayerProfile;
  onClaim: () => void;
}) {
  const r = q.quest.reward;
  const pay = questPayout(profile, q.quest);
  return (
    <article
      className={`quest-row state-${q.state}`}
      role="group"
      aria-label={`${q.quest.title}: ${
        q.state === 'claimed' ? Q.claimed : q.state === 'complete' ? Q.complete : Q.inProgress
      }`}
    >
      <div className="quest-main">
        <small className="quest-group">{QUEST_GROUP_LABELS[q.quest.group]}</small>
        <strong>{q.quest.title}</strong>
        <ProgressBar
          label={`Progress: ${q.quest.title}`}
          value={q.current}
          max={q.target}
          tone={q.state === 'in-progress' ? 'xp' : 'gold'}
          showText={`${formatGold(q.current)} / ${formatGold(q.target)}`}
        />
      </div>
      <div className="quest-rewards" aria-label={Q.reward}>
        {r.gold ? <CurrencyBadge amount={r.gold} size="s" /> : null}
        {r.ore ? <OreBadge amount={r.ore} size="s" /> : null}
        {r.pet && isPetId(r.pet) && (
          <span className="quest-reward-pet">
            <PetPortrait id={r.pet} size={22} />
            {PET_CONFIG[r.pet].name}
          </span>
        )}
        {pay.fallbackGold > 0 && q.state !== 'claimed' && (
          <small className="quest-fallback">{Q.fallback(pay.fallbackGold)}</small>
        )}
      </div>
      <div className="quest-action">
        {q.state === 'complete' ? (
          <Button variant="primary" onClick={onClaim}>
            {Q.claim}
          </Button>
        ) : q.state === 'claimed' ? (
          <span className="item-stamp owned">{Q.claimed}</span>
        ) : (
          <small className="quest-state">{Q.inProgress}</small>
        )}
      </div>
    </article>
  );
}
