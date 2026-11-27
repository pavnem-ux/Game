import { TALENT_CONFIG } from '../talents';
import { useState } from 'react';
import { DEBUG_TIME_SCALES } from '../engine/time-scale';
import { CAMPAIGN_MAPS } from '../campaign';
import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import { CLASS_LABELS, DEFAULT_SPAWNING } from '../gameplay';
import { skillsForClass } from '../skills';
import { alphaBridge } from './store';
import { campaignDebug } from './campaign-debug';
import type { AlphaState } from './store';
import { ENEMY_KINDS } from '../gameplay';
import { GEAR_SLOTS, RARITIES, SLOT_LABELS } from '../equipment';
import type { GearSlot, Rarity } from '../equipment';
import { PET_CONFIG, PET_IDS } from '../pets';
import { QUESTS } from '../quests';
import type { EnemyKind } from '../gameplay';
import { BUFFS, BUFF_IDS, CHEST_NAMES } from '../gameplay/chests';
import type { ChestContent, ChestType } from '../gameplay/chests';
import { ACTIVITY_NAMES, ACTIVITY_RULES, ACTIVITY_TYPES } from '../gameplay/activities';

/** Task 12 debug labels (English since Task 23). */
const ENEMY_KIND_LABELS: Record<EnemyKind, string> = {
  melee: 'Melee',
  ranged: 'Ranged',
  swift: 'Swift Imp',
  brute: 'Stone Troll',
  bombard: 'Bombard Warlock',
};
const CONTENT_LABELS: Record<ChestContent, string> = {
  heal: 'Heal 15%',
  gold: 'Gold',
  magnet: 'Magnet',
  fury: BUFFS.fury.name,
  haste: BUFFS.haste.name,
  lightStep: BUFFS.lightStep.name,
};
export default function DeveloperPanel({ state }: { state: AlphaState }) {
  const w = state.world;
  // Task 08.5 §3.2: DEV/QA-only crash trigger for testing the error boundary (render error).
  const [crashNow, setCrashNow] = useState(false);
  if (crashNow) throw new Error('Debug crash: simulated render error');
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
  const [enemyKind, setEnemyKind] = useState<EnemyKind>('swift'),
    [chestType, setChestType] = useState<ChestType>('wooden'),
    [chestContent, setChestContent] = useState<ChestContent | ''>('');
  const [debugLevel, setDebugLevel] = useState(10),
    [debugXp, setDebugXp] = useState(500),
    [debugGold, setDebugGold] = useState(100),
    [debugOre, setDebugOre] = useState(50),
    [grantSlot, setGrantSlot] = useState<GearSlot>('weapon'),
    [grantRarity, setGrantRarity] = useState<Rarity>('rare'),
    [grantLevel, setGrantLevel] = useState(10),
    [debugPet, setDebugPet] = useState<string>('owlet'),
    [debugQuest, setDebugQuest] = useState<string>(QUESTS[0].id),
    [questCounter, setQuestCounter] = useState<'swift' | 'brute' | 'bombard' | 'elite' | 'chests'>(
      'swift',
    ),
    [questAmount, setQuestAmount] = useState(100),
    [debugPetLevel, setDebugPetLevel] = useState(1),
    [debugSeed, setDebugSeed] = useState(String(w?.seed ?? 1)),
    [jumpMap, setJumpMap] = useState(11),
    [talentNodeChoice, setTalentNode] = useState(''),
    [talentRank, setTalentRank] = useState(1),
    [saveView, setSaveView] = useState('');
  const talentNode = talentNodeChoice.startsWith(`${characterClass}.`)
    ? talentNodeChoice
    : `${characterClass}.b1.n01`;
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
      <p>Provisional balance · class/level changes start a new world.</p>
      <fieldset aria-label="Campaign Debug">
        <legend>Campaign · profile</legend>
        <button onClick={() => campaignDebug.unlockMaps()}>Unlock all maps</button>
        <label>
          Map
          <input
            aria-label="Debug map"
            type="number"
            min={1}
            max={CAMPAIGN_MAPS.length}
            value={jumpMap}
            onChange={(e) => setJumpMap(Number(e.target.value))}
          />
        </label>
        <button
          onClick={() => {
            if (!campaignDebug.jumpToMap(jumpMap)) window.alert('Map not found.');
          }}
        >
          Jump to map
        </button>
        <label>
          Class level
          <input
            aria-label="Debug class level"
            type="number"
            min="1"
            max="50"
            value={debugLevel}
            onChange={(e) => setDebugLevel(Number(e.target.value))}
          />
        </label>
        <button
          onClick={() => {
            const r = campaignDebug.setClassLevel(characterClass, debugLevel);
            if (r?.talentsReset) window.alert('Talent tree reset: it does not fit the level.');
          }}
        >
          Set level ({CLASS_LABELS[characterClass]})
        </button>

        <label>
          XP
          <input
            aria-label="Debug class XP"
            type="number"
            min="0"
            value={debugXp}
            onChange={(e) => setDebugXp(Number(e.target.value))}
          />
        </label>
        <button onClick={() => campaignDebug.grantXp(characterClass, debugXp)}>
          Grant class XP
        </button>
        <label>
          Gold
          <input
            aria-label="Debug gold"
            type="number"
            min="0"
            value={debugGold}
            onChange={(e) => setDebugGold(Number(e.target.value))}
          />
        </label>
        <button onClick={() => campaignDebug.grantGold(debugGold)}>Grant Gold</button>
        <label>
          Seed
          <input
            aria-label="Debug seed"
            inputMode="numeric"
            value={debugSeed}
            onChange={(e) => setDebugSeed(e.target.value.trim())}
          />
        </label>
        <button
          onClick={() => {
            if (!campaignDebug.startWithSeed(debugSeed))
              window.alert('Seed: an integer 0–4294967295.');
          }}
        >
          Start the selected map with this seed
        </button>
        <button onClick={() => setSaveView(saveView ? '' : campaignDebug.inspectSave())}>
          {saveView ? 'Hide save' : 'Show save'}
        </button>
        <button
          onClick={() => {
            if (window.confirm('Reset test campaign progress?')) campaignDebug.resetProgress();
          }}
        >
          Reset test progress
        </button>
        <button onClick={() => setCrashNow(true)}>Simulate a crash</button>
        <label className="debug-file">
          Load report → import save
          <input
            type="file"
            accept="application/json,.json"
            aria-label="Debug report file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              void f.text().then(
                (text) => campaignDebug.stageReport(text, f.name),
                () => campaignDebug.stageReport('', f.name),
              );
            }}
          />
        </label>
        {saveView && <textarea aria-label="Debug save" readOnly rows={10} value={saveView} />}
      </fieldset>
      <fieldset aria-label="Gear Debug">
        <legend>Equipment and shop</legend>
        <button onClick={() => campaignDebug.equipBestTier(characterClass)}>
          Legendary set at class level ({CLASS_LABELS[characterClass]})
        </button>
        {/* Task 40: grant a random item of a slot, rarity and item level (validated save). */}
        <label>
          Slot
          <select
            aria-label="Debug item slot"
            value={grantSlot}
            onChange={(e) => setGrantSlot(e.target.value as GearSlot)}
          >
            {GEAR_SLOTS.map((s) => (
              <option key={s} value={s}>
                {SLOT_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rarity
          <select
            aria-label="Debug item rarity"
            value={grantRarity}
            onChange={(e) => setGrantRarity(e.target.value as Rarity)}
          >
            {RARITIES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label>
          Item level
          <input
            aria-label="Debug item level"
            type="number"
            min="1"
            max="50"
            value={grantLevel}
            onChange={(e) => setGrantLevel(Number(e.target.value))}
          />
        </label>
        <button
          onClick={() =>
            campaignDebug.grantItem(characterClass, grantSlot, grantRarity, grantLevel)
          }
        >
          Grant item
        </button>
        {/* Task 19 §1.5: ore (validated save; DEV/QA only). */}
        <label>
          Ore
          <input
            aria-label="Debug ore"
            type="number"
            min="0"
            value={debugOre}
            onChange={(e) => setDebugOre(Number(e.target.value))}
          />
        </label>
        <button onClick={() => campaignDebug.grantOre(debugOre)}>Grant Ore</button>
      </fieldset>
      {/* Task 21 §1.6: quests (validated saves; DEV/QA only). */}
      <fieldset aria-label="Quest Debug">
        <legend>Quests</legend>
        <label>
          Quest
          <select
            aria-label="Debug quest"
            value={debugQuest}
            onChange={(e) => setDebugQuest(e.target.value)}
          >
            {QUESTS.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => campaignDebug.completeQuest(debugQuest)}>Complete quest</button>
        <label>
          Counter
          <select
            aria-label="Debug quest counter"
            value={questCounter}
            onChange={(e) => setQuestCounter(e.target.value as typeof questCounter)}
          >
            <option value="swift">Swift</option>
            <option value="brute">Brutes</option>
            <option value="bombard">Bombards</option>
            <option value="elite">Elites</option>
            <option value="chests">Chests</option>
          </select>
        </label>
        <input
          aria-label="Debug counter increment"
          type="number"
          min="0"
          value={questAmount}
          onChange={(e) => setQuestAmount(Number(e.target.value))}
        />
        <button onClick={() => campaignDebug.addQuestCounter(questCounter, questAmount)}>
          Add to counter
        </button>
        <button
          onClick={() => {
            if (window.confirm('Reset quests (counters and claimed rewards)?'))
              campaignDebug.resetQuests();
          }}
        >
          Reset quests
        </button>
      </fieldset>
      {/* Task 20 §1.5: pets (validated saves / the current run; DEV/QA only). */}
      <fieldset aria-label="Pet Debug">
        <legend>Pets</legend>
        <button onClick={() => campaignDebug.unlockAllPets()}>Unlock all pets</button>
        <label>
          Pet
          <select
            aria-label="Debug pet"
            value={debugPet}
            onChange={(e) => setDebugPet(e.target.value)}
          >
            {PET_IDS.map((id) => (
              <option key={id} value={id}>
                {PET_CONFIG[id].name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Level
          <select
            aria-label="Debug pet level"
            value={debugPetLevel}
            onChange={(e) => setDebugPetLevel(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => campaignDebug.setPetLevel(debugPet, debugPetLevel)}>
          Set pet level
        </button>
        <button onClick={() => send({ type: 'pet', id: debugPet, level: debugPetLevel })}>
          Summon pet into the run
        </button>
        <button onClick={() => send({ type: 'pet', id: null })}>Remove pet from the run</button>
      </fieldset>
      <fieldset aria-label="Talent Debug">
        <legend>Talents · {CLASS_LABELS[characterClass]}</legend>
        <label>
          Talent
          <select
            aria-label="Debug talent"
            value={talentNode}
            onChange={(e) => setTalentNode(e.target.value)}
          >
            {TALENT_CONFIG.branchesOf(characterClass).flatMap((b) =>
              b.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {b.branch}.{n.order} {n.name}
                </option>
              )),
            )}
          </select>
        </label>
        <label>
          Rank
          <select
            aria-label="Debug talent rank"
            value={talentRank}
            onChange={(e) => setTalentRank(Number(e.target.value))}
          >
            {[0, 1, 2, 3].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            if (!campaignDebug.setTalentRank(characterClass, talentNode, talentRank))
              window.alert('Rank not set (needs more than 26 points?).');
          }}
        >
          Set talent rank
        </button>
        <button onClick={() => campaignDebug.resetTalents(characterClass)}>
          Reset talent tree
        </button>
        <button onClick={() => campaignDebug.toggleSuperpowerPreset(characterClass)}>
          Toggle superpower preset
        </button>
      </fieldset>
      {w?.campaign && (
        <fieldset aria-label="Campaign Run Debug">
          <legend>Campaign · run</legend>
          <button onClick={() => send({ type: 'campaign-skip' })}>
            Skip to next event ({w.campaign.nextEvent?.id ?? '—'})
          </button>
          <button onClick={() => send({ type: 'campaign-boss-now' })}>Summon boss</button>
          <button onClick={() => alphaBridge.send({ type: 'kill-on-screen' })}>
            Kill everything on screen
          </button>
          <button onClick={() => send({ type: 'campaign-boss-hp', fraction: 0.1 })}>
            Boss HP → 10%
          </button>
          <button onClick={() => send({ type: 'campaign-force', outcome: 'victory' })}>
            Victory
          </button>
          <button onClick={() => send({ type: 'campaign-force', outcome: 'defeat' })}>
            Defeat
          </button>
          <div role="group" aria-label="Run speed-up">
            Speed-up
            {DEBUG_TIME_SCALES.map((scale) => (
              <button
                key={scale}
                aria-pressed={(state.timeScale ?? 1) === scale}
                onClick={() => alphaBridge.send({ type: 'time-scale', scale })}
              >
                ×{scale}
              </button>
            ))}
          </div>
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
          <p>Stops HP loss only. Attacks, statuses and timers keep running. New run: OFF.</p>
        </fieldset>
      )}
      {w && (
        <fieldset aria-label="Choice and Dash Debug">
          <legend>Choices and dash · Task 14</legend>
          <button onClick={() => send({ type: 'grant-choices', rerolls: 3, banishes: 2 })}>
            +3 rerolls, +2 banishes
          </button>
          <button onClick={() => send({ type: 'dash-cooldown', seconds: 0 })}>
            Dash without cooldown
          </button>
          <button onClick={() => send({ type: 'dash-cooldown', seconds: null })}>
            Normal dash cooldown
          </button>
        </fieldset>
      )}
      {w && state.qa && (
        <fieldset aria-label="Synergy Diagnostics">
          <legend>Synergy Diagnostics</legend>
          <button onClick={() => send({ type: 'reset-synergy-counters' })}>
            Reset synergy counters
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
                  ? `Unlocked by pair: ${synergy.completedPairs.map((p) => p.join(' + ')).join('; ')}`
                  : 'Locked'}{' '}
                · pairs: {synergy.unlockPairs.map((p) => p.join(' + ')).join(' | ')}
              </p>
              <p data-testid={`synergy-level-${synergy.id}`}>
                Level: <b>{['—', 'I', 'II', 'III'][synergy.level]}</b>
                {synergy.forced ? ' (set manually)' : ''} · best pair:{' '}
                {synergy.bestPair ? synergy.bestPair.join(' + ') : 'none'}
              </p>
              <label>
                Set level{' '}
                <select
                  aria-label={`Synergy level ${synergy.name}`}
                  value={synergy.forced ? String(synergy.level) : 'auto'}
                  onChange={(e) =>
                    send({
                      type: 'synergy-level',
                      id: synergy.id,
                      level: e.target.value === 'auto' ? null : Number(e.target.value),
                    })
                  }
                >
                  <option value="auto">by ranks</option>
                  <option value="0">locked</option>
                  <option value="1">I</option>
                  <option value="2">II</option>
                  <option value="3">III</option>
                </select>
              </label>
              <p>
                Activations: <b>{synergy.count}</b>
              </p>
              <p>
                {synergy.lastTime === null
                  ? 'Not triggered yet'
                  : `Last: ${synergy.lastTime.toFixed(2)} s · target ${synergy.lastTargetId}`}
              </p>
            </div>
          ))}
        </fieldset>
      )}
      <fieldset>
        <legend>Character</legend>
        <label>
          Class
          <select
            aria-label="DEV class"
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
          Level
          <input
            aria-label="DEV level"
            type="number"
            min="1"
            max="50"
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
          />
        </label>
        <button onClick={restart}>Start / repeat configuration</button>
        {w && (
          <>
            <p>
              Current: {CLASS_LABELS[w.character.characterClass]} · {w.survival.runState}
              <br />
              Revival: {w.survival.revivalUsed ? 'used' : 'available'}
            </p>
            <details>
              <summary>Character Stats</summary>
              <pre>{JSON.stringify(w.character, null, 2)}</pre>
            </details>
            <label>
              HP
              <input
                aria-label="Test HP"
                type="number"
                min="0"
                max={w.player.maxHp}
                step="0.5"
                value={hp}
                onChange={(e) => setHp(Number(e.target.value))}
              />
            </label>
            <button onClick={() => send({ type: 'hp', value: hp })}>Set HP</button>
            <button onClick={() => send({ type: 'heal' })}>Restore HP</button>
            <button onClick={() => send({ type: 'death' })}>Controlled death</button>
            <p>
              Damage lowers HP in whole units; healing keeps fractions. After death — Revive or a
              new world.
            </p>
          </>
        )}
      </fieldset>
      {w && (
        <>
          <fieldset>
            <legend>
              Enemies · alive {enemies.length} / {w.spawning.settings.maxActive}
            </legend>
            <label>
              Distance
              <input
                aria-label="Spawn distance"
                type="number"
                min="0"
                max="1500"
                value={distance}
                onChange={(e) => setDistance(Number(e.target.value))}
              />
            </label>
            <button onClick={() => send({ type: 'spawn', kind: 'melee', distance })}>
              Add melee
            </button>
            <button onClick={() => send({ type: 'spawn', kind: 'ranged', distance })}>
              Add ranged
            </button>
            {/* Task 12 §1.5: N enemies of any kind. */}
            <label>
              Enemy type
              <select
                aria-label="Debug enemy type"
                value={enemyKind}
                onChange={(e) => setEnemyKind(e.target.value as EnemyKind)}
              >
                {ENEMY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ENEMY_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => send({ type: 'spawn-n', kind: enemyKind, count, distance })}>
              Add {count} · {ENEMY_KIND_LABELS[enemyKind]}
            </button>
            <label>
              Group size
              <input
                aria-label="Group size"
                type="number"
                min="1"
                max="24"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </label>
            <button onClick={() => send({ type: 'group', count, distance })}>Add group</button>
            <button onClick={() => send({ type: 'clear-enemies' })}>Remove enemies</button>
          </fieldset>
          {/* Task 12 §1.5: chests, buffs, auto-collect (campaign runs). */}
          <fieldset aria-label="Chest Debug">
            <legend>Chests and buffs</legend>
            <label>
              Chest
              <select
                aria-label="Debug chest"
                value={chestType}
                onChange={(e) => setChestType(e.target.value as ChestType)}
              >
                <option value="wooden">{CHEST_NAMES.wooden}</option>
                <option value="enchanted">{CHEST_NAMES.enchanted}</option>
              </select>
            </label>
            <label>
              Contents
              <select
                aria-label="Debug chest contents"
                value={chestContent}
                onChange={(e) => setChestContent(e.target.value as ChestContent | '')}
              >
                <option value="">Random</option>
                {(chestType === 'wooden'
                  ? (['heal', 'gold'] as const)
                  : (['magnet', ...BUFF_IDS] as const)
                ).map((c) => (
                  <option key={c} value={c}>
                    {CONTENT_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() =>
                send({
                  type: 'chest',
                  chestType,
                  ...(chestContent ? { content: chestContent } : {}),
                })
              }
            >
              Spawn chest
            </button>
            {BUFF_IDS.map((b) => (
              <button key={b} onClick={() => send({ type: 'buff', buff: b })}>
                Buff: {BUFFS[b].name}
              </button>
            ))}
            {state.qa && (
              <label>
                <input
                  type="checkbox"
                  aria-label="Auto-collect XP and coins"
                  checked={state.qa.autoCollect}
                  onChange={(e) => send({ type: 'auto-collect', enabled: e.target.checked })}
                />
                Auto-collect XP and coins (every second)
              </label>
            )}
          </fieldset>
          {w.activities && (
            <fieldset aria-label="Activity Debug">
              <legend>Map activities</legend>
              <p>
                Next activity at {w.activities.nextSpawnAt.toFixed(1)} s · active{' '}
                {w.activities.items.length} / {ACTIVITY_RULES.maxActive} · banked Ore{' '}
                {w.activities.ore}
              </p>
              {ACTIVITY_TYPES.map((t) => (
                <button key={t} onClick={() => send({ type: 'activity', activityType: t })}>
                  Spawn {ACTIVITY_NAMES[t]}
                </button>
              ))}
              <ul aria-label="Active activities">
                {w.activities.items.map((a) => (
                  <li key={a.id}>
                    {a.name} · {a.phase} · {Math.round(a.progress * 100)}%
                    {a.light !== null ? ` · Light ${Math.round(a.light)}` : ''}{' '}
                    <button
                      onClick={() =>
                        send({ type: 'activity-resolve', id: a.id, outcome: 'complete' })
                      }
                    >
                      Complete
                    </button>
                    <button
                      onClick={() => send({ type: 'activity-resolve', id: a.id, outcome: 'fail' })}
                    >
                      Fail
                    </button>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
          <fieldset>
            <legend>Skills</legend>
            <p>
              Slots {w.skills.slots.auto.used}/4 · {w.skills.slots.passive.used}/6 · rerolls{' '}
              {w.skills.rerolls} · pending choices {w.skills.pendingChoices}
            </p>
            <ul aria-label="Acquired skills QA">
              {w.skills.owned.map((skill) => (
                <li key={skill.skillId}>
                  {skill.name} · {['', 'I', 'II', 'III', 'IV', 'V'][skill.rank]}
                  <button
                    disabled={skill.rank >= 5}
                    onClick={() =>
                      send({ type: 'grant-skill', skillId: skill.skillId, rank: skill.rank + 1 })
                    }
                  >
                    Upgrade {skill.name}
                  </button>
                </li>
              ))}
            </ul>
            <label>
              Skill
              <select
                aria-label="DEV skill"
                value={skillId}
                onChange={(e) => setSkillId(e.target.value)}
              >
                <option value="">—</option>
                {skillsForClass(w.character.characterClass).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.kind === 'auto' ? 'active' : 'passive'})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Rank
              <input
                aria-label="DEV rank"
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
              Grant skill
            </button>
          </fieldset>
          <fieldset>
            <legend>XP and waves</legend>
            <p>
              Run: level {w.progression.level} · {w.progression.xp}/{w.progression.nextXp} XP ·
              total {w.progression.totalXp}. The permanent level does not change.
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
            <button onClick={() => send({ type: 'grant-xp', amount: xpAmount })}>Grant XP</button>
            <button
              onClick={() =>
                send({ type: 'grant-xp', amount: w.progression.nextXp - w.progression.xp })
              }
            >
              Next run level
            </button>
            <button onClick={() => send({ type: 'xp-crystal', value: xpAmount, distance: 90 })}>
              Crystal to the right
            </button>
            <p>
              Crystals: {w.crystals.length}. Next wave in{' '}
              {Math.max(0, w.spawning.nextSpawnAt - w.time).toFixed(2)} s · waves {w.spawning.waves}
              .
            </p>
            <label>
              <input
                aria-label="Continuous spawning"
                type="checkbox"
                checked={w.spawning.settings.enabled}
                onChange={(e) =>
                  send({ type: 'spawning', settings: { enabled: e.target.checked } })
                }
              />{' '}
              Continuous spawning
            </label>
            <label>
              Interval, s
              <input
                aria-label="Wave interval"
                type="number"
                min="0.25"
                max="60"
                step="0.25"
                value={spawnInterval}
                onChange={(e) => setSpawnInterval(Number(e.target.value))}
              />
            </label>
            <label>
              Enemies / wave
              <input
                aria-label="Enemies per wave"
                type="number"
                min="1"
                max="24"
                value={spawnCount}
                onChange={(e) => setSpawnCount(Number(e.target.value))}
              />
            </label>
            <label>
              Max alive
              <input
                aria-label="Enemy limit"
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
              Apply waves
            </button>
            <p>
              Applying settings starts a new interval from the current time. Pause/Revive keep the
              schedule.
            </p>
          </fieldset>
          <fieldset>
            <legend>Poison / Burn / Bleed</legend>
            <label>
              Target
              <select
                aria-label="Effect target"
                value={validTarget}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="player">Player</option>
                {enemies.map((e) => (
                  <option key={e.entityId} value={e.entityId}>
                    {e.entityId} · {e.config.behavior}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Effect
              <select
                aria-label="Effect type"
                value={effect}
                onChange={(e) => setEffect(e.target.value)}
              >
                {['poison', 'burn', 'bleed'].map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </select>
            </label>
            <label>
              Stacks
              <input
                aria-label="Effect stacks"
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
                aria-label="Effect damage"
                type="number"
                min="0"
                value={damage}
                onChange={(e) => setDamage(Number(e.target.value))}
              />
            </label>
            <label>
              Duration, s
              <input
                aria-label="Effect duration"
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
              Apply effect
            </button>
            <button onClick={() => send({ type: 'cleanse', targetId: validTarget })}>
              Clear effects
            </button>
            <label>
              On-hit chance, %
              <input
                aria-label="On-hit chance"
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
              Assign on-hit to weapon
            </button>
            <p>Uses the selected type, raw/tick and duration. 0% disables the effect.</p>
            <div className="dev-groups">
              {groups.length ? (
                groups.map((g) => (
                  <p key={g.id}>
                    {g.effectType} ×{g.stacks.length} · {(g.expiresAt - w.time).toFixed(2)}s left ·
                    tick in {Math.max(0, g.nextTickAt - w.time).toFixed(2)}s
                  </p>
                ))
              ) : (
                <p>No effects on the target</p>
              )}
            </div>
          </fieldset>
          <fieldset>
            <legend>Combat</legend>
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
              Test full protection
            </label>
            <p>Does not change the normal revival timer; does not block a controlled death.</p>
            <button onClick={() => alphaBridge.send({ type: w.paused ? 'resume' : 'pause' })}>
              {w.paused ? 'Resume combat' : 'Pause combat'}
            </button>
            <details open>
              <summary>Recent combat events (up to 20)</summary>
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
