import type { GameplaySnapshot } from '../gameplay';
import type { OfferCard } from '../skills';
import { getSkill } from '../skills';
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
          {offer.cards.map((card, i) => (
            <button
              key={`${offer.id}-${cardKey(card)}`}
              className={`upgrade-card skill-card ${card.kind === 'skill' ? `kind-${card.skillKind}` : 'kind-bonus'}`}
              autoFocus={i === 0}
              role="listitem"
              aria-label={
                card.kind === 'skill'
                  ? `${card.name}, ${card.isNew ? 'новый навык' : 'улучшение'}, ранг ${ROMAN[card.nextRank]}`
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
          ))}
        </div>
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
      </aside>
    </>
  );
}
