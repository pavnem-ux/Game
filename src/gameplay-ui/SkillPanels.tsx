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
import { useEffect, useRef, useState } from 'react';
import { uiSound } from './sound';
import { alphaBridge } from './store';
import { BuildLabel } from './BuildLabel';
import { ReportButton } from './ReportButton';
import { campaignStore } from './campaign-state';
import { Button } from './kit';
import { RU } from './strings-ru';
import { skipCoins } from '../equipment/economy';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
/** Force monochrome text presentation so symbols never render as colour emoji. */
const textGlyph = (icon: string) => `${icon}\uFE0E`;
const cardKey = (c: OfferCard) => (c.kind === 'skill' ? c.skillId : `bonus:${c.bonusId}`);

/** Level-up choice: up to three cards, exactly one pick, three rerolls per run. */
export function LevelUpDialog({
  world,
  onOpenSkills,
  hiddenBehindSkills = false,
}: {
  world: GameplaySnapshot;
  onOpenSkills: () => void;
  hiddenBehindSkills?: boolean;
}) {
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
  const O = RU.meta.offer;
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
  // Hotkeys: R reroll, B banish mode, S skip, 1–3 pick (or banish in banish mode).
  useEffect(() => {
    if (hiddenBehindSkills) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const live = alphaBridge.getSnapshot().world?.skills;
      const current = live?.offer;
      if (!live || !current) return;
      const k = e.key.toLowerCase();
      const n = Number(e.key);
      if (k === 'r' || k === 'к') {
        if (current.rerollAvailable) alphaBridge.send({ type: 'reroll' });
        else uiSound('ui-error');
      } else if (k === 'b' || k === 'и') {
        const can =
          current.mode === 'skills' &&
          live.banishes > 0 &&
          current.cards.some((c) => live.banishBlocked[cardKey(c)] === null);
        if (can || banishRef.current) {
          setBanishMode(!banishRef.current);
          uiSound('ui-click');
        } else uiSound('ui-error');
      } else if (k === 's' || k === 'ы') {
        alphaBridge.send({ type: 'skip-offer' });
      } else if (n >= 1 && n <= 3) {
        // Resolved by the scene against the world's current offer (no stale card keys).
        alphaBridge.send({ type: 'offer-key', index: n - 1, banish: banishRef.current });
        if (banishRef.current) setBanishMode(false);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hiddenBehindSkills]);
  return (
    <section
      className="overlay modal-overlay"
      role="dialog"
      aria-modal="true"
      data-sound="none" /* card pick / reroll / banish / skip sound from the world events */
      aria-labelledby="skill-title"
      inert={hiddenBehindSkills}
      aria-hidden={hiddenBehindSkills || undefined}
    >
      <div className="upgrade-panel skill-panel">
        <div className="modal-sigil">✧</div>
        <div className="eyebrow centered">
          {bonus ? 'ВСЕ НАВЫКИ НА ПРЕДЕЛЕ' : 'ИСКРА СТАНОВИТСЯ СИЛЬНЕЕ'}
        </div>
        <h2 id="skill-title">
          Уровень забега {world.progression.level}
          <span>.</span>
        </h2>
        <p className="modal-description">
          {bonus
            ? 'Выберите награду. Слоты не тратятся.'
            : `Активные ${skills.slots.auto.used}/${skills.slots.auto.max} · пассивные ${skills.slots.passive.used}/${skills.slots.passive.max} · выбор навсегда до конца забега`}
          {skills.pendingChoices > 1 && ` · ещё выборов: ${skills.pendingChoices - 1}`}
        </p>
        <button
          className="button skills-modal-open"
          aria-label="Обзор навыков"
          onClick={onOpenSkills}
        >
          Навыки
        </button>
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
                      ? `${card.name}, ${card.isNew ? 'новый навык' : 'улучшение'}, ранг ${ROMAN[card.nextRank]}${opens ? `, откроет синергию: ${hints!.unlocks.map((u) => u.synergy.name).join(', ')}` : ''}${raises.length ? `, поднимет синергию: ${raises.map((r) => `${r.synergy.name} ${LEVEL_ROMAN[r.level]}`).join(', ')}` : ''}`
                      : `${card.name}, награда`
                }
                onClick={() => pick(cardKey(card))}
                disabled={banishMode && skills.banishBlocked[cardKey(card)] !== null}
              >
                <div className="card-top">
                  <span>
                    {card.kind === 'bonus'
                      ? 'НАГРАДА'
                      : `${card.skillKind === 'auto' ? 'АКТИВНЫЙ' : 'ПАССИВНЫЙ'} · ${card.isNew ? 'НОВЫЙ' : 'УЛУЧШЕНИЕ'}`}
                  </span>
                  <small>0{i + 1}</small>
                </div>
                <div className="upgrade-icon">{textGlyph(card.icon)}</div>
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
                {hints && <CardSynergyHint hints={hints} />}
                <CardLevelHint raises={raises} />
                <div className="card-bottom">
                  <span>
                    {card.kind === 'skill'
                      ? card.isNew
                        ? 'РАНГ I'
                        : `РАНГ ${ROMAN[card.currentRank]} → ${ROMAN[card.nextRank]}`
                      : 'ПОВТОРЯЕМАЯ'}
                  </span>
                  <b>Выбрать →</b>
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
            ✦ Синергия открывается, когда собраны оба навыка пары, и срабатывает в бою, когда
            выполнено её условие.
          </p>
        )}
        {offer.cards.some((c) => c.kind === 'skill') && (
          <p className="faint damage-note">{DAMAGE_NOTE}</p>
        )}
        {/* Task 14: reroll / banish / skip with counters (kit buttons, reasons as tooltips). */}
        <div className="meta-ui offer-controls" role="group" aria-label="Управление выбором">
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
          <small className="offer-hotkeys">{O.hotkeys}</small>
          {skills.banished.length > 0 && (
            <small className="offer-hotkeys">{O.banished(skills.banished.length)}</small>
          )}
        </div>
        <p className="faint">Время остановлено. Выбирайте без спешки.</p>
      </div>
    </section>
  );
}

