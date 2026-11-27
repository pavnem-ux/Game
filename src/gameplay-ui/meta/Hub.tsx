import { useSyncExternalStore } from 'react';
import { CHARACTER_CLASSES } from '../../character-stats';
import { CAMPAIGN_MAPS } from '../../campaign';
import { CLASS_LABELS, WEAPON_LABELS } from '../../gameplay';
import { xpToNextLevel } from '../../profile';
import { campaignStore } from '../campaign-state';
import type { MenuPage } from '../campaign-state';
import { Button, ClassEmblem, ClassPortrait, Emblem, Panel, ProgressBar } from '../kit';
import { EN } from '../strings-en';
import { claimableQuests } from '../../quests';

const H = EN.meta.hub;
const N = EN.meta.nav;
/** Hub tiles: page, title, one-line description, glyph — the only way into the sections (Task 45). */
const TILES: readonly { id: MenuPage; title: string; text: string; glyph: string }[] = [
  { id: 'character', title: N.character, text: 'Choose your hero and see their power', glyph: '♜' },
  { id: 'equipment', title: N.equipment, text: 'Gear, slot upgrades, salvage', glyph: '⛨' },
  { id: 'talents', title: N.talents, text: 'Class talent branches', glyph: '❖' },
  { id: 'shop', title: N.shop, text: 'Gear for Gold', glyph: '⚖' },
  { id: 'forge', title: N.forge, text: 'Upgrade pets with Gold and Ore', glyph: '⚒' },
  { id: 'pets', title: N.pets, text: 'A companion on every run', glyph: '❦' },
  { id: 'quests', title: N.quests, text: 'Goals and rewards', glyph: '✧' },
  { id: 'maps', title: N.maps, text: 'Acts, maps and difficulty', glyph: '⚑' },
  { id: 'progression', title: N.progression, text: 'Chronicle of your runs', glyph: '☾' },
  { id: 'settings', title: N.settings, text: 'Saves and gameplay', glyph: '⚙' },
];

/** Task 13 §3 Hub: title, selected hero, Gold, «To battle» (opens the map path) and navigation. */
export function HubPage() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile;
  if (!profile) return <p className="campaign-empty">Profile unavailable.</p>;
  const cls = profile.selectedClass;
  // Task 21: number of quest rewards waiting (badge on the «Quests» tile).
  const claimable = claimableQuests(profile).length;
  const progress = profile.classes[cls];
  const next = xpToNextLevel(progress.level);
  const map = CAMPAIGN_MAPS[ui.selectedMapId - 1];
  return (
    <div className="hub">
      <div className="hub-hero">
        {/* Task 31: the emblem above the title (the title stays text in the serif font). */}
        <Emblem size="emblem" />
        <p className="meta-eyebrow">{EN.meta.subtitle}</p>
        <h1 id="alpha-title" className="hub-title">
          {EN.meta.title}
        </h1>
        <Panel className="hub-champion" aria-label={H.selected}>
          <ClassPortrait characterClass={cls} size={96} glow />
          <div className="hub-champion-body">
            <small className="meta-eyebrow">{H.selected}</small>
            <strong className={`hub-class class-text-${cls}`}>{CLASS_LABELS[cls]}</strong>
            <span className="hub-weapon">{WEAPON_LABELS[cls]}</span>
            <ProgressBar
              label={`Class XP: ${CLASS_LABELS[cls]}`}
              value={next === null ? 1 : progress.xp}
              max={next ?? 1}
              showText={`${H.level(progress.level)} · ${EN.meta.character.xp(progress.xp, next)}`}
            />
          </div>
        </Panel>
        {/* Quick hero switch (the full comparison is on «Hero»). */}
        <div className="hub-heroes" role="group" aria-label="Class selection">
          {CHARACTER_CLASSES.map((c) => (
            <button
              key={c}
              className={`hub-hero-pick ${c === cls ? 'selected' : ''}`}
              aria-pressed={c === cls}
              onClick={() => campaignStore.selectClass(c)}
            >
              <ClassEmblem characterClass={c} size={30} />
              <span>
                <strong>{CLASS_LABELS[c]}</strong> <small>{WEAPON_LABELS[c]}</small>
              </span>
              <small className="hub-hero-level">{profile.classes[c].level}</small>
            </button>
          ))}
        </div>
        <div className="hub-actions">
          <Button
            variant="primary"
            size="l"
            className="hub-fight"
            title={H.fightHint}
            onClick={() => campaignStore.setPage('maps')}
          >
            ⚔ {H.fight}
          </Button>
        </div>
        <p className="hub-campaign">
          {H.campaign(profile.completedMaps.length, CAMPAIGN_MAPS.length)} ·{' '}
          {H.next(map.id, map.name)}
        </p>
        <p className="hub-help">{H.controls}</p>
        <p className="hub-help faint">{H.forfeit}</p>
      </div>
      <nav className="hub-tiles" aria-label="Sections">
        {TILES.map((t) => (
          <button
            key={t.id}
            className="hub-tile"
            onClick={() => campaignStore.setPage(t.id)}
            aria-label={
              t.id === 'quests' && claimable > 0
                ? `${t.title}. ${EN.meta.quests.badge(claimable)}`
                : t.title
            }
          >
            {t.id === 'quests' && claimable > 0 && (
              <span className="hub-badge" aria-hidden="true">
                {claimable}
              </span>
            )}
            <span className="hub-tile-glyph" aria-hidden="true">
              {t.glyph}
            </span>
            <strong>{t.title}</strong>
            <small>{t.text}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}
