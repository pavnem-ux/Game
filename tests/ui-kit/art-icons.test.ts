import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorldEvent } from '../../src/gameplay';
import { parseArtManifest } from '../../src/engine/visuals/art-manifest';
import {
  ICON_SIZES,
  SKILL_ICON_SIZES,
  SynergyIcon,
  SynergyIconView,
  ItemIconView,
  TalentBranchIconView,
  iconSizeVars,
} from '../../src/gameplay-ui/kit';
import { bannerFor } from '../../src/gameplay-ui/SynergyBanners';
import { damageSourceSynergy } from '../../src/gameplay-ui/strings-en';
import { SYNERGY_RULES } from '../../src/skills';

/** Task 28 Phase 2–3: synergy icons and talent branch emblems in the UI (component level). */
const manifest = parseArtManifest(readFileSync('public/assets/manifest.json', 'utf8'));
const base = import.meta.env.BASE_URL;
const img = (html: string) => html.match(/<img[^>]*>/)?.[0] ?? null;

describe('Task 28 — one icon size config', () => {
  it('banner ~72, list ~32, card hint ~20, branch header ~96, talent node ~56 (touch ≥ 44)', () => {
    expect(ICON_SIZES.banner).toBe(72);
    expect(ICON_SIZES.list).toBe(32);
    expect(ICON_SIZES.pair).toBe(20);
    expect(ICON_SIZES.branch).toBe(96);
    expect(ICON_SIZES.talentNode).toBe(56);
    expect(ICON_SIZES.talentNodeTouch).toBeGreaterThanOrEqual(44);
    // Task 27's name is the same object (one config).
    expect(SKILL_ICON_SIZES).toBe(ICON_SIZES);
  });
  it('no size is drawn larger than its source art (synergy 128 px, emblems 192 px)', () => {
    for (const k of ['banner', 'bannerCompact', 'list', 'stats', 'pair'] as const)
      expect(ICON_SIZES[k], k).toBeLessThanOrEqual(128);
    for (const k of ['branch', 'branchCompact', 'talentNode', 'talentNodeTouch'] as const)
      expect(ICON_SIZES[k], k).toBeLessThanOrEqual(192);
  });
  it('every size reaches the stylesheet as --icon-<size>', () => {
    const css = readFileSync('src/gameplay-ui/alpha.css', 'utf8');
    for (const name of Object.keys(iconSizeVars())) expect(css, name).toContain(`var(${name})`);
  });
});

describe('Task 28 — synergy icon', () => {
  it('every synergy renders its pack icon at the configured size', () => {
    for (const r of SYNERGY_RULES) {
      const html = renderToStaticMarkup(
        createElement(SynergyIconView, { manifest, synergyId: r.id, size: 'list' }),
      );
      expect(img(html), r.id).toBe(
        `<img class="art-icon synergy-icon icon-list" src="${base}assets/icons/synergies/${r.id}.webp" alt="" aria-hidden="true" width="32" height="32" decoding="async" draggable="false"/>`,
      );
    }
  });
  it('level III gets the gold ring class (same icon, no extra art); I and II do not', () => {
    const at = (level: number) =>
      img(
        renderToStaticMarkup(
          createElement(SynergyIconView, {
            manifest,
            synergyId: 'wildfire',
            size: 'banner',
            level,
          }),
        ),
      )!;
    expect(at(3)).toContain('class="art-icon synergy-icon is-awakened icon-banner"');
    expect(at(3)).toContain('/icons/synergies/wildfire.webp');
    expect(at(2)).not.toContain('is-awakened');
    expect(at(1)).not.toContain('is-awakened');
  });
  it('falls back to nothing (the current text look): no manifest, unknown id, server render', () => {
    const none = (m: typeof manifest | null, id: string) =>
      renderToStaticMarkup(
        createElement(SynergyIconView, { manifest: m, synergyId: id, size: 'pair' }),
      );
    expect(none(null, 'wildfire')).toBe('');
    expect(none(manifest, 'no_such_synergy')).toBe('');
    const partial = new Map(manifest);
    partial.delete('synergy_wildfire');
    expect(none(partial, 'wildfire')).toBe('');
    expect(
      renderToStaticMarkup(createElement(SynergyIcon, { synergyId: 'wildfire', size: 'pair' })),
    ).toBe('');
  });
});

describe('Task 28 — banners and damage sources name their synergy', () => {
  const ev = (event: object) =>
    ({ sequence: 5, time: 1, channel: 'skill', event }) as unknown as WorldEvent;
  it('unlock / level II / awakening banners carry the synergy id (for the icon)', () => {
    expect(bannerFor(ev({ type: 'synergy-unlocked', synergyId: 'wildfire' }))?.synergyId).toBe(
      'wildfire',
    );
    expect(
      bannerFor(ev({ type: 'synergy-level-up', synergyId: 'final_cut', level: 2 }))?.synergyId,
    ).toBe('final_cut');
    const three = bannerFor(ev({ type: 'synergy-level-up', synergyId: 'final_cut', level: 3 }))!;
    expect([three.synergyId, three.level]).toEqual(['final_cut', 3]);
  });
  it('only `synergy:<known id>` damage sources get a synergy icon', () => {
    expect(damageSourceSynergy('synergy:seismic_impact')).toBe('seismic_impact');
    expect(damageSourceSynergy('synergy:no_such_synergy')).toBeNull();
    expect(damageSourceSynergy('skill:cleave')).toBeNull();
    expect(damageSourceSynergy('weapon:sword')).toBeNull();
  });
});

describe('Task 28 — talent branch emblem', () => {
  it('renders the emblem of a class / branch, or nothing without it', () => {
    const html = renderToStaticMarkup(
      createElement(TalentBranchIconView, {
        manifest,
        characterClass: 'warrior',
        branch: 3,
        size: 'branch',
      }),
    );
    expect(img(html)).toBe(
      `<img class="art-icon talent-branch-icon icon-branch" src="${base}assets/icons/talents/twin_blade_master.webp" alt="" aria-hidden="true" width="96" height="96" decoding="async" draggable="false"/>`,
    );
    expect(
      renderToStaticMarkup(
        createElement(TalentBranchIconView, {
          manifest: null,
          characterClass: 'warrior',
          branch: 3,
          size: 'branch',
        }),
      ),
    ).toBe('');
  });
});

describe('Task 30 — item icon', () => {
  it('template icon with the forge «+N» badge; nothing for an unknown template or no manifest', () => {
    const html = (templateId: string, level: number, m: typeof manifest | null = manifest) =>
      renderToStaticMarkup(
        createElement(ItemIconView, { manifest: m, templateId, size: 'itemCard', level }),
      );
    expect(html('heavy_sword', 3)).toContain('/assets/icons/items/heavy_sword.webp');
    expect(html('heavy_sword', 3)).toContain('<b class="item-upgrade-badge">+3</b>');
    expect(html('starter_staff', 0)).not.toContain('item-upgrade-badge');
    expect(html('no_such_template', 2)).toBe('');
    expect(html('heavy_sword', 2, null)).toBe('');
  });
});
