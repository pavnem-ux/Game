import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseArtManifest } from '../../src/engine/visuals/art-manifest';
import {
  SKILL_ICON_SIZES,
  SkillIcon,
  SkillIconView,
  cooldownLeftFraction,
  skillIconSizeVars,
  skillIconView,
} from '../../src/gameplay-ui/kit';
import { damageSourceSkill } from '../../src/gameplay-ui/strings-en';
import { SKILL_CATALOG, cardLevelRaises, cardSynergyHints, SYNERGY_RULES } from '../../src/skills';

/** Task 27 Phase 2: the skill icon component, its size config and the data the screens use. */
const manifest = parseArtManifest(readFileSync('public/assets/manifest.json', 'utf8'));
const base = import.meta.env.BASE_URL;

describe('Task 27 — skill icon view (art or glyph)', () => {
  it('every catalogue skill shows its pack icon once the manifest is loaded', () => {
    for (const d of SKILL_CATALOG)
      expect(skillIconView(manifest, d.id, d.icon)).toEqual({
        src: `${base}assets/icons/skills/${d.id}.webp`,
      });
  });
  it('falls back to the monochrome glyph: no manifest, unknown id, bonus card (no skill)', () => {
    expect(skillIconView(null, 'fireball', '✹')).toEqual({ glyph: '✹︎' });
    expect(skillIconView(manifest, 'no_such_skill', '✶')).toEqual({ glyph: '✶︎' });
    expect(skillIconView(manifest, null, '❤')).toEqual({ glyph: '❤︎' });
  });
  it('renders a decorative <img> at the configured size, without a frame element', () => {
    const html = renderToStaticMarkup(
      createElement(SkillIconView, { manifest, skillId: 'whirlwind', glyph: '◎', size: 'card' }),
    );
    // React 19 may emit a `<link rel="preload">` for the image first; the icon itself:
    expect(html.match(/<img[^>]*>/)?.[0]).toBe(
      `<img class="skill-icon skill-icon-card has-art" src="${base}assets/icons/skills/whirlwind.webp" alt="" aria-hidden="true" width="96" height="96" decoding="async" draggable="false"/>`,
    );
    expect(html).not.toMatch(/frame|border/);
    const glyph = renderToStaticMarkup(
      createElement(SkillIconView, {
        manifest: null,
        skillId: 'whirlwind',
        glyph: '◎',
        size: 'hud',
      }),
    );
    expect(glyph).toBe('<i class="skill-icon skill-icon-hud is-glyph" aria-hidden="true">◎︎</i>');
  });
  it('before the manifest arrives (server render) the glyph is shown', () => {
    expect(
      renderToStaticMarkup(
        createElement(SkillIcon, { skillId: 'fireball', glyph: '✹', size: 'list' }),
      ),
    ).toContain('is-glyph');
  });
});

describe('Task 27 — one size config', () => {
  it('card ~96, HUD ~44 (touch: the Task 16 44 px minimum), list ~32 px', () => {
    expect(SKILL_ICON_SIZES.card).toBe(96);
    expect(SKILL_ICON_SIZES.hud).toBe(44);
    expect(SKILL_ICON_SIZES.hudTouch).toBeGreaterThanOrEqual(44);
    expect(SKILL_ICON_SIZES.list).toBe(32);
    // The art is 128 px: no size is drawn larger than the source.
    for (const px of Object.values(SKILL_ICON_SIZES)) expect(px).toBeLessThanOrEqual(128);
  });
  it('is exposed to the stylesheet as --icon-<size> (Task 28: one config for every icon), and the CSS reads every size', () => {
    const vars = skillIconSizeVars();
    expect(vars['--icon-card']).toBe('96px');
    const css = readFileSync('src/gameplay-ui/alpha.css', 'utf8');
    for (const name of Object.keys(vars)) expect(css, name).toContain(`var(${name})`);
    // No pixel size for the icons is hard-coded in the stylesheet.
    expect(css).not.toMatch(/\.skill-icon[^{]*\{[^}]*width:\s*\d+px/);
  });
});

describe('Task 27 — HUD radial cooldown overlay', () => {
  it('is the share of the cooldown still left, clamped to 0–1', () => {
    expect(cooldownLeftFraction(0, 4)).toBe(0);
    expect(cooldownLeftFraction(4, 4)).toBe(1);
    expect(cooldownLeftFraction(1, 4)).toBe(0.25);
    expect(cooldownLeftFraction(5, 4)).toBe(1);
    // Unknown total: a full overlay rather than none.
    expect(cooldownLeftFraction(2, 0)).toBe(1);
  });
});

describe('Task 27 — data for icons next to synergies and damage sources', () => {
  it('«▲ Synergy II/III» names the pair that reaches the level', () => {
    const [a, b] = SYNERGY_RULES.find((r) => r.id === 'thermal_shock')!.unlockPairs[0];
    const raise = cardLevelRaises(
      'mage',
      new Map([
        [a, 3],
        [b, 2],
      ]),
      b,
    ).find((r) => r.synergy.id === 'thermal_shock')!;
    expect([...raise.pair].sort()).toEqual([a, b].sort());
  });
  it('an unlock hint lists the partner ids next to their names', () => {
    const [u] = cardSynergyHints('mage', ['fireball'], 'frost_nova').unlocks;
    expect(u.withSkills).toEqual(['Fireball']);
    expect(u.withSkillIds).toEqual(['fireball']);
  });
  it('only `skill:<catalogue id>` damage sources get a skill icon', () => {
    expect(damageSourceSkill('skill:cleave')).toEqual({ id: 'cleave', icon: expect.any(String) });
    expect(damageSourceSkill('skill:no_such_skill')).toBeNull();
    expect(damageSourceSkill('weapon:sword')).toBeNull();
    expect(damageSourceSkill('synergy:skull_crusher')).toBeNull();
    expect(damageSourceSkill('pet.wisp')).toBeNull();
  });
});
