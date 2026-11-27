import type { GameplaySnapshot } from '../gameplay';
import type { PetSnapshot } from '../pets/runtime';
import { PET_CONFIG } from '../pets';
import { PetPortrait } from './pets/PetPortrait';
import { ALPHA_ENEMY_STATS, ALPHA_WEAPONS } from '../gameplay';
import type {
  DamageContext,
  LineChange,
  OfferCard,
  ReadoutLine,
  SkillDamageReadout,
  SynergyId,
} from '../skills';
import {
  LEVEL_ROMAN,
  SYNERGY_LEVEL_TEXT,
  cardLevelRaises,
  ranksOf,
  cardSynergyHints,
  compareRanks,
  getSkill,
  skillDamageReadout,
  synergyOverview,
} from '../skills';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { uiSettings } from './ui-settings';
import { uiSound } from './sound';
import { clock } from './campaign-format';
import { alphaBridge } from './store';
import { BuildLabel } from './BuildLabel';
import { ReportButton } from './ReportButton';
import { GameSpeedChoice } from './GameSpeed';
import { campaignStore } from './campaign-state';
import { Button, SkillIcon, SynergyIcon, cooldownLeftFraction } from './kit';
import { EN } from './strings-en';
import { skipCoins } from '../equipment/economy';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const cardKey = (c: OfferCard) => (c.kind === 'skill' ? c.skillId : `bonus:${c.bonusId}`);

/** Level-up choice: up to three cards, exactly one pick, three rerolls per run. */
/**
 * Task 22: no keyboard shortcuts on this screen (R/B/S/1–3 were removed — S also moves the player,
 * so a held key could skip an offer) and no «Skills» button; mouse / touch and Tab / Enter focus
 * navigation remain.
 */
