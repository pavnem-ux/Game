import { useSyncExternalStore } from 'react';
import { CHARACTER_CLASSES } from '../../character-stats';
import type { CombatAttributes } from '../../character-stats';
import { CLASS_LABELS, WEAPON_LABELS } from '../../gameplay';
import { findItem, permanentStats } from '../../equipment';
import { xpToNextLevel } from '../../profile';
import { availableTalentPoints } from '../../talents';
import { campaignStore } from '../campaign-state';
import { displayHp } from '../format';
import { Button, ClassEmblem, ProgressBar } from '../kit';
import { RU } from '../strings-ru';

const C = RU.meta.character;
const S = RU.meta.stats;
/** Key stats shown as bars on the class cards (relative to the strongest class in that stat). */
const KEY_STATS: readonly (readonly [keyof CombatAttributes, string, (v: number) => string])[] = [
  ['maxHp', S.maxHp, (v) => String(displayHp(v, v).max)],
  ['physicalDamage', S.physicalDamage, (v) => String(Math.round(v))],
  ['magicalDamage', S.magicalDamage, (v) => String(Math.round(v))],
  ['attackSpeed', S.attackSpeed, (v) => String(Math.round(v))],
  ['criticalChance', S.criticalChance, (v) => `${Math.round(v)}%`],
  ['resistance', S.resistance, (v) => String(Math.round(v))],
];

/**
 * Task 13 §3 Character select: four large class cards (emblem, roles, level and XP, key stats as
 * bars with gear and talents applied, free talent points, equipped weapon). The selected card is
 * enlarged and glowing; quick links open Equipment / Talents for that class.
 */
export function CharacterSelectPage() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile;
  if (!profile) return <p className="campaign-empty">Профиль недоступен.</p>;
  const stats = Object.fromEntries(
    CHARACTER_CLASSES.map((c) => {
      const p = profile.classes[c];
      return [c, permanentStats(c, p.level, p.talents, p.loadout)];
    }),
  ) as Record<string, CombatAttributes>;
  const best = Object.fromEntries(
    KEY_STATS.map(([k]) => [k, Math.max(...CHARACTER_CLASSES.map((c) => stats[c][k]), 1)]),
  ) as Record<string, number>;
  return (
    <div className="character-select">
      <h2 className="meta-title">{C.title}</h2>
      <div className="character-grid">
        {CHARACTER_CLASSES.map((c) => {
          const p = profile.classes[c];
          const next = xpToNextLevel(p.level);
          const selected = profile.selectedClass === c;
          const weapon = findItem(p.loadout.weapon ?? '');
          const free = availableTalentPoints(p.level, p.talents);
          return (
            <article
              key={c}
              className={`character-card class-card-${c} ${selected ? 'selected' : ''}`}
              aria-label={C.cardLabel(CLASS_LABELS[c], p.level)}
            >
              <header className="character-card-head">
                <ClassEmblem characterClass={c} size={selected ? 76 : 60} glow={selected} />
                <div>
                  <strong className={`class-text-${c}`}>{CLASS_LABELS[c]}</strong>
                  <ul className="role-tags">
                    {C.roles[c].map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
                <span
                  className={`talent-badge ${free > 0 ? '' : 'empty'}`}
                  title={C.points(free)}
                  aria-label={C.points(free)}
                >
                  {free}
                </span>
              </header>
              <ProgressBar
                label={`Опыт класса ${CLASS_LABELS[c]}`}
                value={next === null ? 1 : p.xp}
                max={next ?? 1}
                showText={`${C.level(p.level)} · ${C.xp(p.xp, next)}`}
              />
              <dl className="stat-bars">
                {KEY_STATS.map(([k, label, show]) => (
                  <div key={k} className="stat-bar">
                    <dt>{label}</dt>
                    <dd>
                      <span className="stat-bar-track" aria-hidden="true">
                        <span style={{ width: `${(stats[c][k] / best[k]) * 100}%` }} />
                      </span>
                      <b>{show(stats[c][k])}</b>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="character-weapon">
                {C.weapon(weapon && !weapon.starter ? weapon.name : WEAPON_LABELS[c])}
              </p>
              <div className="character-actions">
                <Button
                  variant={selected ? 'primary' : 'secondary'}
                  aria-pressed={selected}
                  onClick={() => campaignStore.selectClass(c)}
                >
                  {selected ? C.selected : C.select}
                </Button>
                <Button
                  variant="ghost"
                  size="s"
                  aria-label={`${C.toEquipment}: ${CLASS_LABELS[c]}`}
                  onClick={() => campaignStore.openForClass('equipment', c)}
                >
                  ⛨ {C.toEquipment}
                </Button>
                <Button
                  variant="ghost"
                  size="s"
                  aria-label={`${C.toTalents}: ${CLASS_LABELS[c]}`}
                  onClick={() => campaignStore.openForClass('talents', c)}
                >
                  ❖ {C.toTalents}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
