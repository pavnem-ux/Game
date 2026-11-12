import { useState, useSyncExternalStore } from 'react';
import { uiSound } from '../sound';
import { PET_CONFIG, PET_IDS, PET_LEVEL_RULES, petLevel } from '../../pets';
import type { PetId } from '../../pets';
import { campaignStore } from '../campaign-state';
import { Button, Panel } from '../kit';
import { RU } from '../strings-ru';
import { PetPortrait } from '../pets/PetPortrait';
import { petEffectLines, petLevelLabel, petSourceLabel } from '../pets/pet-text';

const P = RU.meta.pets;

/**
 * Task 20 «Питомцы»: every pet as a card (portrait, level, effect now and at the next level).
 * Owned pets can be made the profile's one active pet (shared by every class) or left at home;
 * pets not owned show where they come from (shop price or «Награда за задание»).
 */
export function PetsPage() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile;
  const [message, setMessage] = useState('');
  if (!profile) return <p className="campaign-empty">Профиль недоступен.</p>;
  const activate = (id: PetId | null) => {
    const refused = campaignStore.setActivePet(id);
    if (refused) uiSound('ui-error');
    else uiSound('ui-click');
    setMessage(refused ? (P.refusals[refused] ?? P.failed) : '');
  };
  return (
    <div className="pets-screen">
      <header className="meta-page-head">
        <h2 className="meta-title">{P.title}</h2>
        {profile.activePet && (
          <Button variant="ghost" className="meta-push" onClick={() => activate(null)}>
            {P.none}
          </Button>
        )}
      </header>
      <p className="meta-note">{P.intro}</p>
      {message && (
        <p className="shop-message" role="status">
          {message}
        </p>
      )}
      <ul className="pet-grid" aria-label={P.title}>
        {PET_IDS.map((id) => {
          const owned = profile.ownedPets.includes(id);
          const active = profile.activePet === id;
          const level = petLevel(profile.petLevels, id);
          return (
            <li key={id}>
              <PetCard
                id={id}
                level={level}
                owned={owned}
                active={active}
                actions={
                  owned ? (
                    <>
                      {active ? (
                        <Button onClick={() => activate(null)}>{P.remove}</Button>
                      ) : (
                        <Button variant="primary" onClick={() => activate(id)}>
                          {P.choose}
                        </Button>
                      )}
                      {level < PET_LEVEL_RULES.maxLevel && (
                        <Button
                          variant="ghost"
                          onClick={() => campaignStore.openForge(`pet:${id}`)}
                        >
                          ⚒ {P.toForge}
                        </Button>
                      )}
                    </>
                  ) : PET_CONFIG[id].source.kind === 'shop' ? (
                    <Button variant="ghost" onClick={() => campaignStore.openShop('pets')}>
                      ⚖ {P.toShop}
                    </Button>
                  ) : null
                }
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One pet card: portrait, name, level, effect now and at the next level, source when locked. */
export function PetCard({
  id,
  level,
  owned,
  active = false,
  actions,
}: {
  id: PetId;
  level: number;
  owned: boolean;
  active?: boolean;
  actions?: React.ReactNode;
}) {
  const pet = PET_CONFIG[id];
  const next = level < PET_LEVEL_RULES.maxLevel ? level + 1 : null;
  return (
    <Panel
      className={`pet-card ${owned ? 'owned' : 'locked'} ${active ? 'active' : ''}`}
      role="group"
      aria-label={`${pet.name}${active ? `, ${P.active.toLowerCase()}` : ''}`}
    >
      <div className="pet-card-head">
        <PetPortrait id={id} size={72} animated={active} />
        <div>
          <strong className="pet-name">{pet.name}</strong>
          <small className="pet-role">{pet.role}</small>
          <small className="pet-level">{owned ? petLevelLabel(level) : P.locked}</small>
          {active && <span className="item-stamp">{P.active}</span>}
        </div>
      </div>
      <div className="pet-effects">
        <small>{P.now}</small>
        <ul>
          {petEffectLines(id, owned ? level : 1).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {owned && next && (
          <>
            <small>{P.next(next)}</small>
            <ul className="pet-next">
              {petEffectLines(id, next).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </>
        )}
        {owned && !next && <small className="forge-maxed">{P.maxed}</small>}
        {!owned && <p className="pet-source">{petSourceLabel(id)}</p>}
      </div>
      {actions && <div className="pet-actions">{actions}</div>}
    </Panel>
  );
}