export function LevelUpDialog({ world }: { world: GameplaySnapshot }) {
  const skills = world.skills;
  const offer = skills.offer!;
  const bonus = offer.mode === 'bonus';
  const ownedIds = skills.owned.map((o) => o.skillId);
  const ranks = ranksOf(skills.owned);
  // Task 14: banish mode (B) — the next picked card is banished instead of chosen.
  const [banishMode, setBanishModeState] = useState(false);
  const banishRef = useRef(false);
  const setBanishMode = (on: boolean) => {
    banishRef.current = on;
    setBanishModeState(on);
  };
  const O = EN.meta.offer;
  const anyBanishable = offer.cards.some((c) => skills.banishBlocked[cardKey(c)] === null);
  const banishReason = bonus
    ? O.reasons['no-offer']
    : skills.banishes <= 0
      ? O.reasons['none-left']
      : anyBanishable
        ? null
        : O.reasons['last-upgrade'];
  const coins = world.campaign ? skipCoins(world.campaign.mapId) : 0;
  useEffect(() => setBanishMode(false), [offer.id, offer.cards]);
  /** Picks or banishes a card of the live offer (keys can arrive before React re-renders). */
  const pick = (key: string) => {
    const live = alphaBridge.getSnapshot().world?.skills;
    if (!live?.offer?.cards.some((c) => cardKey(c) === key)) return;
    if (banishRef.current) {
      if (live.banishBlocked[key] !== null) return void uiSound('ui-error');
      setBanishMode(false);
      alphaBridge.send({ type: 'banish-skill', card: key });
    } else alphaBridge.send({ type: 'choose-skill', card: key });
  };
  return (
    <section
      className="overlay modal-overlay"
      role="dialog"
      aria-modal="true"
      data-sound="none" /* card pick / reroll / banish / skip sound from the world events */
      aria-labelledby="skill-title"
    >
      <div className="upgrade-panel skill-panel">
        <div className="modal-sigil">✧</div>
        <div className="eyebrow centered">
          {bonus ? 'ALL SKILLS AT THEIR PEAK' : 'THE SPARK GROWS STRONGER'}
        </div>
        <h2 id="skill-title">
          Run level {world.progression.level}
          <span>.</span>
        </h2>
        <p className="modal-description">
          {bonus
            ? 'Choose a reward. No slots are used.'
            : `Active ${skills.slots.auto.used}/${skills.slots.auto.max} · passive ${skills.slots.passive.used}/${skills.slots.passive.max} · choices last until the run ends`}
          {skills.pendingChoices > 1 && ` · choices left: ${skills.pendingChoices - 1}`}
        </p>
        <div className="upgrade-grid" role="list">
          {offer.cards.map((card, i) => {
            const hints =
              card.kind === 'skill'
                ? cardSynergyHints(world.character.characterClass, ownedIds, card.skillId)
                : null;
            const opens = (hints?.unlocks.length ?? 0) > 0;
            const raises =
              card.kind === 'skill'
                ? cardLevelRaises(world.character.characterClass, ranks, card.skillId)
                : [];
            const pairs = (hints?.halfPairs.length ?? 0) > 0;
            const comparison =
              card.kind === 'skill'
                ? compareRanks(card.skillId, card.currentRank, damageContext(world))
                : null;
            return (
              <button
                key={`${offer.id}-${cardKey(card)}`}
                className={`upgrade-card skill-card ${card.kind === 'skill' ? `kind-${card.skillKind}` : 'kind-bonus'}${opens ? ' synergy-unlock' : pairs ? ' synergy-pair' : ''}${banishMode ? ' banish-target' : ''}`}
                autoFocus={i === 0}
                role="listitem"
                aria-label={
                  banishMode
                    ? O.banishCard(card.name)
                    : card.kind === 'skill'
                      ? `${card.name}, ${card.isNew ? 'new skill' : 'upgrade'}, rank ${ROMAN[card.nextRank]}${opens ? `, unlocks synergy: ${hints!.unlocks.map((u) => u.synergy.name).join(', ')}` : ''}${raises.length ? `, raises synergy: ${raises.map((r) => `${r.synergy.name} ${LEVEL_ROMAN[r.level]}`).join(', ')}` : ''}`
                      : `${card.name}, reward`
                }
                onClick={() => pick(cardKey(card))}
                disabled={banishMode && skills.banishBlocked[cardKey(card)] !== null}
              >
                <div className="card-top">
                  <span>
                    {card.kind === 'bonus'
                      ? 'REWARD'
                      : `${card.skillKind === 'auto' ? 'ACTIVE' : 'PASSIVE'} · ${card.isNew ? 'NEW' : 'UPGRADE'}`}
                  </span>
                  <small>0{i + 1}</small>
                </div>
                <div className="upgrade-icon skill-card-icon">
                  <SkillIcon
                    skillId={card.kind === 'skill' ? card.skillId : null}
                    glyph={card.icon}
                    size="card"
                  />
                  {card.kind === 'skill' && (
                    <span
                      className={`skill-icon-badge${card.isNew ? ' is-new' : ''}`}
                      aria-hidden="true"
                    >
                      {card.isNew ? 'NEW' : `▲ ${ROMAN[card.nextRank]}`}
                    </span>
                  )}
                </div>
                <h3>
                  {card.name}
                  {card.kind === 'skill' && <em> {ROMAN[card.nextRank]}</em>}
                </h3>
                <p>{card.summary}</p>
                {comparison && (
                  <DamageLines
                    readout={comparison.to}
                    changes={comparison.from ? comparison.changes.map((c) => c.change) : undefined}
                    compact
                  />
                )}
                {hints && card.kind === 'skill' && (
                  <CardSynergyHint hints={hints} skillId={card.skillId} />
                )}
                <CardLevelHint raises={raises} />
                <div className="card-bottom">
                  <span>
                    {card.kind === 'skill'
                      ? card.isNew
                        ? 'RANK I'
                        : `RANK ${ROMAN[card.currentRank]} → ${ROMAN[card.nextRank]}`
                      : 'REPEATABLE'}
                  </span>
                  <b>Choose →</b>
                </div>
              </button>
            );
          })}
        </div>
        {offer.cards.some(
          (c) =>
            c.kind === 'skill' &&
            cardSynergyHints(world.character.characterClass, ownedIds, c.skillId).unlocks.length >
              0,
        ) && (
          <p className="faint synergy-hint-note">
            ✦ A synergy unlocks once both skills of a pair are collected, and triggers in battle
            when its condition is met.
          </p>
        )}
        {offer.cards.some((c) => c.kind === 'skill') && (
          <p className="faint damage-note">{DAMAGE_NOTE}</p>
        )}
        {/* Task 14: reroll / banish / skip with counters (kit buttons, reasons as tooltips). */}
        <div className="meta-ui offer-controls" role="group" aria-label="Choice controls">
          {banishMode && <p className="offer-banish-hint">{O.banishHint}</p>}
          <Button
            size="s"
            disabledReason={bonus || !offer.rerollAvailable ? O.noRerolls : null}
            onClick={() => alphaBridge.send({ type: 'reroll' })}
          >
            {O.reroll(skills.rerolls)}
          </Button>
          <Button
            size="s"
            variant={banishMode ? 'danger' : 'secondary'}
            aria-pressed={banishMode}
            data-sound="ui-click"
            disabledReason={banishReason}
            onClick={() => setBanishMode(!banishMode)}
          >
            {banishMode ? O.banishCancel : O.banish(skills.banishes)}
          </Button>
          <Button size="s" variant="ghost" onClick={() => alphaBridge.send({ type: 'skip-offer' })}>
            {O.skip(coins)}
          </Button>
          {skills.banished.length > 0 && (
            <small className="offer-hotkeys">{O.banished(skills.banished.length)}</small>
          )}
        </div>
        <p className="faint">Time is frozen. Take your time.</p>
      </div>
    </section>
  );
}

