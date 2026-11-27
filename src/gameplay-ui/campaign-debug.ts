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
import {
  MAX_CLASS_LEVEL,
  NEW_CLASS_PROGRESS,
  addClassXp,
  createProfile,
  xpToNextLevel,
  grantItem,
  withProfileLoadoutCounter,
} from '../profile';
import { TALENT_CONFIG, TALENT_RULES, superpowerActive, validateTalentRanks } from '../talents';
import type { TalentRanks } from '../talents';
import type { PlayerProfile } from '../profile';
import { campaignStore } from './campaign-state';
import { BAG_RULES, GEAR_SLOTS, ITEM_LEVEL_RANGE, RARITIES, legendaryDef } from '../equipment';
import type { LegendaryId } from '../equipment';
import { PET_IDS } from '../pets';
import { NO_QUEST_COUNTERS, QUEST_BY_ID, SYNERGY_IDS } from '../quests';
import type { QuestCounters, QuestGoal } from '../quests';
import type { GearSlot, Loadout, Rarity } from '../equipment';

/**
 * Task 08 profile debug tools. Imported only by the DEV/QA DeveloperPanel (lazy, gated), so none
 * of this is reachable in production. Every change goes through the validated save path
 * (`replaceProfile`), so a debug edit can never write an invalid profile.
 */
