import { useEffect, useSyncExternalStore } from 'react';
import { campaignStore } from './campaign-state';
import type { MenuPage } from './campaign-state';
import { ProgressionPage } from './CampaignPages';
import { SaveWarning, SettingsPage } from './SaveManagement';
import { BuildLabel } from './BuildLabel';
import { ShopPage } from './ShopPages';
import { Backdrop, BackgroundArt, CurrencyBadge, OreBadge } from './kit';
import { EN } from './strings-en';
import { HubPage } from './meta/Hub';
import { CharacterSelectPage } from './meta/CharacterSelect';
import { EquipmentPage } from './meta/EquipmentScreen';
import { TalentsPage } from './meta/TalentsScreen';
import { MapPathPage } from './meta/MapPath';
import { ForgePage } from './meta/ForgeScreen';
import { PetsPage } from './meta/PetsScreen';
import { QuestsPage } from './meta/QuestsScreen';
import './meta/meta.css';

const N = EN.meta.nav;
/** Act backdrop of the map path (the act of the selected map). */
const ACT_OF_PAGE = (page: MenuPage, act: number) => (page === 'maps' ? act : undefined);

/**
 * Task 13 meta shell: night backdrop, title bar (title → hub, Gold / Ore), the current page.
 * Task 45: no top navigation — the hub tiles open the sections and every page has «← Home».
 * Esc goes back to the hub (a modal handles its own Esc first; nothing happens while one is open). Reads state; store actions only.
 */
export function CampaignMenu() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile;
  useEffect(() => {
    if (ui.page === 'hub') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('.kit-modal, .developer-panel, [role="dialog"]')) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      campaignStore.setPage('hub');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ui.page]);
  return (
    <section
      className={`overlay campaign-menu meta-ui meta-page-${ui.page}`}
      aria-labelledby="alpha-title"
    >
      <Backdrop act={ACT_OF_PAGE(ui.page, Math.ceil(ui.selectedMapId / 10))} />
      {/* Task 31: the menu background behind the hub (lazy: only while the hub is open). */}
      {ui.page === 'hub' && <BackgroundArt which="menu" className="meta-art-bg" />}
      <header className="meta-topbar">
        <button
          className="meta-brand"
          onClick={() => campaignStore.setPage('hub')}
          aria-label={`${EN.meta.title} — ${N.hub}`}
        >
          <span aria-hidden="true">✦</span> {EN.meta.title}
        </button>
        <span className="meta-push" />
        <span className="meta-currencies">
          <CurrencyBadge amount={profile?.gold ?? 0} />
          <OreBadge amount={profile?.ore ?? 0} />
        </span>
      </header>
      <SaveWarning />
      <div className="meta-content" key={ui.page}>
        {ui.page === 'hub' && <HubPage />}
        {ui.page === 'character' && <CharacterSelectPage />}
        {ui.page === 'equipment' && <EquipmentPage />}
        {ui.page === 'talents' && <TalentsPage />}
        {ui.page === 'maps' && <MapPathPage />}
        {ui.page === 'shop' && <ShopPage />}
        {ui.page === 'forge' && <ForgePage />}
        {ui.page === 'pets' && <PetsPage />}
        {ui.page === 'quests' && <QuestsPage />}
        {ui.page === 'progression' && <ProgressionPage />}
        {ui.page === 'settings' && <SettingsPage />}
      </div>
      <BuildLabel className="menu-build-label" />
    </section>
  );
}