/**
 * Task 09.1 C1 (Mage superpower «The Fifth Circle»): the one-time choice of the enhanced skill among
 * the five actives, shown when the 5th active is acquired. Time stays stopped until a choice.
 */
export function EnhancedSkillDialog({ world }: { world: GameplaySnapshot }) {
  const { enhancedChoice, enhancedSkillId, owned } = world.skills;
  if (!enhancedChoice) return null;
  return (
    <section
      className="overlay modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="enhanced-title"
    >
      <div className="upgrade-panel skill-panel">
        <div className="modal-sigil">✶</div>
        <div className="eyebrow centered">THE FIFTH CIRCLE</div>
        <h2 id="enhanced-title">
          Enhanced skill<span>.</span>
        </h2>
        <p className="modal-description">
          The fifth active slot is open. Choose one of your five active skills to become enhanced
          (the “Archmage” branch talents). The choice is final; by default the most recently
          acquired skill is enhanced.
        </p>
        <div className="upgrade-grid" role="list">
          {enhancedChoice.map((id, i) => {
            const skill = owned.find((o) => o.skillId === id);
            const current = id === enhancedSkillId;
            return (
              <button
                key={id}
                className={`upgrade-card skill-card kind-auto${current ? ' enhanced' : ''}`}
                autoFocus={current}
                role="listitem"
                aria-label={`${skill?.name ?? id}${current ? ', currently enhanced' : ''}`}
                onClick={() => alphaBridge.send({ type: 'choose-enhanced', skillId: id })}
              >
                <div className="card-top">
                  <span>{current ? 'DEFAULT' : 'ACTIVE'}</span>
                  <small>0{i + 1}</small>
                </div>
                <div className="upgrade-icon skill-card-icon">
                  <SkillIcon skillId={id} glyph={skill?.icon ?? '✶'} size="card" />
                </div>
                <h3>
                  {skill?.name ?? id}
                  {skill && <em> {ROMAN[skill.rank]}</em>}
                </h3>
                <div className="card-bottom">
                  <span>
                    {getSkill(id)
                      .tags.filter((t) => t === 'fire' || t === 'ice')
                      .join(' · ')}
                  </span>
                  <b>Enhance →</b>
                </div>
              </button>
            );
          })}
        </div>
        <p className="faint">Time is frozen. Take your time.</p>
      </div>
    </section>
  );
}

