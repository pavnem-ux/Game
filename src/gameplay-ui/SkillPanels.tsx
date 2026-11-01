import type { GameplaySnapshot } from '../gameplay';
import type { OfferCard } from '../skills';
import { cardSynergyHints, getSkill, synergyOverview } from '../skills';
import { useEffect, useRef } from 'react';
import { alphaBridge } from './store';

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
  return (
    <section
      className="overlay modal-overlay"
      role="dialog"
      aria-modal="true"
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
            const pairs = (hints?.combinesWith.length ?? 0) > 0;
            return (
              <button
                key={`${offer.id}-${cardKey(card)}`}
                className={`upgrade-card skill-card ${card.kind === 'skill' ? `kind-${card.skillKind}` : 'kind-bonus'}${opens ? ' synergy-unlock' : pairs ? ' synergy-pair' : ''}`}
                autoFocus={i === 0}
                role="listitem"
                aria-label={
                  card.kind === 'skill'
                    ? `${card.name}, ${card.isNew ? 'новый навык' : 'улучшение'}, ранг ${ROMAN[card.nextRank]}${opens ? `, откроет синергию: ${hints!.unlocks.map((u) => u.name).join(', ')}` : ''}`
                    : `${card.name}, награда`
                }
                onClick={() => alphaBridge.send({ type: 'choose-skill', card: cardKey(card) })}
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
                {hints && <CardSynergyHint hints={hints} />}
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
            ✦ Синергия открывается выбором навыка и срабатывает в бою, когда выполнено её условие.
          </p>
        )}
        {!bonus && (
          <button
            className="text-button"
            disabled={!offer.rerollAvailable}
            onClick={() => alphaBridge.send({ type: 'reroll' })}
          >
            Перебросить · осталось {skills.rerolls}
          </button>
        )}
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
            className={`skill-chip kind-${s.kind}`}
            title={`${s.name} ${ROMAN[s.rank]}`}
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

/** Compact synergy hint for one offered card (prerequisites only, never a trigger promise). */
function CardSynergyHint({ hints }: { hints: ReturnType<typeof cardSynergyHints> }) {
  const unlocks = hints.unlocks.map((u) => u.name);
  const partners = [...new Set(hints.combinesWith.flatMap((c) => c.ownedSkills))];
  const pairedRules = hints.combinesWith.map((c) => c.synergy.name);
  const already = hints.alreadyOpened.map((u) => u.name);
  if (!unlocks.length && !partners.length && !already.length) return null;
  return (
    <div className="card-synergy" aria-label="Синергии карты">
      {unlocks.length > 0 && (
        <span className="card-synergy-unlock" title={`Откроет синергию: ${unlocks.join(', ')}`}>
          ✦ Откроет: {short(unlocks)}
        </span>
      )}
      {partners.length > 0 && (
        <span
          className="card-synergy-pair"
          title={`Уже открытые синергии: ${pairedRules.join(', ')}`}
        >
          ⟷ Сочетается с: {short(partners)}
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

/** Acquired skills, slots, cooldowns, rerolls and class synergies. Shared by every Skills view. */
export function SkillsOverviewBody({ world }: { world: GameplaySnapshot }) {
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
      <SynergySection world={world} />
    </>
  );
}

/** Class synergies: prerequisite status, unlocking skills, trigger condition and what is missing. */
function SynergySection({ world }: { world: GameplaySnapshot }) {
  const info = synergyOverview(
    world.character.characterClass,
    world.skills.owned.map((o) => o.skillId),
  );
  return (
    <section className="synergy-overview" aria-label="Синергии">
      <h3>Синергии</h3>
      <p className="synergy-overview-note">
        Синергии не занимают слоты и не выбираются. «Доступна» значит, что нужный навык уже есть;
        сама синергия срабатывает в бою, когда выполнено условие.
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
            <p>
              <b>Открывает:</b> {s.requirement} —{' '}
              {s.unlockingSkills.map((u, i) => (
                <span key={u.skillId} className={u.owned ? 'synergy-skill-owned' : undefined}>
                  {i > 0 && ', '}
                  {u.name}
                  {u.owned && ' ✓'}
                </span>
              ))}
            </p>
            <p className="synergy-explanation">{s.explanation}</p>
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
            <button className="text-button" onClick={() => alphaBridge.send({ type: 'menu' })}>
              Выбрать класс
            </button>
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
