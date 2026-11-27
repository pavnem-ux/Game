import { LEGENDARY_TEXT, legendaryChance, legendaryPool } from '../../equipment';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  CAMPAIGN_ACTS,
  CAMPAIGN_DIFFICULTIES,
  CAMPAIGN_MAPS,
  getCampaignMap,
} from '../../campaign';
import type { CampaignDifficulty, CampaignMap } from '../../campaign';
import { CLASS_LABELS } from '../../gameplay';
import { isMapUnlocked, isTierUnlocked, recommendedLevel } from '../../profile';
import { campaignStore } from '../campaign-state';
import { clock, factor, minutes } from '../campaign-format';
import { BackgroundArt, BossPortrait, Button, Panel } from '../kit';
import { EN } from '../strings-en';

const M = EN.meta.maps;
/** Path geometry (px): node spacing, act banner height, winding amplitude. */
const STEP = 96;
const BANNER = 120;
const AMPLITUDE = 34; // % of the path width around its centre
const MODIFIER_ICONS: Record<string, string> = {
  swift: '⚡',
  ranged15: '➶',
  ranged18: '➶➶',
  elites: '♛',
};

/** Vertical position (px from the top) and horizontal position (% of width) of map `id`. */
export function mapNodePosition(id: number): { x: number; y: number } {
  const total = CAMPAIGN_MAPS.length;
  // Map 1 at the bottom: the journey climbs. Each act gets a banner above its first map.
  const fromTop = total - id;
  const actsAbove = CAMPAIGN_ACTS.filter((a) => a.firstMap > id).length;
  const y = BANNER + actsAbove * BANNER + fromTop * STEP + STEP / 2;
  const x = 50 + AMPLITUDE * Math.sin(id * 0.85);
  return { x, y };
}
const PATH_HEIGHT = BANNER + CAMPAIGN_ACTS.length * BANNER + CAMPAIGN_MAPS.length * STEP;

/**
 * Task 13 §3 Map path: 40 nodes on a winding path through 4 act regions; states locked /
 * available (pulsing) / completed (best result); boss crest and modifier icons per node; the
 * current node is centred on open; a side panel shows the selected map with «To battle».
 */