/** Equipped skills with ranks and remaining cooldowns, plus gold and barrier. */
export function SkillBar({ world }: { world: GameplaySnapshot }) {
  const { gold } = world.skills;
  const { barrier, buffs } = world.skillCombat;
  return (
    <>
      <div className="skill-bar" aria-label="Run skills">
        {/* Task 22: the «Skills» button, slot counts and passive icons were removed (the full
            list is in the pause menu); active skills are drawn by <ActiveSkills /> bottom-left. */}
        {gold > 0 && <span className="skill-gold">◎ {gold}</span>}
        {barrier > 0 && <span className="skill-barrier">◈ {Math.ceil(barrier)}</span>}
        {/* Task 14: dash readiness (Space / Shift). */}
        <span
          className={`skill-dash ${world.time < world.dash.readyAt ? 'cooling' : 'ready'}`}
          aria-label={
            world.time < world.dash.readyAt
              ? `Dash: ${(world.dash.readyAt - world.time).toFixed(1)} s`
              : 'Dash ready (Space / Shift)'
          }
        >
          ⇢{' '}
          {world.time < world.dash.readyAt
            ? `${(world.dash.readyAt - world.time).toFixed(1)} s`
            : 'Dash'}
        </span>
        {/* Task 20: the pet — small portrait with a cooldown ring for timed pets. */}
        {world.pet && <PetHudIcon pet={world.pet} time={world.time} />}
        {buffs.map((b) => (
          <span key={b.id} className="skill-buff">
            {b.id.replace(/_/g, ' ')}
            {b.stacks > 1 ? ` ×${b.stacks}` : ''}
          </span>
        ))}
      </div>
    </>
  );
}

const LIMIT = 2;
const short = (list: readonly string[]) =>
  list.length > LIMIT
    ? `${list.slice(0, LIMIT).join(', ')} +${list.length - LIMIT}`
    : list.join(', ');

/** Compact synergy hint for one offered card (pair prerequisites only, never a trigger promise). */
/** Task 15: synergy level as 3 pips (I / II / III «Awakening»). */
export function SynergyPips({ level }: { level: number }) {
  return (
    <span
      className={`synergy-pips level-${level}`}
      role="img"
      aria-label={level ? `Synergy level ${LEVEL_ROMAN[level]} of III` : 'Synergy locked'}
    >
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= level ? 'on' : undefined} />
      ))}
    </span>
  );
}
/** Task 15 card hint «▲ <Synergy> II/III»: only when this pick raises the level. */
function CardLevelHint({ raises }: { raises: ReturnType<typeof cardLevelRaises> }) {
  if (raises.length === 0) return null;
  return (
    <div className="card-synergy card-synergy-level" data-testid="card-level-hint">
      {raises.map((r) => (
        <span
          key={r.synergy.id}
          className={r.level === 3 ? 'card-synergy-awaken' : 'card-synergy-raise'}
          title={
            r.level === 3
              ? `Awakening: ${SYNERGY_LEVEL_TEXT[r.synergy.id as SynergyId].awakened}`
              : `Level II: ${SYNERGY_LEVEL_TEXT[r.synergy.id as SynergyId].levelTwo}`
          }
        >
          <PairIcons ids={r.pair} />▲{' '}
          <SynergyIcon synergyId={r.synergy.id} size="pair" level={r.level} />
          {r.synergy.name} {LEVEL_ROMAN[r.level]}
        </span>
      ))}
    </div>
  );
}
/** Task 27: the small icons of a synergy pair («[A][B] ▲ Synergy II»), decorative. */
function PairIcons({ ids }: { ids: readonly string[] }) {
  return (
    <span className="pair-icons" aria-hidden="true">
      {ids.map((id) => (
        <SkillIcon key={id} skillId={id} glyph={getSkill(id).icon} size="pair" />
      ))}
    </span>
  );
}
function CardSynergyHint({
  hints,
  skillId,
}: {
  hints: ReturnType<typeof cardSynergyHints>;
  skillId: string;
}) {
  const unlocks = hints.unlocks.map((u) => u.synergy.name);
  const unlockWith = [...new Set(hints.unlocks.flatMap((u) => u.withSkills))];
  const halves = hints.halfPairs.map((h) => h.synergy.name);
  const already = hints.alreadyOpened.map((u) => u.name);
  if (!unlocks.length && !halves.length && !already.length) return null;
  return (
    <div className="card-synergy" aria-label="Card synergies">
      {unlocks.length > 0 && (
        <span
          className="card-synergy-unlock"
          title={`Unlocks: ${hints.unlocks.map((u) => `${u.synergy.name} (pairs with: ${u.withSkills.join(' / ')})`).join('; ')}`}
        >
          <PairIcons ids={[skillId, ...new Set(hints.unlocks.flatMap((u) => u.withSkillIds))]} />✦
          Unlocks: {short(unlocks)} · with {short(unlockWith)}
        </span>
      )}
      {halves.length > 0 && (
        <span
          className="card-synergy-pair"
          title={hints.halfPairs
            .map((h) => `${h.synergy.name}: still needs ${h.partners.join(' or ')}`)
            .join('; ')}
        >
          ◇ Half a pair: {short(halves)}
        </span>
      )}
      {already.length > 0 && (
        <span className="card-synergy-owned" title={`Already unlocks: ${already.join(', ')}`}>
          Already unlocks: {short(already)}
        </span>
      )}
    </div>
  );
}

