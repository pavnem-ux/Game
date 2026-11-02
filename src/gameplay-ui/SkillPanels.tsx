import type { GameplaySnapshot } from '../gameplay';
import { ALPHA_ENEMY_STATS, ALPHA_WEAPONS } from '../gameplay';
import type {
  DamageContext,
  LineChange,
  OfferCard,
  ReadoutLine,
  SkillDamageReadout,
} from '../skills';
import {
  cardSynergyHints,
  compareRanks,
  getSkill,
  skillDamageReadout,
  synergyOverview,
} from '../skills';
import { useEffect, useRef } from 'react';
import { alphaBridge } from './store';
import { campaignStore } from './campaign-state';

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
            const pairs = (hints?.halfPairs.length ?? 0) > 0;
            const comparison =
              card.kind === 'skill'
                ? compareRanks(card.skillId, card.currentRank, damageContext(world))
                : null;
            return (
              <button
                key={`${offer.id}-${cardKey(card)}`}
                className={`upgrade-card skill-card ${card.kind === 'skill' ? `kind-${card.skillKind}` : 'kind-bonus'}${opens ? ' synergy-unlock' : pairs ? ' synergy-pair' : ''}`}
                autoFocus={i === 0}
                role="listitem"
                aria-label={
                  card.kind === 'skill'
                    ? `${card.name}, ${card.isNew ? 'новый навык' : 'улучшение'}, ранг ${ROMAN[card.nextRank]}${opens ? `, откроет синергию: ${hints!.unlocks.map((u) => u.synergy.name).join(', ')}` : ''}`
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
                {comparison && (
                  <DamageLines
                    readout={comparison.to}
                    changes={comparison.from ? comparison.changes.map((c) => c.change) : undefined}
                    compact
                  />
                )}
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
            ✦ Синергия открывается, когда собраны оба навыка пары, и срабатывает в бою, когда
            выполнено её условие.
          </p>
        )}
        {offer.cards.some((c) => c.kind === 'skill') && (
          <p className="faint damage-note">{DAMAGE_NOTE}</p>
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

/** Compact synergy hint for one offered card (pair prerequisites only, never a trigger promise). */
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
  );
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
            <button className="text-button" onClick={() => campaignStore.quitToMenu()}>
              {world.campaign ? 'Выйти в меню · забег не засчитается' : 'Выбрать класс'}
            </button>
            {world.campaign && (
              <p className="faint pause-forfeit-note">
                Сохранения внутри забега нет: выход или перезагрузка страницы — отказ без награды.
              </p>
            )}
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