/**
 * Task 09.1 C1 (Mage superpower «Пятый круг»): the one-time choice of the enhanced skill among
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
        <div className="eyebrow centered">ПЯТЫЙ КРУГ</div>
        <h2 id="enhanced-title">
          Усиленный навык<span>.</span>
        </h2>
        <p className="modal-description">
          Пятый активный слот открыт. Выберите один из пяти активных навыков — он станет усиленным
          (таланты ветки «Верховный маг»). Выбор разовый; по умолчанию усилен последний полученный
          навык.
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
                aria-label={`${skill?.name ?? id}${current ? ', сейчас усилен' : ''}`}
                onClick={() => alphaBridge.send({ type: 'choose-enhanced', skillId: id })}
              >
                <div className="card-top">
                  <span>{current ? 'ПО УМОЛЧАНИЮ' : 'АКТИВНЫЙ'}</span>
                  <small>0{i + 1}</small>
                </div>
                <div className="upgrade-icon">{textGlyph(skill?.icon ?? '✶')}</div>
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
                  <b>Усилить →</b>
                </div>
              </button>
            );
          })}
        </div>
        <p className="faint">Время остановлено. Выбирайте без спешки.</p>
      </div>
    </section>
  );
}

/** Equipped skills with ranks and remaining cooldowns, plus gold and barrier. */
export function SkillBar({
  world,
  open,
  onOpen,
  onClose,
  context,
}: {
  world: GameplaySnapshot;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  context: string;
}) {
  const { owned, slots, gold } = world.skills;
  const { cooldowns, barrier, buffs } = world.skillCombat;
  return (
    <>
      <div className="skill-bar" aria-label="Навыки забега">
        <button
          className="skill-overview-toggle"
          aria-label="Обзор навыков"
          aria-expanded={open}
          aria-controls="skill-overview"
          hidden={context !== 'playing'}
          onClick={open ? onClose : onOpen}
        >
          Навыки
        </button>
        {owned.map((s) => (
          <span
            key={s.skillId}
            className={`skill-chip kind-${s.kind}${s.skillId === world.skills.enhancedSkillId ? ' enhanced' : ''}`}
            title={`${s.name} ${ROMAN[s.rank]}${s.skillId === world.skills.enhancedSkillId ? ' · усиленный' : ''}`}
          >
            <i>{textGlyph(s.icon)}</i>
            <b>{ROMAN[s.rank]}</b>
            {s.kind === 'auto' && (cooldowns[s.skillId] ?? 0) > 0.05 && (
              <small>{cooldowns[s.skillId].toFixed(1)}</small>
            )}
          </span>
        ))}
        <span className="skill-slots">
          Автоматические {slots.auto.used}/{slots.auto.max} · Пассивные {slots.passive.used}/
          {slots.passive.max}
        </span>
        {gold > 0 && <span className="skill-gold">◎ {gold}</span>}
        {barrier > 0 && <span className="skill-barrier">◈ {Math.ceil(barrier)}</span>}
        {/* Task 14: dash readiness (Space / Shift). */}
        <span
          className={`skill-dash ${world.time < world.dash.readyAt ? 'cooling' : 'ready'}`}
          aria-label={
            world.time < world.dash.readyAt
              ? `Рывок: ${(world.dash.readyAt - world.time).toFixed(1)} с`
              : 'Рывок готов (Пробел / Shift)'
          }
        >
          ⇢{' '}
          {world.time < world.dash.readyAt
            ? `${(world.dash.readyAt - world.time).toFixed(1)} с`
            : 'Рывок'}
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
      {open && <SkillOverview world={world} onClose={onClose} context={context} />}
    </>
  );
}