const DAMAGE_NOTE = `Damage is an example for your current stats against an enemy with ${ALPHA_ENEMY_STATS.resistance} Armor. Crits, target count, marks and Dodge are not guaranteed; the fight total is the sum of separate hits and ticks.`;
/** Readout context from the throttled snapshot only (stats already include passives and buffs). */
function damageContext(world: GameplaySnapshot): DamageContext {
  const ranks = new Map(world.skills.owned.map((o) => [o.skillId, o.rank]));
  return {
    stats: world.stats,
    rankOf: (id) => ranks.get(id) ?? 0,
    targetResistance: ALPHA_ENEMY_STATS.resistance,
    weaponCoefficient: ALPHA_WEAPONS[world.character.characterClass].damageCoefficient,
  };
}
const n1 = (v: number) => String(Math.round(v * 100) / 100);
const DOT_LABEL = { burn: 'Burn', poison: 'Poison', bleed: 'Bleed' } as const;
function lineText(l: ReadoutLine): { main: string; detail?: string } {
  if (l.kind === 'hit') {
    const count = l.count > 1 ? `${l.count} × ` : '';
    const scope = l.perTarget ? ' per target' : l.count > 1 ? ' each' : '';
    const periodic = l.every ? `, every ${n1(l.every)} s (up to ${l.ticks} ticks)` : '';
    return {
      main: `${l.label}: ${count}×${n1(l.coefficient)} → ${l.amount.normal}${scope}${periodic}`,
      detail: `${l.damageType === 'magical' ? 'magic' : 'phys.'} · crit ${l.amount.critical} (chance ${n1(l.amount.critChance)}%)${l.secondary ? ' · secondary effect, no synergies' : ''}${l.condition ? ` · ${l.condition}` : ''}`,
    };
  }
  if (l.kind === 'dot')
    return {
      main: `${l.label}: ${n1(l.rawPerStack)} per stack/tick → ${l.perStackTick}`,
      detail: `${DOT_LABEL[l.effectType]} · ${l.stacks > 1 ? `${l.stacks} stacks · ` : ''}${l.chance < 100 ? `chance ${n1(l.chance)}% · ` : ''}${n1(l.duration)} s · tick ${n1(l.tickInterval)} s · up to ${l.stackCap} stacks (${l.fullStackTick}/tick)${l.condition ? ` · ${l.condition}` : ''}`,
    };
  return { main: l.text };
}
const CHANGE_BADGE: Record<LineChange, string | null> = {
  new: 'new',
  changed: 'changed',
  same: null,
};
/** Separate damage events of one skill rank (never a single "total"). */
function DamageLines({
  readout,
  changes,
  compact = false,
}: {
  readout: SkillDamageReadout;
  changes?: readonly LineChange[];
  compact?: boolean;
}) {
  return (
    <ul className={`damage-lines${compact ? ' is-compact' : ''}`} aria-label="Skill damage">
      {readout.kind === 'auto' && !readout.hasDirectDamage && (
        <li className="damage-line damage-none">No direct damage</li>
      )}
      {readout.lines.map((line, i) => {
        const text = lineText(line);
        const badge = changes ? CHANGE_BADGE[changes[i]] : null;
        return (
          <li key={`${line.kind}:${line.key}`} className={`damage-line damage-${line.kind}`}>
            <span>
              {text.main}
              {badge && <em className={`damage-change change-${changes![i]}`}> {badge}</em>}
            </span>
            {text.detail && <small>{text.detail}</small>}
          </li>
        );
      })}
      {readout.cooldown !== undefined && (
        <li className="damage-line damage-cooldown">Cooldown {n1(readout.cooldown)} s</li>
      )}
    </ul>
  );
}

