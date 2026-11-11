import { useEffect, useState, useSyncExternalStore } from 'react';
import { CHARACTER_CLASSES } from '../../character-stats';
import type { CharacterClass } from '../../character-stats';
import { CLASS_LABELS } from '../../gameplay';
import {
  TALENT_CONFIG,
  availableTalentPoints,
  earnedTalentPoints,
  superpowerActive,
  talentNodeState,
} from '../../talents';
import type { TalentNode } from '../../talents';
import { campaignStore } from '../campaign-state';
import { Button, ClassEmblem, Panel, Tabs, romanRank } from '../kit';
import { RU } from '../strings-ru';

const T = RU.talents;
const M = RU.meta.talents;
/** How long the «just learned» glow plays on a node (ms). */
const LEARN_FLASH = 700;

/**
 * Task 13 §3 Talents: three branch columns of circular nodes joined by lines, rank pips I–III,
 * node states (locked with reason, available glow, maxed gold), the superpower branch sealed until
 * level 30, free points counter. Selecting a node opens its ranks; buying plays a short glow. All
 * rules (`talentNodeState`, `purchaseTalent`) are the existing pure talent functions.
 */
export function TalentsPage() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile;
  const [shown, setShown] = useState<CharacterClass | null>(null);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), LEARN_FLASH);
    return () => clearTimeout(t);
  }, [flash]);
  if (!profile) return <p className="campaign-empty">Профиль недоступен.</p>;
  const cls = shown ?? ui.viewClass ?? profile.selectedClass;
  const progress = profile.classes[cls];
  const ranks = progress.talents;
  const available = availableTalentPoints(progress.level, ranks);
  const earned = earnedTalentPoints(progress.level);
  const branches = TALENT_CONFIG.branchesOf(cls);
  const node = nodeId ? TALENT_CONFIG.nodes.get(nodeId) : undefined;
  const current = node && node.id.startsWith(`${cls}.`) ? node : undefined;
  const superpower = superpowerActive(cls, ranks)
    ? T.superpowerActive
    : progress.level >= 30
      ? T.superpowerReady
      : T.superpowerLocked;
  const learn = (n: TalentNode) => {
    const rank = (ranks[n.id] ?? 0) + 1;
    const result = campaignStore.purchaseTalent(cls, n.id);
    if (!result.ok) setMessage(T.reasons[result.reason ?? ''] ?? RU.meta.talents.locked);
    else {
      setFlash(n.id);
      setMessage(M.learned(n.name, romanRank(rank)));
    }
  };
  return (
    <section className="talents-screen" aria-label={T.title}>
      <header className="meta-page-head">
        <h2 className="meta-title">{T.title}</h2>
        <Tabs
          label={T.classSwitch}
          items={CHARACTER_CLASSES.map((c) => ({ id: c, label: CLASS_LABELS[c] }))}
          value={cls}
          onChange={(c) => {
            setShown(c);
            setNodeId(null);
            setMessage('');
          }}
        />
        <div className={`talent-points ${available > 0 ? 'has-points' : ''}`}>
          <ClassEmblem characterClass={cls} size={34} />
          <span>
            <b>{T.points(available, earned)}</b>
            <small>
              {T.level(progress.level)} · {superpower}
            </small>
          </span>
        </div>
      </header>
      <div className="talent-board">
        <div className="talent-columns">
          {branches.map((branch) => {
            const locked = progress.level < branch.requiredLevel;
            return (
              <section
                key={branch.branch}
                className={`talent-column ${branch.superpower ? 'superpower' : ''} ${
                  locked ? 'locked' : ''
                }`}
                aria-label={`Ветка ${branch.branch}. ${branch.name}`}
              >
                <h3>
                  {branch.name}
                  {branch.superpower && <span className="talent-tag">{T.superpower}</span>}
                </h3>
                {locked && (
                  <span className="talent-seal" title={T.superpowerLocked}>
                    🔒 {M.seal}
                  </span>
                )}
                <ol className="talent-path">
                  {branch.nodes.map((n) => {
                    const state = talentNodeState(cls, progress.level, ranks, n.id);
                    const status =
                      state.rank >= 3
                        ? 'maxed'
                        : state.purchasable
                          ? 'available'
                          : state.rank > 0
                            ? 'partial'
                            : 'locked';
                    const reason =
                      !state.purchasable && state.reason && state.reason !== 'max-rank'
                        ? T.reasons[state.reason]
                        : null;
                    return (
                      <li
                        key={n.id}
                        className={`talent-node-cell status-${status} ${
                          flash === n.id ? 'just-learned' : ''
                        } ${current?.id === n.id ? 'selected' : ''}`}
                        aria-label={`${n.name}: ${T.rank(state.rank)}`}
                      >
                        <button
                          className="talent-orb"
                          aria-pressed={current?.id === n.id}
                          title={reason ?? (status === 'maxed' ? M.maxed : n.name)}
                          onClick={() => setNodeId(current?.id === n.id ? null : n.id)}
                        >
                          <span className="talent-orb-glyph" aria-hidden="true">
                            {n.name.slice(0, 1)}
                          </span>
                          <span className="visually-hidden">{n.name}</span>
                        </button>
                        <span className="talent-node-name">{n.name}</span>
                        <span className="talent-pips" aria-hidden="true">
                          {[1, 2, 3].map((r) => (
                            <i key={r} className={r <= state.rank ? 'on' : ''}>
                              {romanRank(r)}
                            </i>
                          ))}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
        <Panel className="talent-detail" aria-label="Описание таланта" title={current?.name}>
          {current ? (
            <TalentDetail
              cls={cls}
              node={current}
              level={progress.level}
              onLearn={() => learn(current)}
            />
          ) : (
            <p className="meta-empty">{M.pickNode}</p>
          )}
          {message && (
            <p className="talent-message" role="status">
              {message}
            </p>
          )}
          <p className="meta-note">{T.noRefund}</p>
          {branches.some((b) => b.nodes.some((n) => n.ranks.some((r) => !r.active))) && (
            <p className="meta-note">{T.inert}</p>
          )}
        </Panel>
      </div>
    </section>
  );
}

function TalentDetail({
  cls,
  node,
  level,
  onLearn,
}: {
  cls: CharacterClass;
  node: TalentNode;
  level: number;
  onLearn: () => void;
}) {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const ranks = ui.progression.profile!.classes[cls].talents;
  const state = talentNodeState(cls, level, ranks, node.id);
  const requires = node.requires ? TALENT_CONFIG.nodes.get(node.requires)!.name : null;
  const reason =
    !state.purchasable && state.reason && state.reason !== 'max-rank'
      ? T.reasons[state.reason]
      : null;
  return (
    <div className="talent-detail-body">
      <p className="talent-detail-rank">{T.rankOf(state.rank)}</p>
      <ul className="talent-ranks">
        {node.ranks.map((r) => (
          <li key={r.rank} className={`talent-rank-line ${r.rank <= state.rank ? 'owned' : ''}`}>
            <b>{T.rank(r.rank)}:</b> {r.text}
            {r.status !== 'ready' && (
              <small className={`talent-gap gap-${r.status}`}>
                {' '}
                ({r.status === 'blocked' ? T.rankBlocked : T.rankPending})
              </small>
            )}
          </li>
        ))}
      </ul>
      {requires && <p className="talent-requires">{T.requires(requires)}</p>}
      {state.rank < 3 ? (
        <Button variant="primary" disabledReason={reason} onClick={onLearn}>
          {T.learn(state.rank + 1)}
        </Button>
      ) : (
        <p className="talent-maxed">★ {M.maxed}</p>
      )}
      {reason && <p className="talent-reason">{reason}</p>}
    </div>
  );
}