const LIMIT = 2;
const short = (list: readonly string[]) =>
  list.length > LIMIT
    ? `${list.slice(0, LIMIT).join(', ')} +${list.length - LIMIT}`
    : list.join(', ');

/** Compact synergy hint for one offered card (pair prerequisites only, never a trigger promise). */
/** Task 15: synergy level as 3 pips (I / II / III «Пробуждение»). */
export function SynergyPips({ level }: { level: number }) {
  return (
    <span
      className={`synergy-pips level-${level}`}
      role="img"
      aria-label={level ? `Уровень синергии ${LEVEL_ROMAN[level]} из III` : 'Синергия закрыта'}
    >
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= level ? 'on' : undefined} />
      ))}
    </span>
  );
}
/** Task 15 card hint «▲ <Синергия> II/III»: only when this pick raises the level. */
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
              ? `Пробуждение: ${SYNERGY_LEVEL_TEXT[r.synergy.id as SynergyId].awakened}`
              : `Уровень II: ${SYNERGY_LEVEL_TEXT[r.synergy.id as SynergyId].levelTwo}`
          }
        >
          ▲ {r.synergy.name} {LEVEL_ROMAN[r.level]}
        </span>
      ))}
    </div>
  );
}
function CardSynergyHint({ hints }: { hints: ReturnType<typeof cardSynergyHints> }) {
  const unlocks = hints.unlocks.map((u) => u.synergy.name);
  const unlockWith = [...new Set(hints.unlocks.flatMap((u) => u.withSkills))];
  const halves = hints.halfPairs.map((h) => h.synergy.name);
  const already = hints.alreadyOpened.map((u) => u.name);
  if (!unlocks.length && !halves.length && !already.length) return null;
  return (
    <div className="card-synergy" aria-label="Синергии карты">
      {unlocks.length > 0 && (
        <span
          className="card-synergy-unlock"
          title={`Откроет: ${hints.unlocks.map((u) => `${u.synergy.name} (пара с: ${u.withSkills.join(' / ')})`).join('; ')}`}
        >
          ✦ Откроет: {short(unlocks)} · с {short(unlockWith)}
        </span>
      )}
      {halves.length > 0 && (
        <span
          className="card-synergy-pair"
          title={hints.halfPairs
            .map((h) => `${h.synergy.name}: нужен ещё ${h.partners.join(' или ')}`)
            .join('; ')}
        >
          ◇ Половина пары: {short(halves)}
        </span>
      )}
      {already.length > 0 && (
        <span className="card-synergy-owned" title={`Уже открывает: ${already.join(', ')}`}>
          Уже открывает: {short(already)}
        </span>
      )}
    </div>
  );
}