/** Acquired skills, slots, cooldowns, rerolls and class synergies. Shared by every Skills view. */
export function SkillsOverviewBody({ world }: { world: GameplaySnapshot }) {
  const ctx = damageContext(world);
  return (
    <>
      <div className="skill-overview-groups">
        {(['auto', 'passive'] as const).map((kind) => {
          const slots = world.skills.slots[kind];
          const owned = world.skills.owned.filter((s) => s.kind === kind);
          return (
            <section
              key={kind}
              className={`skill-group kind-${kind}`}
              aria-label={kind === 'auto' ? 'Automatic skills' : 'Passive skills'}
            >
              <h3>
                {kind === 'auto' ? 'Automatic' : 'Passive'} — {slots.used}/{slots.max}
              </h3>
              <p>Free slots: {slots.max - slots.used}</p>
              <ul>
                {owned.map((skill) => {
                  const definition = getSkill(skill.skillId);
                  const remaining = world.skillCombat.cooldowns[skill.skillId] ?? 0;
                  return (
                    <li key={skill.skillId}>
                      <strong className="skill-entry-heading">
                        <SkillIcon skillId={skill.skillId} glyph={skill.icon} size="list" />{' '}
                        {skill.name} · {ROMAN[skill.rank]}
                      </strong>
                      <p className="skill-entry-description">{definition.description}</p>
                      <p>{definition.rankSummaries[skill.rank - 1]}</p>
                      <DamageLines readout={skillDamageReadout(skill.skillId, skill.rank, ctx)} />
                      {kind === 'auto' && (
                        <span aria-label={`Cooldown: ${skill.name}`}>
                          {remaining > 0.05 ? `Cooldown: ${remaining.toFixed(1)} s` : 'Ready'}
                        </span>
                      )}
                    </li>
                  );
                })}
                {Array.from({ length: slots.max - slots.used }, (_, i) => (
                  <li key={`empty-${i}`} className="skill-empty-slot">
                    ◇ Free slot {slots.used + i + 1}
                  </li>
                ))}
              </ul>
              {owned.length === 0 && <p>No skills acquired yet.</p>}
            </section>
          );
        })}
      </div>
      {world.skills.owned.length > 0 && <p className="faint damage-note">{DAMAGE_NOTE}</p>}
      <SynergySection world={world} />
    </>
  );
}