export function MapPathPage() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile;
  const [panelMap, setPanelMap] = useState(ui.selectedMapId);
  const current = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    current.current?.scrollIntoView({ block: 'center' });
    current.current?.focus({ preventScroll: true });
  }, []);
  if (!profile) return <p className="campaign-empty">Profile unavailable.</p>;
  const map = CAMPAIGN_MAPS[panelMap - 1];
  const points = CAMPAIGN_MAPS.map((m) => mapNodePosition(m.id));
  const done = new Set(profile.completedMaps);
  return (
    <div className="map-path-screen">
      <div className="map-path-scroll" aria-label={M.title} role="region">
        <div className="map-path" style={{ height: PATH_HEIGHT }}>
          {CAMPAIGN_ACTS.map((a) => {
            const top = mapNodePosition(a.lastMap).y - STEP / 2 - BANNER;
            const bottom = mapNodePosition(a.firstMap).y + STEP / 2;
            return (
              <section
                key={a.id}
                className={`act-region act-${a.id}`}
                style={{ top, height: bottom - top }}
                aria-label={M.act(a.roman, a.name)}
              >
                {/* Task 31: the act's background (lazy: only on the map path). */}
                <BackgroundArt which={a.id as 1 | 2 | 3 | 4} />
                <h3 className="act-banner">
                  <small>Act {a.roman}</small>
                  {a.name}
                  <span>
                    {a.firstMap}–{a.lastMap}
                  </span>
                </h3>
              </section>
            );
          })}
          <svg
            className="map-trail"
            width="100%"
            height={PATH_HEIGHT}
            viewBox={`0 0 100 ${PATH_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {points.slice(1).map((p, i) => {
              const a = points[i];
              const mid = (a.y + p.y) / 2;
              return (
                <path
                  key={i}
                  className={done.has(i + 1) ? 'trail-done' : 'trail-open'}
                  d={`M ${a.x} ${a.y} C ${a.x} ${mid}, ${p.x} ${mid}, ${p.x} ${p.y}`}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
          <ol className="map-nodes">
            {CAMPAIGN_MAPS.map((m) => {
              const unlocked = isMapUnlocked(profile, m.id);
              const completed = done.has(m.id);
              const state = completed ? 'completed' : unlocked ? 'available' : 'locked';
              const p = mapNodePosition(m.id);
              const isCurrent = m.id === ui.selectedMapId;
              return (
                <li
                  key={m.id}
                  className={`map-node state-${state} ${panelMap === m.id ? 'selected' : ''}`}
                  style={{ left: `${p.x}%`, top: p.y }}
                  data-map-id={m.id}
                >
                  <button
                    ref={isCurrent ? current : undefined}
                    className="map-node-button"
                    aria-label={M.node(
                      m.id,
                      m.name,
                      completed ? M.done : unlocked ? M.available : M.locked,
                    )}
                    aria-pressed={panelMap === m.id}
                    onClick={() => {
                      setPanelMap(m.id);
                      if (unlocked) campaignStore.selectMap(m.id);
                    }}
                  >
                    <span className="map-node-number">{completed ? '✓' : m.id}</span>
                  </button>
                  <span className="map-node-label">
                    <b>{m.name}</b>
                    <span className="map-node-icons" aria-hidden="true">
                      <i className="boss-crest" title={M.boss}>
                        ♚
                      </i>
                      {m.modifiers.map((x) => (
                        <i key={x.id} title={x.label}>
                          {MODIFIER_ICONS[x.id] ?? '✦'}
                        </i>
                      ))}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      {/* Task 39: a new map starts on Normal (the tier choice is per panel). */}
      <MapPanel key={map.id} map={map} />
    </div>
  );
}

function MapPanel({ map: base }: { map: CampaignMap }) {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile!;
  const unlocked = isMapUnlocked(profile, base.id);
  // Task 39: the chosen difficulty tier (only unlocked tiers can be chosen).
  const [chosen, setTier] = useState<CampaignDifficulty>('normal');
  const tier = isTierUnlocked(profile, base.id, chosen) ? chosen : 'normal';
  const map = getCampaignMap(base.id, tier);
  const act = CAMPAIGN_ACTS[map.act - 1];
  const best = profile.bestResults[String(map.id)];
  const cls = profile.selectedClass;
  const level = profile.classes[cls].level;
  const recommended = recommendedLevel(map.id);
  const locked = unlocked ? null : M.lockedReason(map.id - 1);
  return (
    <Panel
      className={`map-panel act-${map.act} ${unlocked ? '' : 'locked'}`}
      aria-label={`${map.id}. ${map.name}`}
      title={
        <>
          <small className="map-panel-act">{M.act(act.roman, act.name)}</small>
          {map.id}. {map.name}
        </>
      }
    >
      {locked && <p className="map-locked-reason">🔒 {locked}</p>}
      {unlocked && (
        <fieldset className="map-tiers" data-testid="map-tiers">
          <legend>{M.tier}</legend>
          <div className="map-tier-options" role="radiogroup" aria-label={M.tier}>
            {CAMPAIGN_DIFFICULTIES.map((t, i) => {
              const open = isTierUnlocked(profile, base.id, t);
              const reason = open
                ? M.tierHints[t]
                : M.tierLocked(M.tierNames[CAMPAIGN_DIFFICULTIES[i - 1]]);
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={tier === t}
                  className={`map-tier ${tier === t ? 'is-selected' : ''}`}
                  data-tier={t}
                  disabled={!open}
                  title={reason}
                  onClick={() => setTier(t)}
                >
                  {open ? '' : '🔒 '}
                  {M.tierNames[t]}
                </button>
              );
            })}
          </div>
          <p className="map-tier-hint">{M.tierHints[tier]}</p>
        </fieldset>
      )}
      <dl className="map-facts">
        <dt>{M.duration}</dt>
        <dd>{minutes(map.durationSeconds)}</dd>
        <dt>{M.difficulty}</dt>
        <dd>
          health {factor(map.difficulty.hp)} · damage {factor(map.difficulty.damage)} · waves{' '}
          {factor(map.difficulty.spawnRate)}
        </dd>
        <dt>{M.recommended}</dt>
        <dd className={level >= recommended ? 'level-ok' : 'level-low'}>
          {recommended} · {CLASS_LABELS[cls]}: {M.yourLevel(level)}
        </dd>
        <dt>{M.rewards}</dt>
        <dd>
          {M.reward(map.victoryXp, map.victoryGold)}
          {(map.goldScale !== 1 || map.oreScale !== 1 || map.xpScale !== 1) &&
            M.rewardScaled(map.goldScale, map.oreScale, map.xpScale)}
        </dd>
        <dt>{M.modifiers}</dt>
        <dd>
          {map.modifiers.length ? (
            <ul className="map-modifiers" aria-label="Map modifiers">
              {map.modifiers.map((x) => (
                <li key={x.id}>
                  {MODIFIER_ICONS[x.id] ?? '✦'} {x.label}
                </li>
              ))}
            </ul>
          ) : (
            M.noModifiers
          )}
        </dd>
        <dt>{M.boss}</dt>
        <dd className="map-boss">
          <BossPortrait bossId={map.bossId} locked={!unlocked} size="bossPanel" />
          <span>♚ {unlocked ? map.bossName : M.bossHidden}</span>
        </dd>
        {/* Task 43: the boss's Legendary pool (other classes' weapons dimmed). */}
        <dt>Legendaries</dt>
        <dd className="map-legendaries" aria-label="Legendary pool">
          {legendaryPool(map.id).map((l) => (
            <span
              key={l.id}
              className={`map-legendary ${l.slot === 'weapon' && l.characterClass !== cls ? 'is-other' : ''}`}
              title={LEGENDARY_TEXT[l.id]}
            >
              {l.name}
            </span>
          ))}
          <small> · boss item {legendaryChance(tier)}% chance</small>
        </dd>
        <dt>{M.best}</dt>
        <dd>
          {best
            ? `victories ${best.victories}${
                best.bestClearTime !== null ? ` · best clear ${clock(best.bestClearTime)}` : ''
              } · survived ${clock(best.bestSurvivalTime)} · ${best.bestKills} defeated`
            : M.notDone}
        </dd>
      </dl>
      <Button
        variant="primary"
        size="l"
        className="map-fight"
        aria-label={M.fightLabel(map.id)}
        disabledReason={locked}
        onClick={() => campaignStore.startRun(map.id, undefined, undefined, tier)}
      >
        ⚔ {M.fight}
      </Button>
    </Panel>
  );
}