/** Class progress at exactly `level` (start of the level) with the given talents. */
function progressAt(level: number, talents: TalentRanks) {
  // Task 40: the real curve (it changed to 100 + 6·L²), never a copy of it.
  const toReach = Array.from({ length: level - 1 }, (_, i) => xpToNextLevel(i + 1)!).reduce(
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
  // Task 21: debug gear edits keep the best tier-4+ loadout counter like real gear actions.
  return campaignStore.service().replaceProfile(withProfileLoadoutCounter(change(profile))).ok;
}
/**
 * Task 08.5 §3.4: extracts the embedded save from a «Report a problem» report. Only the
 * report envelope is checked here; the save itself then goes through the normal import
 * validation (`prepareImport` via `campaignStore.stageImport`) and its confirmation.
 */
export function saveFromReport(
  text: string,
): { ok: true; saveJson: string } | { ok: false; reason: string } {
  if (typeof text !== 'string' || text.length > MAX_IMPORT_BYTES)
    return { ok: false, reason: 'The file is too large or empty.' };
  let report: unknown;
  try {
    report = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'The file is not JSON.' };
  }
  const r = report as { format?: unknown; save?: { ok?: unknown; profile?: unknown } } | null;
  if (!r || typeof r !== 'object' || r.format !== REPORT_FORMAT)
    return { ok: false, reason: 'This is not a report file (skazki-report).' };
  if (!r.save || r.save.ok !== true || !r.save.profile || typeof r.save.profile !== 'object')
    return { ok: false, reason: 'The report contains no valid save.' };
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
   * Task 10 §1.5: jump to any map — unlocks maps up to it (same profile edit as «Unlock all
   * maps», never locks anything) and starts a normal campaign run there.
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
  /**
   * Task 40 DEV / QA hook: grants a random item of a slot, rarity and item level (seeded `items`
   * stream; Rare+ only come from drops in Task 42). Weapons are for `characterClass`.
   */
  grantItem(
    characterClass: CharacterClass,
    slot: GearSlot,
    rarity: Rarity,
    itemLevel: number,
  ): boolean {
    if (!RARITIES.includes(rarity) || !GEAR_SLOTS.includes(slot)) return false;
    if (
      !Number.isInteger(itemLevel) ||
      itemLevel < ITEM_LEVEL_RANGE.min ||
      itemLevel > ITEM_LEVEL_RANGE.max
    )
      return false;
    return edit((p) => grantItem(p, { slot, rarity, itemLevel, characterClass }));
  },
  /**
   * Task 40: grants a full Legendary set at the class's level and equips it (no Gold spent;
   * validated save) — the strongest gear a class can wear right now.
   */
  equipBestTier(characterClass: CharacterClass): boolean {
    return edit((p) => {
      let next = p;
      const loadout: Record<string, string | null> = {};
      const level = p.classes[characterClass].level;
      for (const slot of GEAR_SLOTS) {
        next = grantItem(next, { slot, rarity: 'legendary', itemLevel: level, characterClass });
        loadout[slot] = next.items[next.items.length - 1].uid;
      }
      return {
        ...next,
        classes: {
          ...next.classes,
          [characterClass]: { ...next.classes[characterClass], loadout: loadout as Loadout },
        },
      };
    });
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
  /**
   * Task 21 §1.6: completes a quest by raising its own source data through the validated save
   * (map won + next unlocked, class level, total kills, a counter, an item level or the tier
   * counter). Nothing is claimed. Returns false for an unknown quest or a refused save.
   */
  completeQuest(questId: string): boolean {
    const quest = QUEST_BY_ID.get(questId);
    if (!quest) return false;
    const g = quest.goal;
    return edit((p) => {
      const c = p.questCounters;
      switch (g.kind) {
        case 'map-win':
          return {
            ...p,
            completedMaps: [...new Set([...p.completedMaps, g.mapId])].sort((a, b) => a - b),
            highestUnlockedMap: Math.max(
              p.highestUnlockedMap,
              Math.min(CAMPAIGN_MAPS.length, g.mapId + 1),
            ),
          };
        case 'kills':
          return {
            ...p,
            stats: { ...p.stats, enemiesKilled: Math.max(p.stats.enemiesKilled, g.count) },
          };
        case 'class-level': {
          const cur = p.classes[g.characterClass];
          if (cur.level >= g.level) return p;
          return {
            ...p,
            classes: {
              ...p.classes,
              [g.characterClass]: {
                ...progressAt(g.level, cur.talents),
                loadout: cur.loadout,
                slotLevels: cur.slotLevels,
              },
            },
          };
        }
        // Task 41: raise the selected class's weapon slot to the goal level.
        case 'slot-level': {
          const cur = p.classes[p.selectedClass];
          const weapon = Math.max(cur.slotLevels.weapon, g.level);
          return {
            ...p,
            classes: {
              ...p.classes,
              [p.selectedClass]: { ...cur, slotLevels: { ...cur.slotLevels, weapon } },
            },
          };
        }
        default:
          return { ...p, questCounters: completeCounter(c, g) };
      }
    });
  },
  /** Task 21 §1.6: adds to a lifetime counter (`swift`/`brute`/`bombard`/`elite`/`chests`). */
  addQuestCounter(counter: 'swift' | 'brute' | 'bombard' | 'elite' | 'chests', amount: number) {
    if (!Number.isSafeInteger(amount) || amount < 0) return false;
    return edit((p) => {
      const c = p.questCounters;
      if (counter === 'elite')
        return { ...p, questCounters: { ...c, eliteKills: c.eliteKills + amount } };
      if (counter === 'chests')
        return { ...p, questCounters: { ...c, chestsOpened: c.chestsOpened + amount } };
      return {
        ...p,
        questCounters: {
          ...c,
          killsByType: { ...c.killsByType, [counter]: c.killsByType[counter] + amount },
        },
      };
    });
  },
  /** Task 21 §1.6: clears quest counters and claims (the rest of the profile stays). */
  resetQuests(): boolean {
    return edit((p) => ({ ...p, questCounters: NO_QUEST_COUNTERS, questsClaimed: [] }));
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
  /** Task 43: grant a Legendary (its unique effect) at an item level (validated save). */
  grantLegendary(characterClass: CharacterClass, id: LegendaryId, itemLevel: number): boolean {
    const def = legendaryDef(id);
    if (!def || !Number.isInteger(itemLevel) || itemLevel < 1 || itemLevel > 50) return false;
    const c = def.slot === 'weapon' ? def.characterClass! : characterClass;
    return edit((p) =>
      grantItem(p, {
        slot: def.slot,
        rarity: 'legendary',
        itemLevel,
        characterClass: c,
        legendaryId: id,
      }),
    );
  },
  /** Task 42: set the bag expansions bought (0–5; no Gold spent). */
  setBagExpansions(count: number) {
    if (!Number.isInteger(count) || count < 0 || count > BAG_RULES.expansionPrices.length)
      return false;
    return edit((p) => ({ ...p, bagExpansions: count }));
  },
  grantOre(amount: number) {
    return edit((p) => ({ ...p, ore: p.ore + amount }));
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
        `${BACKUP_KEY}: ${read(BACKUP_KEY) ? 'present' : '—'}`,
        `${QUARANTINE_KEY}: ${read(QUARANTINE_KEY) ? 'present' : '—'}`,
        '',
        main ? JSON.stringify(JSON.parse(main), null, 2) : '',
      ].join('\n');
    } catch {
      return 'Storage unavailable.';
    }
  },
};
/** Task 21 debug: a quest counter raised to its goal. */
function completeCounter(c: QuestCounters, g: QuestGoal): QuestCounters {
  const synergies = [...SYNERGY_IDS].sort();
  switch (g.kind) {
    case 'type-kills':
      return g.type === 'elite'
        ? { ...c, eliteKills: Math.max(c.eliteKills, g.count) }
        : {
            ...c,
            killsByType: { ...c.killsByType, [g.type]: Math.max(c.killsByType[g.type], g.count) },
          };
    case 'bosses':
      return {
        ...c,
        bossesDefeated: [
          ...new Set([...c.bossesDefeated, ...CAMPAIGN_MAPS.map((m) => m.id).slice(0, g.count)]),
        ].sort((a, b) => a - b),
      };
    case 'chests':
      return { ...c, chestsOpened: Math.max(c.chestsOpened, g.count) };
    case 'synergies-opened':
      return {
        ...c,
        synergiesOpened: [
          ...new Set([...c.synergiesOpened, ...synergies.slice(0, g.count)]),
        ].sort(),
      };
    case 'synergies-awakened': {
      const pick = synergies.slice(0, g.count);
      return {
        ...c,
        synergiesOpened: [...new Set([...c.synergiesOpened, ...pick])].sort(),
        synergiesAwakened: [...new Set([...c.synergiesAwakened, ...pick])].sort(),
      };
    }
    case 'tier-loadout':
      return { ...c, bestTierLoadout: Math.max(c.bestTierLoadout, g.items) };
    case 'activities':
      return {
        ...c,
        activities: {
          ...c.activities,
          [g.activity]: Math.max(c.activities[g.activity], g.count),
        },
      };
    default:
      return c;
  }
}
