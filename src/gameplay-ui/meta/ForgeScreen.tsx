import { useState, useSyncExternalStore } from 'react';
import { uiSound } from '../sound';
import { campaignStore } from '../campaign-state';
import { Button, CurrencyBadge, OreBadge, Panel } from '../kit';
import { EN } from '../strings-en';
import {
  PET_CONFIG,
  PET_LEVEL_RULES,
  checkPetUpgrade,
  isPetId,
  petLevel,
  petUpgradeCost,
} from '../../pets';
import { PetPortrait } from '../pets/PetPortrait';
import { petEffectLines, petLevelLabel } from '../pets/pet-text';
import { HomeButton } from './HomeButton';

const F = EN.meta.forge;

/**
 * Task 19 «Forge». Task 40 (items rework): item upgrades (+0…+10) are gone — the page keeps only the
 * pet upgrades (Task 20), until Task 41 brings slot upgrades. Store actions only.
 */
export function ForgePage() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile;
  if (!profile) return <p className="campaign-empty">Profile unavailable.</p>;
  return (
    <div className="forge-screen">
      <header className="meta-page-head">
        <HomeButton />
        <h2 className="meta-title">{F.title}</h2>
        <span className="forge-wallet">
          <CurrencyBadge amount={profile.gold} />
          <OreBadge amount={profile.ore} />
        </span>
      </header>
      <PetForge initial={ui.forgeItem?.startsWith('pet:') ? ui.forgeItem.slice(4) : null} />
    </div>
  );
}

/** Task 20: pet upgrades (Gold + Ore, one validated save). */
function PetForge({ initial }: { initial: string | null }) {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile!;
  const P = EN.meta.pets;
  const owned = profile.ownedPets.filter(isPetId);
  const [picked, setPicked] = useState<string | null>(initial);
  const [message, setMessage] = useState<Readonly<{ tone: 'ok' | 'error'; text: string }> | null>(
    null,
  );
  const selected = owned.find((id) => id === picked) ?? owned[0] ?? null;
  if (!selected) return <p className="meta-empty">{P.locked}: buy a pet in the shop.</p>;
  const level = petLevel(profile.petLevels, selected);
  const maxed = level >= PET_LEVEL_RULES.maxLevel;
  const cost = maxed ? null : petUpgradeCost(level + 1);
  const check = checkPetUpgrade(
    {
      gold: profile.gold,
      ore: profile.ore,
      ownedPets: profile.ownedPets,
      petLevels: profile.petLevels,
      activePet: profile.activePet,
    },
    selected,
  );
  const reason = check.ok ? null : (P.refusals[check.reason] ?? P.failed);
  const upgrade = () => {
    const refused = campaignStore.upgradePet(selected);
    uiSound(refused ? 'ui-error' : 'ui-confirm');
    setMessage(
      refused
        ? { tone: 'error', text: P.refusals[refused] ?? P.failed }
        : { tone: 'ok', text: P.upgraded(PET_CONFIG[selected].name, level + 1) },
    );
  };
  return (
    <section className="forge-layout pet-forge">
      <Panel title={P.title} className="forge-items">
        <ul className="owned-grid forge-grid">
          {owned.map((id) => (
            <li key={id}>
              <button
                className={`item-card forge-card pet-forge-card ${id === selected ? 'selected' : ''}`}
                aria-pressed={id === selected}
                onClick={() => {
                  setPicked(id);
                  setMessage(null);
                }}
              >
                <PetPortrait id={id} size={44} />
                <strong>{PET_CONFIG[id].name}</strong>
                <small className="item-tier">
                  {petLevelLabel(petLevel(profile.petLevels, id))}
                </small>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel
        className="forge-detail"
        role="group"
        aria-label="Pet upgrade"
        title={`${PET_CONFIG[selected].name} · ${petLevelLabel(level)}`}
      >
        <div className="forge-detail-body">
          <div className="pet-effects">
            <small>{P.now}</small>
            <ul>
              {petEffectLines(selected, level).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {!maxed && (
              <>
                <small>{P.next(level + 1)}</small>
                <ul className="pet-next">
                  {petEffectLines(selected, level + 1).map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          {cost ? (
            <div className="forge-cost">
              <span>{F.cost}</span>
              <span className={profile.gold < cost.gold ? 'short' : undefined}>
                <CurrencyBadge amount={cost.gold} size="s" />
              </span>
              <span className={profile.ore < cost.ore ? 'short' : undefined}>
                <OreBadge amount={cost.ore} size="s" />
              </span>
            </div>
          ) : (
            <p className="forge-maxed">{P.maxed}</p>
          )}
          <Button variant="primary" disabledReason={reason} onClick={upgrade}>
            ⚒ {maxed ? P.maxed : P.upgrade(level + 1)}
          </Button>
        </div>
        {message && (
          <p className={`shop-message forge-message forge-${message.tone}`} role="status">
            {message.text}
          </p>
        )}
      </Panel>
    </section>
  );
}
