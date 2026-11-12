import { buyPet, setActivePet, upgradePet } from '../pets';
import type { PetState } from '../pets';
import type { PlayerProfile } from './profile';

/**
 * Task 20 profile-level pet actions (pure). Each maps the profile onto the pet rules and back; the
 * caller saves the returned profile once (validated save = one atomic change). Throws PetError.
 */
const stateOf = (p: PlayerProfile): PetState => ({
  gold: p.gold,
  ore: p.ore,
  ownedPets: p.ownedPets,
  petLevels: p.petLevels,
  activePet: p.activePet,
});
function withState(p: PlayerProfile, s: PetState): PlayerProfile {
  return Object.freeze({
    ...p,
    gold: s.gold,
    ore: s.ore,
    ownedPets: s.ownedPets,
    petLevels: s.petLevels,
    activePet: s.activePet,
  });
}
/** Shop: Gold deducted and the pet owned. */
export const buyProfilePet = (p: PlayerProfile, id: string) => withState(p, buyPet(stateOf(p), id));
/** The one active pet of the profile (null = none). */
export const setProfileActivePet = (p: PlayerProfile, id: string | null) =>
  withState(p, setActivePet(stateOf(p), id));
/** Forge: Gold, ore and the pet level in one change. */
export const upgradeProfilePet = (p: PlayerProfile, id: string) =>
  withState(p, upgradePet(stateOf(p), id));
