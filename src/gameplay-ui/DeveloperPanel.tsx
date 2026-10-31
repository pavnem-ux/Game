import { useState } from 'react';
import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import { CLASS_LABELS } from '../gameplay';
import { alphaBridge } from './store';
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
  const send = (action: unknown) => alphaBridge.send({ type: 'testing', action });
  const restart = () => {
    setProtection(false);
    send({
      type: 'restart',
      options: {
        characterClass,
        level,
        enemyCount: count,
        spawnDistance: distance,
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
            <legend>Враги · живых {enemies.length} / 120</legend>
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
                  .filter((e) => e.channel === 'combat' || e.channel === 'survival')
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
