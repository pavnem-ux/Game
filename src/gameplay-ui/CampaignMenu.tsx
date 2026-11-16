import { useEffect, useRef, useSyncExternalStore } from 'react';
import { campaignStore } from './campaign-state';
import type { MenuPage } from './campaign-state';
import { ProgressionPage } from './CampaignPages';
import { SaveWarning, SettingsPage } from './SaveManagement';
import { BuildLabel } from './BuildLabel';
import { ShopPage } from './ShopPages';
import { Backdrop, CurrencyBadge, OreBadge } from './kit';
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
const PAGES: readonly { id: MenuPage; label: string }[] = [
  { id: 'hub', label: N.hub },
  { id: 'character', label: N.character },
  { id: 'equipment', label: N.equipment },
  { id: 'talents', label: N.talents },
  { id: 'shop', label: N.shop },
  { id: 'forge', label: N.forge },
  { id: 'maps', label: N.maps },
  { id: 'progression', label: N.progression },
  { id: 'settings', label: N.settings },
];
/** Act backdrop of the map path (the act of the selected map). */
const ACT_OF_PAGE = (page: MenuPage, act: number) => (page === 'maps' ? act : undefined);

/**
 * Task 13 meta shell: night backdrop, title bar with navigation and Gold, the current page.
 * Esc goes back to the hub (a modal handles its own Esc first). Reads state; store actions only.
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
      e.preventDefault();
      campaignStore.setPage('hub');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ui.page]);
  // Task 16: on phones the nav is one scrolling row; keep the current page's item in view.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('.meta-nav-item.active');
    const nav = navRef.current;
    if (!active || !nav || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [ui.page]);
  return (
    <section
      className={`overlay campaign-menu meta-ui meta-page-${ui.page}`}
      aria-labelledby="alpha-title"
    >
      <Backdrop act={ACT_OF_PAGE(ui.page, Math.ceil(ui.selectedMapId / 10))} />
      <header className="meta-topbar">
        <button
          className="meta-brand"
          onClick={() => campaignStore.setPage('hub')}
          aria-label={`${EN.meta.title} — ${N.hub}`}
        >
          <span aria-hidden="true">✦</span> {EN.meta.title}
        </button>
        <nav className="meta-nav" aria-label={N.label} ref={navRef}>
          {PAGES.map((p) => (
            <button
              key={p.id}
              className={`meta-nav-item ${ui.page === p.id ? 'active' : ''}`}
              aria-current={ui.page === p.id ? 'page' : undefined}
              onClick={() => campaignStore.setPage(p.id)}
            >
              {p.label}
            </button>
          ))}
        </nav>
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
