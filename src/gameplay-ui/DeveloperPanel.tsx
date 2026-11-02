import { useState } from 'react';
import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import { CLASS_LABELS, DEFAULT_SPAWNING } from '../gameplay';
import { skillsForClass } from '../skills';
import { alphaBridge } from './store';
import { campaignDebug } from './campaign-debug';
import type { AlphaState } from './store';
export default function DeveloperPanel({ state }: { state: AlphaState }) {
  const w = state.world;
  const [characterClass, setClass] = useState<CharacterClass>(
    w?.character.characterClass ?? 'warrior',
  );
  const [level, setLevel] = useState(w?.character.permanentLevel ?? 1);
  const [distance, setDistance] = useState(160),
    [count, setCount] = useState(8);
  const [target, setTarget] = useState('player'),
    [effect, setEffect] = useState('poison');
  const [stacks, setStacks] = useState(1),
    [damage, setDamage] = useState(4),
    [duration, setDuration] = useState(5),
    [chance, setChance] = useState(100);
  const [hp, setHp] = useState(50),
    [protectedTest, setProtection] = useState(false);
  const [xpAmount, setXpAmount] = useState(20);
  const [skillId, setSkillId] = useState(''),
    [skillRank, setSkillRank] = useState(1);
  const [spawnInterval, setSpawnInterval] = useState(
    w?.spawning.settings.interval ?? DEFAULT_SPAWNING.interval,
  );
  const [spawnCount, setSpawnCount] = useState(
    w?.spawning.settings.count ?? DEFAULT_SPAWNING.count,
  );
  const [spawnCap, setSpawnCap] = useState(
    w?.spawning.settings.maxActive ?? DEFAULT_SPAWNING.maxActive,
  );
  const send = (action: unknown) => alphaBridge.send({ type: 'testing', action });
  const [debugLevel, setDebugLevel] = useState(10),
    [debugXp, setDebugXp] = useState(500),
    [debugGold, setDebugGold] = useState(100),
    [timeScale, setTimeScale] = useState(1),
    [saveView, setSaveView] = useState('');
  const restart = () => {
    setProtection(false);
    send({
      type: 'restart',
      options: {
        characterClass,
        level,
        enemyCount: count,
        spawnDistance: distance,
        spawning: {
          interval: spawnInterval,
          minimumInterval: Math.min(1.5, spawnInterval),
          count: spawnCount,
          maximumCount: Math.max(8, spawnCount),
          maxActive: spawnCap,
        },
        onHit: [
          { effectType: effect, rawDamagePerTick: damage, duration, probabilityPercent: chance },
        ],
      },
    });
  };
  const enemies = w?.enemies.filter((e) => e.alive) ?? [];
  const validTarget =
    target === 'player' || enemies.some((e) => e.entityId === target) ? target : 'player';
  const groups = w?.statuses.filter((g) => g.targetId === validTarget) ?? [];
  return (
    <aside className="developer-panel" aria-label="Developer Testing Mode">
      <h2>Developer Testing Mode</h2>
      <p>Временный баланс · изменения класса/уровня начинают новый мир.</p>
      <fieldset aria-label="Campaign Debug">
        <legend>Кампания · профиль</legend>
        <button onClick={() => campaignDebug.unlockMaps()}>Открыть все карты</button>
        <label>
          Уровень класса
          <input
            aria-label="Debug уровень класса"
            type="number"
            min="1"
            max="50"
            value={debugLevel}
            onChange={(e) => setDebugLevel(Number(e.target.value))}
          />
        </label>
        <button onClick={() => campaignDebug.setClassLevel(characterClass, debugLevel)}>
          Установить уровень ({CLASS_LABELS[characterClass]})
        </button>
        <label>
          XP
          <input
            aria-label="Debug XP класса"
            type="number"
            min="0"
            value={debugXp}
            onChange={(e) => setDebugXp(Number(e.target.value))}
          />
        </label>
        <button onClick={() => campaignDebug.grantXp(characterClass, debugXp)}>
          Выдать XP классу
        </button>
        <label>
          Золото
          <input
            aria-label="Debug золото"
            type="number"
            min="0"
            value={debugGold}
            onChange={(e) => setDebugGold(Number(e.target.value))}
          />
        </label>
        <button onClick={() => campaignDebug.grantGold(debugGold)}>Выдать золото</button>
        <button onClick={() => setSaveView(saveView ? '' : campaignDebug.inspectSave())}>
          {saveView ? 'Скрыть сохранение' : 'Показать сохранение'}
        </button>
        <button
          onClick={() => {
            if (window.confirm('Сбросить тестовый прогресс кампании?'))
              campaignDebug.resetProgress();
          }}
        >
          Сбросить тестовый прогресс
        </button>
        {saveView && <textarea aria-label="Debug сохранение" readOnly rows={10} value={saveView} />}
      </fieldset>
      {w?.campaign && (
        <fieldset aria-label="Campaign Run Debug">
          <legend>Кампания · забег</legend>
          <button onClick={() => send({ type: 'campaign-skip' })}>
            К следующему событию ({w.campaign.nextEvent?.id ?? '—'})
          </button>
          <button onClick={() => send({ type: 'campaign-boss-now' })}>Призвать босса</button>
          <button onClick={() => send({ type: 'campaign-boss-hp', fraction: 0.1 })}>
            HP босса → 10%
          </button>
          <button onClick={() => send({ type: 'campaign-force', outcome: 'victory' })}>
            Победа
          </button>
          <button onClick={() => send({ type: 'campaign-force', outcome: 'defeat' })}>
            Поражение
          </button>
          <label>
            Ускорение ×{timeScale}
            <input
              aria-label="Ускорение забега"
              type="range"
              min="1"
              max="20"
              value={timeScale}
              onChange={(e) => {
                setTimeScale(Number(e.target.value));
                alphaBridge.send({ type: 'time-scale', scale: Number(e.target.value) });
              }}
            />
          </label>
        </fieldset>
      )}
      {w && state.qa && (
        <fieldset>
          <legend>God Mode</legend>
          <label>
            <input
              type="checkbox"
              aria-label="God Mode"
              checked={state.qa.godMode}
              onChange={(e) => send({ type: 'god-mode', enabled: e.target.checked })}
            />{' '}
            God Mode {state.qa.godMode ? 'ON' : 'OFF'}
          </label>
          <p>
            Останавливает только потерю HP. Атаки, статусы и таймеры продолжают работать. Новый
            забег: OFF.
          </p>
        </fieldset>
      )}
      {w && state.qa && (
        <fieldset aria-label="Synergy Diagnostics">
          <legend>Synergy Diagnostics · Синергии</legend>
          <button onClick={() => send({ type: 'reset-synergy-counters' })}>
            Сбросить счётчики синергий
          </button>
          {state.qa.synergies.map((synergy) => (
            <div className="synergy-diagnostic" key={synergy.id} data-synergy-id={synergy.id}>
              <strong>
                {synergy.name} ·{' '}
                {synergy.id
                  .split('_')
                  .map((word) => word[0].toUpperCase() + word.slice(1))
                  .join(' ')}
              </strong>
              <code>{synergy.id}</code>
              <p>
                {synergy.unlocked
                  ? `Разблокирована парой: ${synergy.completedPairs.map((p) => p.join(' + ')).join('; ')}`
                  : 'Заблокирована'}{' '}
                · пары: {synergy.unlockPairs.map((p) => p.join(' + ')).join(' | ')}
              </p>
              <p>
                Активаций: <b>{synergy.count}</b>
              </p>
              <p>
                {synergy.lastTime === null
                  ? 'Ещё не срабатывала'
                  : `Последняя: ${synergy.lastTime.toFixed(2)} с · цель ${synergy.lastTargetId}`}
              </p>
            </div>
          ))}
        </fieldset>
      )}
      <fieldset>
        <legend>Персонаж</legend>
        <label>
          Класс
          <select
            aria-label="DEV класс"
            value={characterClass}
            onChange={(e) => setClass(e.target.value as CharacterClass)}
          >
            {CHARACTER_CLASSES.map((c) => (
              <option value={c} key={c}>
                {CLASS_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Уровень
          <input
            aria-label="DEV уровень"
            type="number"
            min="1"
            max="50"
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
          />
        </label>
        <button onClick={restart}>Начать / повторить конфигурацию</button>
        {w && (
          <>
            <p>
              Текущий: {CLASS_LABELS[w.character.characterClass]} · {w.survival.runState}
              <br />
              Revival: {w.survival.revivalUsed ? 'использован' : 'доступен'}
            </p>
            <details>
              <summary>Character Stats</summary>
              <pre>{JSON.stringify(w.character, null, 2)}</pre>
            </details>
            <label>
              HP
              <input
                aria-label="Тестовое HP"
                type="number"
                min="0"
                max={w.player.maxHp}
                step="0.5"
                value={hp}
                onChange={(e) => setHp(Number(e.target.value))}
              />
            </label>
            <button onClick={() => send({ type: 'hp', value: hp })}>Установить HP</button>
            <button onClick={() => send({ type: 'heal' })}>Восстановить HP</button>
            <button onClick={() => send({ type: 'death' })}>Контролируемая смерть</button>
            <p>
              Урон снижает HP целыми единицами; лечение сохраняет дроби. После смерти — Revive или
              новый мир.
            </p>
          </>
        )}
      </fieldset>
      {w && (
        <>
          <fieldset>
            <legend>
              Враги · живых {enemies.length} / {w.spawning.settings.maxActive}
            </legend>
            <label>
              Дистанция
              <input
                aria-label="Дистанция спавна"
                type="number"
                min="0"
                max="1500"
                value={distance}
                onChange={(e) => setDistance(Number(e.target.value))}
              />
            </label>
            <button onClick={() => send({ type: 'spawn', kind: 'melee', distance })}>
              Добавить melee
            </button>
            <button onClick={() => send({ type: 'spawn', kind: 'ranged', distance })}>
              Добавить ranged
            </button>
            <label>
              Размер группы
              <input
                aria-label="Размер группы"
                type="number"
                min="1"
                max="24"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </label>
            <button onClick={() => send({ type: 'group', count, distance })}>
              Добавить группу
            </button>
            <button onClick={() => send({ type: 'clear-enemies' })}>Убрать врагов</button>
          </fieldset>
          <fieldset>
            <legend>Навыки</legend>
            <p>
              Слоты {w.skills.slots.auto.used}/4 · {w.skills.slots.passive.used}/6 · перебросов{' '}
              {w.skills.rerolls} · ожидает выборов {w.skills.pendingChoices}
            </p>
            <ul aria-label="Приобретённые навыки QA">
              {w.skills.owned.map((skill) => (
                <li key={skill.skillId}>
                  {skill.name} · {['', 'I', 'II', 'III', 'IV', 'V'][skill.rank]}
                  <button
                    disabled={skill.rank >= 5}
                    onClick={() =>
                      send({ type: 'grant-skill', skillId: skill.skillId, rank: skill.rank + 1 })
                    }
                  >
                    Улучшить {skill.name}
                  </button>
                </li>
              ))}
            </ul>
            <label>
              Навык
              <select
                aria-label="DEV навык"
                value={skillId}
                onChange={(e) => setSkillId(e.target.value)}
              >
                <option value="">—</option>
                {skillsForClass(w.character.characterClass).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.kind === 'auto' ? 'актив.' : 'пассив.'})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ранг
              <input
                aria-label="DEV ранг"
                type="number"
                min="1"
                max="5"
                value={skillRank}
                onChange={(e) => setSkillRank(Number(e.target.value))}
              />
            </label>
            <button
              disabled={!skillId}
              onClick={() => send({ type: 'grant-skill', skillId, rank: skillRank })}
            >
              Выдать навык
            </button>
          </fieldset>
          <fieldset>
            <legend>XP и волны</legend>
            <p>
              Забег: уровень {w.progression.level} · {w.progression.xp}/{w.progression.nextXp} XP ·
              всего {w.progression.totalXp}. Постоянный уровень не меняется.
            </p>
            <label>
              XP
              <input
                aria-label="DEV XP"
                type="number"
                min="0"
                max="1000000"
                value={xpAmount}
                onChange={(e) => setXpAmount(Number(e.target.value))}
              />
            </label>
            <button onClick={() => send({ type: 'grant-xp', amount: xpAmount })}>Выдать XP</button>
            <button
              onClick={() =>
                send({ type: 'grant-xp', amount: w.progression.nextXp - w.progression.xp })
              }
            >
              Следующий уровень забега
            </button>
            <button onClick={() => send({ type: 'xp-crystal', value: xpAmount, distance: 90 })}>
              Кристалл справа
            </button>
            <p>
              Кристаллов: {w.crystals.length}. Следующая волна через{' '}
              {Math.max(0, w.spawning.nextSpawnAt - w.time).toFixed(2)} с · волн {w.spawning.waves}.
            </p>
            <label>
              <input
                aria-label="Непрерывный спавн"
                type="checkbox"
                checked={w.spawning.settings.enabled}
                onChange={(e) =>
                  send({ type: 'spawning', settings: { enabled: e.target.checked } })
                }
              />{' '}
              Непрерывный спавн
            </label>
            <label>
              Интервал, с
              <input
                aria-label="Интервал волн"
                type="number"
                min="0.25"
                max="60"
                step="0.25"
                value={spawnInterval}
                onChange={(e) => setSpawnInterval(Number(e.target.value))}
              />
            </label>
            <label>
              Врагов / волна
              <input
                aria-label="Врагов в волне"
                type="number"
                min="1"
                max="24"
                value={spawnCount}
                onChange={(e) => setSpawnCount(Number(e.target.value))}
              />
            </label>
            <label>
              Максимум живых
              <input
                aria-label="Лимит врагов"
                type="number"
                min="1"
                max="120"
                value={spawnCap}
                onChange={(e) => setSpawnCap(Number(e.target.value))}
              />
            </label>
            <button
              onClick={() =>
                send({
                  type: 'spawning',
                  settings: {
                    interval: spawnInterval,
                    minimumInterval: Math.min(1.5, spawnInterval),
                    count: spawnCount,
                    maximumCount: Math.max(8, spawnCount),
                    maxActive: spawnCap,
                  },
                })
              }
            >
              Применить волны
            </button>
            <p>
              Применение параметров начинает новый интервал от текущего времени. Пауза/Revive
              сохраняют расписание.
            </p>
          </fieldset>
          <fieldset>
            <legend>Poison / Burn / Bleed</legend>
            <label>
              Цель
              <select
                aria-label="Цель эффекта"
                value={validTarget}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="player">Игрок</option>
                {enemies.map((e) => (
                  <option key={e.entityId} value={e.entityId}>
                    {e.entityId} · {e.config.behavior}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Эффект
              <select
                aria-label="Тип эффекта"
                value={effect}
                onChange={(e) => setEffect(e.target.value)}
              >
                {['poison', 'burn', 'bleed'].map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </select>
            </label>
            <label>
              Стаки
              <input
                aria-label="Стаки эффекта"
                type="number"
                min="1"
                max="20"
                value={stacks}
                onChange={(e) => setStacks(Number(e.target.value))}
              />
            </label>
            <label>
              Raw / tick
              <input
                aria-label="Урон эффекта"
                type="number"
                min="0"
                value={damage}
                onChange={(e) => setDamage(Number(e.target.value))}
              />
            </label>
            <label>
              Длительность, с
              <input
                aria-label="Длительность эффекта"
                type="number"
                min="0.1"
                step="0.1"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </label>
            <button
              onClick={() =>
                send({
                  type: 'effect',
                  targetId: validTarget,
                  effectType: effect,
                  stacks,
                  damage,
                  duration,
                })
              }
            >
              Применить эффект
            </button>
            <button onClick={() => send({ type: 'cleanse', targetId: validTarget })}>
              Очистить эффекты
            </button>
            <label>
              On-hit шанс, %
              <input
                aria-label="Шанс on-hit"
                type="number"
                min="0"
                max="100"
                value={chance}
                onChange={(e) => setChance(Number(e.target.value))}
              />
            </label>
            <button
              onClick={() => send({ type: 'on-hit', effectType: effect, damage, duration, chance })}
            >
              Назначить on-hit оружию
            </button>
            <p>Использует выбранные тип, raw/tick и длительность. 0% отключает эффект.</p>
            <div className="dev-groups">
              {groups.length ? (
                groups.map((g) => (
                  <p key={g.id}>
                    {g.effectType} ×{g.stacks.length} · ещё {(g.expiresAt - w.time).toFixed(2)}с ·
                    тик через {Math.max(0, g.nextTickAt - w.time).toFixed(2)}с
                  </p>
                ))
              ) : (
                <p>На цели нет эффектов</p>
              )}
            </div>
          </fieldset>
          <fieldset>
            <legend>Бой</legend>
            <label>
              <input
                type="checkbox"
                checked={protectedTest}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setProtection(enabled);
                  send({ type: 'protection', enabled });
                }}
              />{' '}
              Тестовая полная защита
            </label>
            <p>Не изменяет штатный таймер воскрешения; не мешает контролируемой смерти.</p>
            <button onClick={() => alphaBridge.send({ type: w.paused ? 'resume' : 'pause' })}>
              {w.paused ? 'Продолжить бой' : 'Пауза боя'}
            </button>
            <details open>
              <summary>Последние боевые события (до 20)</summary>
              <div className="dev-events">
                {state.events
                  .filter(
                    (e) =>
                      e.channel === 'combat' ||
                      e.channel === 'survival' ||
                      e.channel === 'progression' ||
                      e.channel === 'spawning',
                  )
                  .slice(-20)
                  .reverse()
                  .map((e) => (
                    <pre key={e.sequence}>
                      {e.time.toFixed(3)} · {JSON.stringify(e.event)}
                    </pre>
                  ))}
              </div>
            </details>
          </fieldset>
        </>
      )}
    </aside>
  );
}
