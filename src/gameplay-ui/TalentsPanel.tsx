import { useState, useSyncExternalStore } from 'react';
import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import { CLASS_LABELS } from '../gameplay';
import {
  TALENT_CONFIG,
  availableTalentPoints,
  earnedTalentPoints,
  superpowerActive,
  talentNodeState,
} from '../talents';
import type { TalentNode, TalentRanks } from '../talents';
import { CLASS_SYMBOLS } from './campaign-format';
import { campaignStore } from './campaign-state';
import { RU } from './strings-ru';

const T = RU.talents;

/** Task 09 §1.5 talent screen: one class tree at a time; only valid purchases are clickable. */
export function TalentsPanel() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile;
  const [viewed, setViewed] = useState<CharacterClass | null>(null);
  if (!profile) return null;
  const cls = viewed ?? profile.selectedClass;
  const progress = profile.classes[cls];
  const ranks = progress.talents;
  const earned = earnedTalentPoints(progress.level);
  const available = availableTalentPoints(progress.level, ranks);
  const superpower = superpowerActive(cls, ranks)
    ? T.superpowerActive
    : progress.level >= 30
      ? T.superpowerReady
      : T.superpowerLocked;
  return (
    <section className="talents" aria-label={T.title}>
      <header className="talents-head">
        <h3>{T.title}</h3>
        <div className="talents-classes" role="group" aria-label={T.classSwitch}>
          {CHARACTER_CLASSES.map((c) => (
            <button
              key={c}
              className={`campaign-tab ${c === cls ? 'active' : ''}`}
              aria-pressed={c === cls}
              onClick={() => setViewed(c)}
            >
              {CLASS_SYMBOLS[c]} {CLASS_LABELS[c]}
            </button>
          ))}
        </div>
      </header>
      <p className="talents-summary">
        <b>{T.points(available, earned)}</b> · {T.level(progress.level)} · {superpower}
      </p>
      {TALENT_CONFIG.branchesOf(cls).some((b) =>
        b.nodes.some((n) => n.ranks.some((r) => !r.active)),
      ) && <p className="talents-note">{T.inert}</p>}
      <p className="talents-note faint">{T.noRefund}</p>
      <div className="talent-branches">
        {TALENT_CONFIG.branchesOf(cls).map((branch) => {
          const locked = progress.level < branch.requiredLevel;
          return (
            <section
              key={branch.branch}
              className={`talent-branch ${branch.superpower ? 'superpower' : ''} ${
                locked ? 'locked' : ''
              }`}
              aria-label={`Ветка ${branch.branch}. ${branch.name}`}
            >
              <h4>
                {branch.name}
                {branch.superpower && <span className="talent-tag">{T.superpower}</span>}
                {locked && <span className="talent-lock">🔒 {T.branchLocked}</span>}
              </h4>
              <ol>
                {branch.nodes.map((node) => (
                  <TalentNodeCard
                    key={node.id}
                    cls={cls}
                    level={progress.level}
                    ranks={ranks}
                    node={node}
                  />
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function TalentNodeCard({
  cls,
  level,
  ranks,
  node,
}: {
  cls: CharacterClass;
  level: number;
  ranks: TalentRanks;
  node: TalentNode;
}) {
  const state = talentNodeState(cls, level, ranks, node.id);
  const requires = node.requires ? TALENT_CONFIG.nodes.get(node.requires)!.name : null;
  return (
    <li
      className={`talent-node rank-${state.rank} ${state.purchasable ? 'open' : 'closed'}`}
      aria-label={`${node.name}: ${T.rank(state.rank)}`}
    >
      <div className="talent-node-head">
        <strong>{node.name}</strong>
        <span className="talent-rank">{T.rankOf(state.rank)}</span>
      </div>
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
      {state.rank < 3 && (
        <button
          className="button talent-buy"
          disabled={!state.purchasable}
          onClick={() => campaignStore.purchaseTalent(cls, node.id)}
        >
          {T.learn(state.rank + 1)}
        </button>
      )}
      {!state.purchasable && state.reason && state.reason !== 'max-rank' && (
        <p className="talent-reason">{T.reasons[state.reason]}</p>
      )}
    </li>
  );
}
