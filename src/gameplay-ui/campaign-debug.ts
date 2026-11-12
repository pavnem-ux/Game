import type { CharacterClass } from '../character-stats';
import { CAMPAIGN_MAPS } from '../campaign';
import {
  BACKUP_KEY,
  MAX_IMPORT_BYTES,
  QUARANTINE_KEY,
  SAVE_KEY,
  createSaveStore,
} from '../persistence';
import { REPORT_FORMAT } from './bug-report';
import { MAX_UI_SEED } from '../gameplay';
import { MAX_CLASS_LEVEL, NEW_CLASS_PROGRESS, addClassXp, createProfile } from '../profile';
import { TALENT_CONFIG, TALENT_RULES, superpowerActive, validateTalentRanks } from '../talents';
import type { TalentRanks } from '../talents';
import type { PlayerProfile } from '../profile';
import { campaignStore } from './campaign-state';
import { GEAR_SLOTS, SHOP_ITEMS, isEligible } from '../equipment';
import { PET_IDS } from '../pets';
import type { GearSlot, Loadout } from '../equipment';
/** Task 19: magic templates of the new slots for the Mage's best-gear debug loadout. */
const MAGE_GEAR: Partial<Record<GearSlot, string>> = {
  helmet: 'mage_circlet',
  gloves: 'sorcerer_gloves',
  pants: 'mystic_trousers',
};

/**
 * Task 08 profile debug tools. Imported only by the DEV/QA DeveloperPanel (lazy, gated), so none
 * of this is reachable in production. Every change goes through the validated save path
 * (`replaceProfile`), so a debug edit can never write an invalid profile.
 */
/** Class progress at exactly `level` (start of the level) with the given talents. */
function progressAt(level: number, talents: TalentRanks) {
  const toReach = Array.from({ length: level - 1 }, (_, i) => 100 + 50 * i).reduce(
    (a, b) => a + b,
    0,
  );
  return { ...addClassXp(NEW_CLASS_PROGRESS, toReach).progress, talents };
}
/** Smallest level ≥ `from` at which `ranks` is a valid tree (points + gate); null if none. */
function minimumLevel(characterClass: CharacterClass, from: number, ranks: TalentRanks) {
  for (let level = from; level <= MAX_CLASS_LEVEL; level++)
    if (validateTalentRanks(characterClass, level, ranks).ok) return level;
  return null;
}
function edit(change: (p: PlayerProfile) => PlayerProfile): boolean {
  const profile = campaignStore.getSnapshot().progression.profile;
  if (!profile) return false;
  return campaignStore.service().replaceProfile(change(profile)).ok;
}
/**
 * Task 08.5 §3.4: extracts the embedded save from a «Сообщить о проблеме» report. Only the
 * report envelope is checked here; the save itself then goes through the normal import
 * validation (`prepareImport` via `campaignStore.stageImport`) and its confirmation.
 */
