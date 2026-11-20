/**
 * Task 33: the element palette of every attack / skill effect (one table, provisional). VFX textures
 * are white; a baked tint (Canvas ignores `setTint`) gives each element its colour. `core` is the
 * bright centre used for flashes and crits, `color` the main tint.
 */
export type VfxElement = 'physical' | 'fire' | 'ice' | 'poison' | 'bleed' | 'lightning' | 'arcane';
export const VFX_ELEMENTS: readonly VfxElement[] = Object.freeze([
  'physical',
  'fire',
  'ice',
  'poison',
  'bleed',
  'lightning',
  'arcane',
]);
export interface ElementColors {
  readonly color: number;
  readonly core: number;
}
export const ELEMENT_PALETTE: Readonly<Record<VfxElement, ElementColors>> = Object.freeze({
  physical: Object.freeze({ color: 0xd8dee8, core: 0xffffff }),
  fire: Object.freeze({ color: 0xff8a2a, core: 0xffd27a }),
  ice: Object.freeze({ color: 0x8fd8ff, core: 0xe6f8ff }),
  poison: Object.freeze({ color: 0x7ee05a, core: 0xd4ffb0 }),
  bleed: Object.freeze({ color: 0xd8203a, core: 0xff8a96 }),
  lightning: Object.freeze({ color: 0xb08cff, core: 0xeee2ff }),
  arcane: Object.freeze({ color: 0xffcf5a, core: 0xfff1c4 }),
});