/** Class synergies: pair status, ALL allowed pairs, trigger condition and what is missing. */
function SynergySection({ world }: { world: GameplaySnapshot }) {
  const info = synergyOverview(
    world.character.characterClass,
    world.skills.owned.map((o) => o.skillId),
    ranksOf(world.skills.owned),
  );
  // Effective levels (a DEV/QA override can differ from the ranks).
  const effective = new Map(world.synergyLevels.map((l) => [l.id, l.level]));
  return (
    <section className="synergy-overview" aria-label="Synergies">
      <h3>Synergies</h3>
      <p className="synergy-overview-note">
        Synergies take no slots and are not chosen. Each unlocks with any of its pairs of two
        acquired skills (rank I or higher); “Available” does not mean “triggered” — the effect
        appears in battle when its condition is met.
      </p>
      <ul>
        {info.map((s) => (
          <li
            key={s.id}
            className={`synergy-entry is-${s.status}`}
            data-synergy-id={s.id}
            aria-label={`${s.name}: ${s.status === 'available' ? 'available' : 'locked'}`}
          >
            <div className="synergy-entry-heading">
              <SynergyIcon synergyId={s.id} size="list" level={effective.get(s.id) ?? s.level} />
              <strong>{s.name}</strong>
              <SynergyPips level={effective.get(s.id) ?? s.level} />
              <span className="synergy-status">
                {s.status === 'available' ? '✓ Available' : '◇ Locked'}
              </span>
            </div>
            <p>
              <b>Condition:</b> {s.condition}
            </p>
            <p>
              <b>Effect:</b> {s.effect}
            </p>
            <div className="synergy-pairs">
              <b>Pairs:</b>
              <ul>
                {s.pairs.map((pair) => (
                  <li
                    key={pair.skills.map((k) => k.skillId).join('+')}
                    className={`synergy-pair-row${pair.complete ? ' is-complete' : ''}`}
                  >
                    {pair.skills.map((k, i) => (
                      <span key={k.skillId} className={k.owned ? 'synergy-skill-owned' : undefined}>
                        {i > 0 && ' + '}
                        <SkillIcon skillId={k.skillId} glyph={k.icon} size="pair" />
                        {k.name}
                        {k.owned ? ' ✓' : ''}
                      </span>
                    ))}
                    {pair.complete
                      ? ' — complete'
                      : pair.missing.length === 1
                        ? ` — needs ${pair.missing[0]}`
                        : ''}
                  </li>
                ))}
              </ul>
            </div>
            <p className="synergy-levels">
              <b>II</b> (both skills of a pair at rank III+): {SYNERGY_LEVEL_TEXT[s.id].levelTwo}.{' '}
              <b>III “{SYNERGY_LEVEL_TEXT[s.id].awakened}”</b> (both at rank V):{' '}
              {SYNERGY_LEVEL_TEXT[s.id].awakenedEffect}.
            </p>
            <p className="synergy-explanation">
              {s.explanation}
              {s.bestPair &&
                s.level > 1 &&
                ` Level ${LEVEL_ROMAN[s.level]} comes from the pair: ${s.bestPair}.`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Pause screen: actions first, then the full Skills overview immediately visible. */
export function PauseDialog({ world }: { world: GameplaySnapshot }) {
  return (
    <section
      className="overlay modal-overlay pause-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alpha-dialog-title"
    >
      <div className="pause-panel">
        <div className="pause-header">
          <div className="modal-sigil">Ⅱ</div>
          <div className="eyebrow centered">A MOMENT OF SILENCE</div>
          <h2 id="alpha-dialog-title">Catch your breath.</h2>
          <p>All game time is frozen. P / Esc to continue.</p>
          {/* Task 22: the run details removed from the in-run HUD. */}
          <p className="pause-run-info" aria-label="Run">
            {world.campaign
              ? `${world.campaign.mapId}. ${world.campaign.mapName}${
                  // Task 39: the tier, when not Normal.
                  world.campaign.difficulty && world.campaign.difficulty !== 'normal'
                    ? ` · ${EN.meta.maps.tierNames[world.campaign.difficulty]}`
                    : ''
                } · Stage: ${world.campaign.stage.name} · ${
                  world.campaign.durationReached
                    ? 'time is up'
                    : `${clock(world.campaign.remaining)} left`
                } · `
              : 'Forgotten Grove · '}
            Wave {world.spawning.waves + 1}
          </p>
          <GameSpeedChoice className="pause-game-speed" />
          <div className="pause-actions">
            <button
              className="button primary"
              autoFocus
              onClick={() => alphaBridge.send({ type: 'resume' })}
            >
              Continue →
            </button>
            <button className="text-button" onClick={() => campaignStore.quitToMenu()}>
              {world.campaign ? 'Exit to menu · the run will not count' : 'Choose class'}
            </button>
            {world.campaign && (
              <p className="faint pause-forfeit-note">
                There is no saving mid-run: leaving or reloading the page abandons the run with no
                reward.
              </p>
            )}
            <ReportButton />
            <BuildLabel />
          </div>
        </div>
        <section className="pause-skills" aria-label="Skills overview">
          <div className="skill-overview-heading">
            <h2>Run skills</h2>
            <span
              className="skill-rerolls"
              aria-label={`Rerolls left: ${world.skills.rerolls}`}
              title="Rerolls left"
            >
              ↻ {world.skills.rerolls}
            </span>
          </div>
          <SkillsOverviewBody world={world} />
        </section>
      </div>
    </section>
  );
}

/** Task 20 HUD: pet portrait; timed pets show a conic cooldown ring until their next action. */
function PetHudIcon({ pet, time }: { pet: PetSnapshot; time: number }) {
  const name = PET_CONFIG[pet.id].name;
  const remaining =
    pet.nextActionAt !== null && pet.interval ? Math.max(0, pet.nextActionAt - time) : 0;
  const progress = pet.interval ? 1 - Math.min(1, remaining / pet.interval) : 1;
  return (
    <span
      className={`pet-hud ${pet.interval ? 'timed' : 'aura'}`}
      style={{ ['--progress' as string]: String(progress) }}
      aria-label={
        pet.interval
          ? `Pet “${name}”, level ${pet.level}: acts in ${remaining.toFixed(1)} s`
          : `Pet “${name}”, level ${pet.level}: aura`
      }
      title={name}
    >
      <PetPortrait id={pet.id} size={22} />
    </span>
  );
}

/**
 * Task 22 §1.2: active (automatic) skills only, bottom-left — compact icons with a small rank and
 * a dimmed cooldown overlay with the seconds left. Passives, slot counts and the full list live in
 * the pause menu.
 */
export function ActiveSkills({ world }: { world: GameplaySnapshot }) {
  // Left-handed touch layout: the dash button takes the bottom-left corner (CSS moves the row).
  const leftHanded = useSyncExternalStore(uiSettings.subscribe, uiSettings.get).leftHanded;
  const autos = world.skills.owned.filter((s) => s.kind === 'auto');
  if (autos.length === 0) return null;
  const { cooldowns, cooldownTotals } = world.skillCombat;
  return (
    <ul className={`active-skills${leftHanded ? ' left-handed' : ''}`} aria-label="Active skills">
      {autos.map((s) => {
        const left = cooldowns[s.skillId] ?? 0;
        const cooling = left > 0.05;
        return (
          <li
            key={s.skillId}
            className={`active-skill${cooling ? ' cooling' : ''}${
              s.skillId === world.skills.enhancedSkillId ? ' enhanced' : ''
            }`}
            title={`${s.name} ${ROMAN[s.rank]}`}
            aria-label={`${s.name} ${ROMAN[s.rank]}: ${
              cooling ? `cooldown ${left.toFixed(1)} s` : 'ready'
            }`}
            // Task 27: radial overlay — the dark sector is the part of the cooldown still left.
            style={{
              ['--cooldown-left' as string]: String(
                cooling ? cooldownLeftFraction(left, cooldownTotals[s.skillId] ?? 0) : 0,
              ),
            }}
          >
            <SkillIcon skillId={s.skillId} glyph={s.icon} size="hud" />
            <b aria-hidden="true">{ROMAN[s.rank]}</b>
            {cooling && (
              <small className="active-skill-cd" aria-hidden="true">
                {left < 10 ? left.toFixed(1) : Math.ceil(left)}
              </small>
            )}
          </li>
        );
      })}
    </ul>
  );
}