const DAMAGE_NOTE = `Урон — пример для текущих характеристик против врага с Resistance ${ALPHA_ENEMY_STATS.resistance}. Крит, число целей, метки и Dodge не гарантированы; итог боя — сумма отдельных попаданий и тиков.`;
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
    const scope = l.perTarget ? ' за цель' : l.count > 1 ? ' каждый' : '';
    const periodic = l.every ? `, каждые ${n1(l.every)} с (до ${l.ticks} тиков)` : '';
    return {
      main: `${l.label}: ${count}×${n1(l.coefficient)} → ${l.amount.normal}${scope}${periodic}`,
      detail: `${l.damageType === 'magical' ? 'маг.' : 'физ.'} · крит ${l.amount.critical} (шанс ${n1(l.amount.critChance)}%)${l.secondary ? ' · доп. эффект, без синергий' : ''}${l.condition ? ` · ${l.condition}` : ''}`,
    };
  }
  if (l.kind === 'dot')
    return {
      main: `${l.label}: ${n1(l.rawPerStack)} за стак/тик → ${l.perStackTick}`,
      detail: `${DOT_LABEL[l.effectType]} · ${l.stacks > 1 ? `${l.stacks} стака · ` : ''}${l.chance < 100 ? `шанс ${n1(l.chance)}% · ` : ''}${n1(l.duration)} с · тик ${n1(l.tickInterval)} с · до ${l.stackCap} стаков (${l.fullStackTick}/тик)${l.condition ? ` · ${l.condition}` : ''}`,
    };
  return { main: l.text };
}
const CHANGE_BADGE: Record<LineChange, string | null> = {
  new: 'новое',
  changed: 'изменено',
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
    <ul className={`damage-lines${compact ? ' is-compact' : ''}`} aria-label="Урон навыка">
      {readout.kind === 'auto' && !readout.hasDirectDamage && (
        <li className="damage-line damage-none">Нет прямого урона</li>
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
        <li className="damage-line damage-cooldown">Перезарядка {n1(readout.cooldown)} с</li>
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
              aria-label={kind === 'auto' ? 'Автоматические навыки' : 'Пассивные навыки'}
            >
              <h3>
                {kind === 'auto' ? 'Автоматические' : 'Пассивные'} — {slots.used}/{slots.max}
              </h3>
              <p>Свободных слотов: {slots.max - slots.used}</p>
              <ul>
                {owned.map((skill) => {
                  const definition = getSkill(skill.skillId);
                  const remaining = world.skillCombat.cooldowns[skill.skillId] ?? 0;
                  return (
                    <li key={skill.skillId}>
                      <strong className="skill-entry-heading">
                        <i aria-hidden="true">{textGlyph(skill.icon)}</i> {skill.name} ·{' '}
                        {ROMAN[skill.rank]}
                      </strong>
                      <p className="skill-entry-description">{definition.description}</p>
                      <p>{definition.rankSummaries[skill.rank - 1]}</p>
                      <DamageLines readout={skillDamageReadout(skill.skillId, skill.rank, ctx)} />
                      {kind === 'auto' && (
                        <span aria-label={`Перезарядка: ${skill.name}`}>
                          {remaining > 0.05 ? `Перезарядка: ${remaining.toFixed(1)} с` : 'Готов'}
                        </span>
                      )}
                    </li>
                  );
                })}
                {Array.from({ length: slots.max - slots.used }, (_, i) => (
                  <li key={`empty-${i}`} className="skill-empty-slot">
                    ◇ Свободный слот {slots.used + i + 1}
                  </li>
                ))}
              </ul>
              {owned.length === 0 && <p>Пока нет приобретённых навыков.</p>}
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
    <section className="synergy-overview" aria-label="Синергии">
      <h3>Синергии</h3>
      <p className="synergy-overview-note">
        Синергии не занимают слоты и не выбираются. Каждая открывается любой своей парой из двух
        приобретённых навыков (ранг I или выше); «Доступна» не значит «сработала» — эффект
        появляется в бою, когда выполнено условие.
      </p>
      <ul>
        {info.map((s) => (
          <li
            key={s.id}
            className={`synergy-entry is-${s.status}`}
            data-synergy-id={s.id}
            aria-label={`${s.name}: ${s.status === 'available' ? 'доступна' : 'закрыта'}`}
          >
            <div className="synergy-entry-heading">
              <strong>{s.name}</strong>
              <SynergyPips level={effective.get(s.id) ?? s.level} />
              <span className="synergy-status">
                {s.status === 'available' ? '✓ Доступна' : '◇ Закрыта'}
              </span>
            </div>
            <p>
              <b>Условие:</b> {s.condition}
            </p>
            <p>
              <b>Эффект:</b> {s.effect}
            </p>
            <div className="synergy-pairs">
              <b>Пары:</b>
              <ul>
                {s.pairs.map((pair) => (
                  <li
                    key={pair.skills.map((k) => k.skillId).join('+')}
                    className={`synergy-pair-row${pair.complete ? ' is-complete' : ''}`}
                  >
                    {pair.skills.map((k, i) => (
                      <span key={k.skillId} className={k.owned ? 'synergy-skill-owned' : undefined}>
                        {i > 0 && ' + '}
                        {k.name}
                        {k.owned ? ' ✓' : ''}
                      </span>
                    ))}
                    {pair.complete
                      ? ' — собрана'
                      : pair.missing.length === 1
                        ? ` — нужен ${pair.missing[0]}`
                        : ''}
                  </li>
                ))}
              </ul>
            </div>
            <p className="synergy-levels">
              <b>II</b> (оба навыка пары ранга III+): {SYNERGY_LEVEL_TEXT[s.id].levelTwo}.{' '}
              <b>III «{SYNERGY_LEVEL_TEXT[s.id].awakened}»</b> (оба ранга V):{' '}
              {SYNERGY_LEVEL_TEXT[s.id].awakenedEffect}.
            </p>
            <p className="synergy-explanation">
              {s.explanation}
              {s.bestPair &&
                s.level > 1 &&
                ` Уровень ${LEVEL_ROMAN[s.level]} даёт пара: ${s.bestPair}.`}
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
          <div className="eyebrow centered">МИГ ТИШИНЫ</div>
          <h2 id="alpha-dialog-title">Перевести дух.</h2>
          <p>Всё игровое время остановлено. P / Esc — продолжить.</p>
          <div className="pause-actions">
            <button
              className="button primary"
              autoFocus
              onClick={() => alphaBridge.send({ type: 'resume' })}
            >
              Продолжить →
            </button>
            <button className="text-button" onClick={() => campaignStore.quitToMenu()}>
              {world.campaign ? 'Выйти в меню · забег не засчитается' : 'Выбрать класс'}
            </button>
            {world.campaign && (
              <p className="faint pause-forfeit-note">
                Сохранения внутри забега нет: выход или перезагрузка страницы — отказ без награды.
              </p>
            )}
            <ReportButton />
            <BuildLabel />
          </div>
        </div>
        <section className="pause-skills" aria-label="Обзор навыков">
          <div className="skill-overview-heading">
            <h2>Навыки забега</h2>
            <span
              className="skill-rerolls"
              aria-label={`Перебросов осталось: ${world.skills.rerolls}`}
              title="Оставшиеся перебросы"
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

/** Read-only, non-modal overview. Opening/closing never changes simulation pause state. */
function SkillOverview({
  world,
  onClose,
  context,
}: {
  world: GameplaySnapshot;
  onClose: () => void;
  context: string;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const blocking = context !== 'playing';
  useEffect(() => {
    closeButton.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      const pauseKey = event.code === 'KeyP' || event.key.toLowerCase() === 'p';
      if (event.key === 'Escape' || (blocking && pauseKey)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === 'Escape' && !event.repeat) onClose();
      }
      if (event.key === 'Tab' && blocking) {
        // The overview contains only this one control; keep focus above the inert underlying modal.
        event.preventDefault();
        closeButton.current?.focus();
      }
    };
    document.addEventListener('keydown', keyboard, true);
    return () => document.removeEventListener('keydown', keyboard, true);
  }, [onClose, blocking]);
  return (
    <>
      {blocking && <div className="skill-overview-backdrop" aria-hidden="true" />}
      <aside
        id="skill-overview"
        className={`skill-overview ${blocking ? 'is-blocking' : ''}`}
        aria-label="Обзор навыков"
        role={blocking ? 'dialog' : undefined}
        aria-modal={blocking || undefined}
      >
        <div className="skill-overview-heading">
          <h2>Навыки забега</h2>
          <span
            className="skill-rerolls"
            aria-label={`Перебросов осталось: ${world.skills.rerolls}`}
            title="Оставшиеся перебросы"
          >
            ↻ {world.skills.rerolls}
          </span>
          <button ref={closeButton} onClick={onClose} aria-label="Закрыть обзор навыков">
            {blocking ? (context === 'level-up' ? 'К выбору' : 'Назад') : '×'}
          </button>
        </div>
        <p className="skill-overview-note">
          {blocking
            ? 'Игра остаётся на паузе. Esc — назад.'
            : 'Обзор не останавливает игру. Esc — закрыть.'}
        </p>
        <SkillsOverviewBody world={world} />
      </aside>
    </>
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
          ? `Питомец «${name}», уровень ${pet.level}: действие через ${remaining.toFixed(1)} с`
          : `Питомец «${name}», уровень ${pet.level}: аура`
      }
      title={name}
    >
      <PetPortrait id={pet.id} size={22} />
    </span>
  );
}
