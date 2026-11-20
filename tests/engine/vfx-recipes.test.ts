import { describe, expect, it } from 'vitest';
import { CHARACTER_CLASSES } from '../../src/character-stats';
import { VFX_ELEMENTS } from '../../src/engine/vfx/palette';
import {
  BASIC_VFX,
  OFFHAND_WEAPON_ID,
  SECONDARY_VFX,
  SKILL_VFX,
  SYNERGY_VFX,
  recipeFor,
} from '../../src/engine/vfx/recipes';
import type { VfxRecipe } from '../../src/engine/vfx/recipes';
import { VFX_TEXTURE_KEYS } from '../../src/engine/vfx/textures';
import { SKILL_CATALOG, SYNERGY_RULES } from '../../src/skills';
import { OFFHAND_WEAPON } from '../../src/talents';

/** Task 33 step 2: one recipe table covers every skill, synergy, class and secondary attack. */
const textures = (r: VfxRecipe) =>
  [
    r.trail?.tex,
    r.impact?.spark,
    r.impact?.shards?.tex,
    r.area?.decal,
    r.area?.plume?.tex,
    r.zone?.decal,
    r.zone?.plume.tex,
  ].filter((t): t is string => !!t);
const visible = (r: VfxRecipe) => !!(r.cast || r.trail || r.impact || r.area || r.zone);

describe('Task 33 — VFX recipe table', () => {
  it('covers every catalogue skill id exactly (37), and every synergy id (12)', () => {
    expect(Object.keys(SKILL_VFX).sort()).toEqual(SKILL_CATALOG.map((d) => d.id).sort());
    expect(Object.keys(SKILL_VFX)).toHaveLength(37);
    expect(Object.keys(SYNERGY_VFX).sort()).toEqual(SYNERGY_RULES.map((r) => r.id).sort());
  });
  it('every active skill and synergy is visible; passives are marked passive', () => {
    for (const d of SKILL_CATALOG) {
      const r = SKILL_VFX[d.id];
      if (d.kind === 'passive') expect(r.passive, d.id).toBe(true);
      else expect(visible(r), d.id).toBe(true);
    }
    for (const [id, r] of Object.entries(SYNERGY_VFX)) expect(visible(r), id).toBe(true);
  });
  it('skills with zones / projectiles have zone / trail parts', () => {
    for (const d of SKILL_CATALOG) {
      if (d.tags.includes('zone')) expect(SKILL_VFX[d.id].zone, d.id).toBeDefined();
      if (d.tags.includes('projectile') && d.kind !== 'passive' && d.targeting !== 'cluster')
        expect(SKILL_VFX[d.id].trail ?? SKILL_VFX[d.id].impact, d.id).toBeDefined();
    }
  });
  it('only known elements and VFX textures; basic attacks for every class', () => {
    const all = [
      ...Object.values(SKILL_VFX),
      ...Object.values(SYNERGY_VFX),
      ...Object.values(BASIC_VFX),
      ...Object.values(SECONDARY_VFX),
    ];
    for (const r of all) {
      expect(VFX_ELEMENTS).toContain(r.element);
      for (const t of textures(r)) expect(VFX_TEXTURE_KEYS).toContain(t);
    }
    expect(Object.keys(BASIC_VFX).sort()).toEqual([...CHARACTER_CLASSES].sort());
    expect(BASIC_VFX.archer.trail?.tex).toBe('vfx_arrow_trail');
    expect(BASIC_VFX.mage.trail?.sparks).toBe(true);
    expect(BASIC_VFX.warrior.cast?.kind).toBe('slash');
  });
  it('routes sources: skills, synergies, talents, pets, off-hand, basic attacks', () => {
    expect(recipeFor('skill:fireball', 'mage')).toBe(SKILL_VFX.fireball);
    expect(recipeFor('skill:inferno#3', 'mage')).toBe(SKILL_VFX.inferno);
    expect(recipeFor('synergy:wildfire', 'mage')).toBe(SYNERGY_VFX.wildfire);
    expect(recipeFor('talent:rogue.b2.n03', 'rogue')).toBe(SECONDARY_VFX.shadow_copy);
    expect(recipeFor('talent:archer.b3.n01', 'archer')).toBe(SECONDARY_VFX.ballista);
    expect(recipeFor('talent:warrior.b1.n02', 'warrior')).toBe(SECONDARY_VFX.talent);
    expect(recipeFor('pet.fox', 'rogue')).toBe(SECONDARY_VFX.pet);
    expect(OFFHAND_WEAPON_ID).toBe(OFFHAND_WEAPON.id);
    expect(recipeFor(OFFHAND_WEAPON_ID, 'warrior')).toBe(SECONDARY_VFX.offhand);
    expect(recipeFor('starter_bow', 'archer')).toBe(BASIC_VFX.archer);
    // Unknown ids still draw something (the basic attack), never nothing.
    expect(recipeFor('skill:no_such', 'mage')).toBe(BASIC_VFX.mage);
    expect(recipeFor('synergy:no_such', 'rogue')).toBe(BASIC_VFX.rogue);
  });
  it('secondary attacks (talents, pets) are light', () => {
    for (const [id, r] of Object.entries(SECONDARY_VFX)) expect(r.light, id).toBe(true);
  });
});
