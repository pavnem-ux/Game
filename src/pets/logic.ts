import { PET_CONFIG, PET_IDS, PET_LEVEL_RULES } from './config';
import type { PetDefinition, PetId } from './config';

/**
 * Task 20 pure pet ownership / level rules (no storage, no UI). Pets are account-wide unlocks;
 * exactly one active pet per profile (or none), shared by every class. Levels 1–5 (level 1 is not
 * stored). Every action returns a new frozen state or throws `PetError` (state unchanged).
 */
export type PetLevels = Readonly<Record<string, number>>;
export interface PetState {
  readonly gold: number;
  readonly ore: number;
  readonly ownedPets: readonly string[];
  readonly petLevels: PetLevels;
  readonly activePet: string | null;
}
export const isPetId = (id: unknown): id is PetId =>
  typeof id === 'string' && (PET_IDS as readonly string[]).includes(id);
export function getPet(id: string): PetDefinition {
  if (!isPetId(id)) throw new RangeError(`Unknown pet: ${id}.`);
  return PET_CONFIG[id];
}
export const petLevel = (levels: PetLevels | null | undefined, id: string): number =>
  levels?.[id] ?? 1;
/** Main-number factor of a level: 1 + 0.2 × (level − 1). */
export function petLevelFactor(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > PET_LEVEL_RULES.maxLevel)
    throw new RangeError(`Invalid pet level: ${level}.`);
  return 1 + PET_LEVEL_RULES.perLevel * (level - 1);
}
/** A pet's numbers at a level (main numbers scaled, 4 decimals; the rest as at level 1). */
export function petParams(id: PetId, level: number): Readonly<Record<string, number>> {
  const pet = PET_CONFIG[id];
  const k = petLevelFactor(level);
  const out: Record<string, number> = { ...pet.params };
  for (const key of pet.main) out[key] = Math.round(pet.params[key] * k * 1e4) / 1e4;
  return Object.freeze(out);
}
/** Gold and ore to go from `toLevel − 1` to `toLevel` (2…5). */
export function petUpgradeCost(toLevel: number): Readonly<{ gold: number; ore: number }> {
  if (!Number.isInteger(toLevel) || toLevel < 2 || toLevel > PET_LEVEL_RULES.maxLevel)
    throw new RangeError(`Invalid pet upgrade level: ${toLevel}.`);
  return Object.freeze({
    gold: PET_LEVEL_RULES.gold[toLevel - 2],
    ore: PET_LEVEL_RULES.ore[toLevel - 2],
  });
}

export type PetBlock = 'unknown' | 'quest' | 'owned' | 'not-owned' | 'max' | 'gold' | 'ore';
export class PetError extends Error {
  constructor(readonly reason: PetBlock) {
    super(`Pet action refused: ${reason}.`);
    this.name = 'PetError';
  }
}
type Check<T> = Readonly<{ ok: true } & T> | Readonly<{ ok: false; reason: PetBlock }>;
const no = (reason: PetBlock) => Object.freeze({ ok: false as const, reason });

/** Shop: quest-only pets are never sold. */
export function checkPetPurchase(
  state: PetState,
  id: string,
): Check<{ pet: PetDefinition; price: number }> {
  if (!isPetId(id)) return no('unknown');
  const pet = PET_CONFIG[id];
  if (pet.source.kind !== 'shop') return no('quest');
  if (state.ownedPets.includes(id)) return no('owned');
  if (state.gold < pet.source.price) return no('gold');
  return Object.freeze({ ok: true as const, pet, price: pet.source.price });
}
export function buyPet<S extends PetState>(state: S, id: string): S {
  const check = checkPetPurchase(state, id);
  if (!check.ok) throw new PetError(check.reason);
  return Object.freeze({
    ...state,
    gold: state.gold - check.price,
    ownedPets: Object.freeze([...state.ownedPets, id]),
  });
}
/** One active pet per profile (null = none); only an owned pet can be active. */
export function setActivePet<S extends PetState>(state: S, id: string | null): S {
  if (id !== null) {
    if (!isPetId(id)) throw new PetError('unknown');
    if (!state.ownedPets.includes(id)) throw new PetError('not-owned');
  }
  return Object.freeze({ ...state, activePet: id });
}
export function checkPetUpgrade(
  state: PetState,
  id: string,
): Check<{ pet: PetDefinition; toLevel: number; gold: number; ore: number }> {
  if (!isPetId(id)) return no('unknown');
  if (!state.ownedPets.includes(id)) return no('not-owned');
  const level = petLevel(state.petLevels, id);
  if (level >= PET_LEVEL_RULES.maxLevel) return no('max');
  const cost = petUpgradeCost(level + 1);
  if (state.gold < cost.gold) return no('gold');
  if (state.ore < cost.ore) return no('ore');
  return Object.freeze({ ok: true as const, pet: PET_CONFIG[id], toLevel: level + 1, ...cost });
}
/** Forge: Gold, ore and the new level in one new state (always succeeds when allowed). */
export function upgradePet<S extends PetState>(state: S, id: string): S {
  const check = checkPetUpgrade(state, id);
  if (!check.ok) throw new PetError(check.reason);
  return Object.freeze({
    ...state,
    gold: state.gold - check.gold,
    ore: state.ore - check.ore,
    petLevels: Object.freeze({ ...state.petLevels, [id]: check.toLevel }),
  });
}
/** Startup validation of the pet configuration. */
export function validatePetConfig(): void {
  const R = PET_LEVEL_RULES;
  if (R.gold.length !== R.maxLevel - 1 || R.ore.length !== R.maxLevel - 1)
    throw new Error('Pet upgrade cost tables must cover levels 2…max.');
  for (const id of PET_IDS) {
    const pet = PET_CONFIG[id];
    if (pet.id !== id || !pet.name.trim()) throw new Error(`Pet ${id} config invalid.`);
    if (pet.source.kind === 'shop' && !(Number.isInteger(pet.source.price) && pet.source.price > 0))
      throw new Error(`Pet ${id} price invalid.`);
    for (const v of Object.values(pet.params))
      if (!Number.isFinite(v) || v <= 0) throw new Error(`Pet ${id} number invalid.`);
    for (const k of pet.main) if (!(k in pet.params)) throw new Error(`Pet ${id} main key ${k}.`);
  }
}
validatePetConfig();