export function saveFromReport(
  text: string,
): { ok: true; saveJson: string } | { ok: false; reason: string } {
  if (typeof text !== 'string' || text.length > MAX_IMPORT_BYTES)
    return { ok: false, reason: 'Файл слишком большой или пустой.' };
  let report: unknown;
  try {
    report = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'Файл не является JSON.' };
  }
  const r = report as { format?: unknown; save?: { ok?: unknown; profile?: unknown } } | null;
  if (!r || typeof r !== 'object' || r.format !== REPORT_FORMAT)
    return { ok: false, reason: 'Это не файл отчёта (skazki-report).' };
  if (!r.save || r.save.ok !== true || !r.save.profile || typeof r.save.profile !== 'object')
    return { ok: false, reason: 'В отчёте нет корректного сохранения.' };
  return { ok: true, saveJson: JSON.stringify(r.save.profile) };
}
export const campaignDebug = {
  unlockMaps(upTo = CAMPAIGN_MAPS.length) {
    return edit((p) => ({
      ...p,
      highestUnlockedMap: Math.max(p.highestUnlockedMap, Math.min(CAMPAIGN_MAPS.length, upTo)),
    }));
  },
  /**
   * Task 10 §1.5: jump to any map — unlocks maps up to it (same profile edit as «Открыть все
   * карты», never locks anything) and starts a normal campaign run there.
   */
  jumpToMap(mapId: number): boolean {
    if (!Number.isInteger(mapId) || mapId < 1 || mapId > CAMPAIGN_MAPS.length) return false;
    if (!this.unlockMaps(mapId)) return false;
    campaignStore.selectMap(mapId);
    return campaignStore.startRun(mapId);
  },
  /**
   * Sets the permanent class level (= grants/removes talent points, Task 09 §1.6). The tree is
   * kept while it stays valid; if the new level cannot hold it (points or the level-30 gate),
   * the class tree is reset. Returns whether the tree had to be reset (null = refused).
   */
  setClassLevel(characterClass: CharacterClass, level: number): { talentsReset: boolean } | null {
    const profile = campaignStore.getSnapshot().progression.profile;
    if (!profile || !Number.isInteger(level) || level < 1 || level > MAX_CLASS_LEVEL) return null;
    const kept = validateTalentRanks(
      characterClass,
      level,
      profile.classes[characterClass].talents,
    );
    const talents = kept.ok ? kept.ranks : {};
    const ok = edit((p) => ({
      ...p,
      classes: {
        ...p.classes,
        [characterClass]: { ...p.classes[characterClass], ...progressAt(level, talents) },
      },
    }));
    return ok ? { talentsReset: !kept.ok } : null;
  },
  /**
   * Task 09 §1.6: sets any node to rank 0–3. Missing prerequisites are filled to rank II, later
   * nodes that would lose their prerequisite are cleared, and the class level is raised only if
   * the tree needs more points or the level-30 gate. Everything is re-validated on save.
   */
  setTalentRank(characterClass: CharacterClass, nodeId: string, rank: number): boolean {
    const profile = campaignStore.getSnapshot().progression.profile;
    const node = TALENT_CONFIG.nodes.get(nodeId);
    if (!profile || !node || node.characterClass !== characterClass) return false;
    if (!Number.isInteger(rank) || rank < 0 || rank > TALENT_RULES.maxRank) return false;
    const progress = profile.classes[characterClass];
    const ranks: Record<string, number> = { ...progress.talents };
    const branch = TALENT_CONFIG.branchesOf(characterClass)[node.branch - 1];
    if (rank > 0) {
      ranks[nodeId] = rank;
      for (const n of branch.nodes)
        if (n.order < node.order)
          ranks[n.id] = Math.max(ranks[n.id] ?? 0, TALENT_RULES.prerequisiteRank);
    } else delete ranks[nodeId];
    if (rank < TALENT_RULES.prerequisiteRank)
      for (const n of branch.nodes) if (n.order > node.order) delete ranks[n.id];
    const level = minimumLevel(characterClass, progress.level, ranks);
    if (level === null) return false;
    return edit((p) => ({
      ...p,
      classes: {
        ...p.classes,
        [characterClass]:
          level === progress.level
            ? { ...progress, talents: ranks }
            : { ...progress, ...progressAt(level, ranks) },
      },
    }));
  },
  /** Task 11 §1.7: owns every shop item (no Gold spent; validated save). */
  unlockAllItems(): boolean {
    return edit((p) => ({ ...p, ownedItems: SHOP_ITEMS.map((i) => i.id) }));
  },
  /**
   * Task 11 §1.7: owns everything and equips the best tier for a class — its first weapon
   * template and the first template of every other slot (magic amulet / helmet / gloves / pants
   * for the Mage), tier 5.
   */
  equipBestTier(characterClass: CharacterClass): boolean {
    const best = (slot: GearSlot) => {
      const pool = SHOP_ITEMS.filter((i) => i.tier === 5 && isEligible(i, characterClass, slot));
      if (slot === 'amulet')
        return pool.find((i) =>
          characterClass === 'mage'
            ? i.templateId === 'amulet_magic'
            : i.templateId === 'amulet_power',
        )!;
      // Task 19: the Mage gets the magic helmet / gloves / pants; the others the first template.
      const magic = MAGE_GEAR[slot];
      if (characterClass === 'mage' && magic) return pool.find((i) => i.templateId === magic)!;
      return pool[0];
    };
    return edit((p) => ({
      ...p,
      ownedItems: SHOP_ITEMS.map((i) => i.id),
      classes: {
        ...p.classes,
        [characterClass]: {
          ...p.classes[characterClass],
          loadout: Object.fromEntries(GEAR_SLOTS.map((s) => [s, best(s).id])) as Loadout,
        },
      },
    }));
  },
  /** Task 09 §1.6: clears one class tree (debug only; players have no respec). */
  resetTalents(characterClass: CharacterClass): boolean {
    return edit((p) => ({
      ...p,
      classes: { ...p.classes, [characterClass]: { ...p.classes[characterClass], talents: {} } },
    }));
  },
  /**
   * Task 09 §1.6 superpower test preset: on = class level ≥ 30 + rank I of the branch-3 first node
   * (the activation rule); off = branch 3 cleared. Returns the new state (null = refused).
   */
  toggleSuperpowerPreset(characterClass: CharacterClass): boolean | null {
    const profile = campaignStore.getSnapshot().progression.profile;
    if (!profile) return null;
    const first = `${characterClass}.b${TALENT_RULES.superpowerBranch}.n01`;
    if (superpowerActive(characterClass, profile.classes[characterClass].talents))
      return campaignDebug.setTalentRank(characterClass, first, 0) ? false : null;
    return campaignDebug.setTalentRank(characterClass, first, 1) ? true : null;
  },
  grantXp(characterClass: CharacterClass, amount: number) {
    return edit((p) => ({
      ...p,
      classes: {
        ...p.classes,
        [characterClass]: addClassXp(p.classes[characterClass], amount).progress,
      },
    }));
  },
  grantGold(amount: number) {
    return edit((p) => ({ ...p, gold: p.gold + amount }));
  },
  /** Task 20 §1.5: owns every pet, quest pets included (no Gold spent; validated save). */
  unlockAllPets() {
    return edit((p) => ({ ...p, ownedPets: [...PET_IDS] }));
  },
  /** Task 20 §1.5: sets a pet's level 1–5 (the pet becomes owned; nothing spent). */
  setPetLevel(petId: string, level: number) {
    return edit((p) => {
      const levels: Record<string, number> = { ...p.petLevels, [petId]: level };
      if (level === 1) delete levels[petId];
      return {
        ...p,
        ownedPets: p.ownedPets.includes(petId) ? p.ownedPets : [...p.ownedPets, petId],
        petLevels: levels,
      };
    });
  },
  /** Task 19 §1.5: adds ore (validated save). */
  grantOre(amount: number) {
    return edit((p) => ({ ...p, ore: p.ore + amount }));
  },
  /**
   * Task 19 §1.5: sets an item's forge level 0–10 (the item becomes owned; no Gold/ore spent). The
   * validated save rejects starter weapons, unknown ids and levels outside 0–10.
   */
  setItemLevel(itemId: string, level: number) {
    return edit((p) => {
      const levels: Record<string, number> = { ...p.itemLevels, [itemId]: level };
      if (level === 0) delete levels[itemId];
      return {
        ...p,
        ownedItems: p.ownedItems.includes(itemId) ? p.ownedItems : [...p.ownedItems, itemId],
        itemLevels: levels,
      };
    });
  },
  /** Removes the profile, backup and quarantine, then starts a fresh test profile. */
  resetProgress() {
    createSaveStore().clearForDev();
    const now = new Date().toISOString();
    return campaignStore.service().replaceProfile(createProfile(`dev-${Date.now()}`, now)).ok;
  },
  /**
   * Task 08.5 §3.4: load a report → stage its save through the normal validated import. Nothing
   * is replaced until the player confirms on the Settings page (same flow as a save file).
   */
  stageReport(text: string, fileName: string): boolean {
    const extracted = saveFromReport(text);
    campaignStore.setPage('settings');
    if (!extracted.ok) {
      campaignStore.stageImport('', fileName); // shows the standard "not imported" message
      return false;
    }
    campaignStore.stageImport(extracted.saveJson, fileName);
    return campaignStore.getSnapshot().pendingImport !== null;
  },
  /**
   * Task 08.5 §4.2: start the selected map with a given seed (replays a reported run: same seed
   * + same inputs → same spawns and level-up cards). Returns false for an invalid seed.
   */
  startWithSeed(text: string): boolean {
    if (!/^\d{1,10}$/.test(text)) return false;
    const seed = Number(text);
    if (seed > MAX_UI_SEED) return false;
    const ui = campaignStore.getSnapshot();
    return campaignStore.startRun(ui.selectedMapId, undefined, seed);
  },
  /** Read-only view of the stored keys (inspection only). */
  inspectSave(): string {
    try {
      const read = (k: string) => localStorage.getItem(k);
      const main = read(SAVE_KEY);
      return [
        `${SAVE_KEY}: ${main ? `${main.length} B` : '—'}`,
        `${BACKUP_KEY}: ${read(BACKUP_KEY) ? 'есть' : '—'}`,
        `${QUARANTINE_KEY}: ${read(QUARANTINE_KEY) ? 'есть' : '—'}`,
        '',
        main ? JSON.stringify(JSON.parse(main), null, 2) : '',
      ].join('\n');
    } catch {
      return 'Хранилище недоступно.';
    }
  },
};
