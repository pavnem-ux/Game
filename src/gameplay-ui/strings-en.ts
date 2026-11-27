import { CHARACTER_CLASSES } from '../character-stats';
import { ALPHA_WEAPONS, WEAPON_LABELS } from '../gameplay';
import type { EnemyType } from '../gameplay';
import { SKILL_CATALOG, SYNERGY_RULES } from '../skills';
import { TALENT_CONFIG } from '../talents';
import { PET_CONFIG, isPetId } from '../pets';

/**
 * Task 23: the English locale — every player-facing UI string, one typed object (`EN`). Another
 * language is added by providing a module with the same shape. Names of game content (maps, skills,
 * items…) live with their catalogs. Terms follow `docs/glossary-en.md`. Presentation only.
 */
export const EN = Object.freeze({
  build: Object.freeze({ label: 'Build version' }),
  talents: Object.freeze({
    title: 'Talents',
    classSwitch: 'Talent tree class',
    points: (available: number, earned: number) => `Free points: ${available} of ${earned}`,
    level: (level: number) => `Class level ${level}`,
    superpower: 'Superpower',
    superpowerActive: 'Superpower learned',
    superpowerReady: "Superpower available: learn rank I of the branch's first talent",
    superpowerLocked: 'Superpower unlocks at level 30',
    branchLocked: 'unlocks at level 30',
    rank: (rank: number) => `Rank ${['0', 'I', 'II', 'III'][rank]}`,
    rankOf: (rank: number) => `${['0', 'I', 'II', 'III'][rank]} / III`,
    learn: (rank: number) => `Learn rank ${['', 'I', 'II', 'III'][rank]}`,
    requires: (name: string) => `Requires: “${name}” rank II`,
    reasons: Object.freeze({
      'unknown-node': 'Unknown talent',
      'wrong-class': "Another class's talent",
      'max-rank': 'Maximum rank',
      level: 'Unlocks at level 30',
      prerequisite: 'Learn the previous talent to rank II first',
      'no-points': 'No free points',
    } as Record<string, string>),
    inert:
      'Some ranks do not work in combat yet (marked): learned ranks are kept and start working once implemented.',
    rankPending: 'not active in combat yet',
    rankBlocked: 'blocked: see talents-gaps',
    noRefund: 'Talents cannot be reset: the choice is final.',
  }),
  seed: Object.freeze({ label: 'Run seed' }),
  settings: Object.freeze({
    title: 'Game',
    screenShake: 'Screen shake',
    screenShakeHint: 'A light shake when you take damage and on heavy boss attacks.',
    gameSpeed: 'Game speed',
    gameSpeedHint:
      'Everything in the run moves faster; rewards stay the same. Paused screens stay frozen.',
    gameSpeedButton: (label: string) => `Game speed ${label}: change`,
    sound: 'Sound',
    masterVolume: 'Master volume',
    sfxVolume: 'Effects',
    musicVolume: 'Music',
    muted: 'Muted',
    soundHint: 'All sounds are made by the game. Sound starts after the first tap or click.',
    touch: 'Touch controls',
    leftHanded: 'Left-handed (joystick right, dash left)',
    haptics: 'Vibration (dash, new level)',
    touchHint:
      'On phones and tablets the joystick appears where your finger lands; the “Dash” button is at the bottom.',
    graphics: 'Graphics',
    graphicsQuality: 'Graphics quality',
    graphicsQualityOptions: Object.freeze({ high: 'High', medium: 'Medium', low: 'Low' }),
    graphicsHint:
      'Light, particles, decor density and glow. “Low” runs faster on weak devices; gameplay is unaffected.',
  }),
  device: Object.freeze({
    rotate: 'Rotate your device',
    rotateHint: 'The game plays best in landscape. The run is paused.',
    fullscreen: 'Full screen',
    exitFullscreen: 'Exit full screen',
  }),
  touch: Object.freeze({
    dash: 'Dash',
    dashReady: 'Dash ready',
    dashCooldown: (s: string) => `Dash: ${s} s`,
  }),
  report: Object.freeze({
    button: 'Report a problem',
    done: (file: string) => `Report saved: ${file}. Send this file to the developer.`,
    failed: 'Could not download the report.',
  }),
  crash: Object.freeze({
    eyebrow: 'UNEXPECTED ERROR',
    title: 'Something went wrong.',
    body: 'The game ran into an error. Your save is unchanged; the current run was stopped and not recorded.',
    hint: 'If it happens again, send a report with “Report a problem”.',
    back: 'Back to the menu',
  }),
  stats: Object.freeze({
    title: 'Run statistics',
    topSources: 'Top damage sources',
    damageDealt: 'Damage dealt',
    damageTaken: 'Damage taken',
    takenFrom: 'Most taken from',
    deathTime: 'Death',
    noDeath: 'never fell',
    revive: 'Revival',
    reviveUsed: (time: string) => `used at ${time}`,
    reviveUnused: 'not used',
    lowHp: 'On the brink (< 20% HP)',
    noDamage: 'No damage dealt yet.',
  }),
  /** Task 24: map activity toasts and labels. */
  activities: Object.freeze({
    spawned: Object.freeze({
      shrine: 'A shrine has appeared',
      lantern: 'A dying lantern flickers nearby',
      thief: 'A treasure thief is fleeing!',
      nest: 'A blight nest has sprouted',
      snare: 'A snare has appeared',
      altar: 'A cursed altar has appeared',
      chain: 'A lantern chain has appeared',
      seals: 'Three seals have appeared',
    }),
    completed: Object.freeze({
      shrine: 'Shrine cleansed!',
      lantern: 'Lantern defended!',
      thief: 'Thief caught!',
      nest: 'Nest destroyed!',
      snare: 'The snare snapped shut!',
      altar: 'Fury accepted!',
      chain: 'Lantern chain complete!',
      seals: 'The sealed chest is open!',
    }),
    failed: Object.freeze({
      shrine: 'The shrine has faded',
      lantern: 'The lantern went dark',
      thief: 'The thief escaped',
      nest: 'The nest crumbled away',
      snare: 'The snare has faded',
      altar: 'The altar has faded',
      chain: 'The lantern chain went dark',
      seals: 'The seals have faded',
    }),
    hints: Object.freeze({
      shrine: 'Stand inside to cleanse',
      lantern: 'Stand close to light it',
      thief: 'Catch the thief',
      nest: 'Destroy the nest',
      snare: 'Lure enemies',
      altar: 'Stand to accept · −25% max HP → Fury',
      chain: 'Stand close to light it',
      seals: 'Stand on a seal to break it',
    }),
    defend: 'Defend the lantern',
    /** Task 38 live labels. */
    lure: (count: number, threshold: number) => `Lure enemies · ${count}/${threshold}`,
    snapping: 'Snapping!',
    tooWeak: 'Too weak to pay',
    reachNext: (seconds: number) => `Reach the next lantern · ${seconds} s`,
    lateLantern: (seconds: number) => `Dimmed · still a chest · ${seconds} s`,
    nextLantern: 'Next lantern',
    sealsLocked: (broken: number) => `Sealed · ${broken}/2 seals broken`,
    sealsOpen: 'Open now, or break the last seal',
    seal: 'Seal',
  }),
  /** Task 13: meta screens (hub, characters, equipment, talents, shop, map path) and the UI kit. */
  meta: Object.freeze({
    title: 'The Last Light',
    subtitle: 'Chronicles of Fading Tales',
    nav: Object.freeze({
      label: 'Main menu',
      hub: 'Home',
      character: 'Hero',
      equipment: 'Bag',
      talents: 'Talents',
      shop: 'Shop',
      forge: 'Forge',
      pets: 'Pets',
      quests: 'Quests',
      maps: 'Campaign map',
      progression: 'Progress',
      settings: 'Settings',
      back: 'Back',
    }),
    gold: (amount: string) => `Gold: ${amount}`,
    ore: (amount: string) => `Ore: ${amount}`,
    hub: Object.freeze({
      fight: 'To battle',
      fightHint: 'Open the campaign map',
      quickStart: (mapId: number) => `Start run · map ${mapId}`,
      selected: 'Chosen hero',
      level: (level: number) => `Level ${level}`,
      campaign: (done: number, total: number) => `Maps cleared: ${done} of ${total}`,
      next: (mapId: number, name: string) => `Next goal: ${mapId}. ${name}`,
      controls: 'WASD / arrows — move · P / Esc — pause · on phones — joystick',
      forfeit:
        'There is no saving inside a run: leaving to the menu or reloading the page during a run counts as forfeiting — no reward.',
    }),
    character: Object.freeze({
      title: 'Choose your hero',
      select: 'Choose',
      selected: 'Chosen',
      roles: Object.freeze({
        warrior: Object.freeze(['Melee', 'Toughness']),
        mage: Object.freeze(['Magic', 'Area damage']),
        archer: Object.freeze(['Ranged', 'Speed']),
        rogue: Object.freeze(['Crits', 'Poison and Bleed']),
      }) as Readonly<Record<string, readonly string[]>>,
      level: (level: number) => `Level ${level} / 50`,
      xp: (xp: number, next: number | null) =>
        next === null ? 'Maximum level' : `XP ${xp} / ${next}`,
      points: (n: number) => `Talent points: ${n}`,
      weapon: (name: string) => `Weapon: ${name}`,
      toEquipment: 'Bag',
      toTalents: 'Talents',
      cardLabel: (name: string, level: number) => `${name}: level ${level}`,
    }),
    stats: Object.freeze({
      maxHp: 'Health',
      physicalDamage: 'Phys. damage',
      magicalDamage: 'Magic damage',
      attackSpeed: 'Attack speed',
      criticalChance: 'Crit chance',
      criticalDamage: 'Crit damage',
      resistance: 'Resistance',
      dodgeChance: 'Dodge',
      movementSpeed: 'Movement speed',
      cooldownReduction: 'Cooldown red.',
      areaSize: 'Area size',
    }),
    bag: Object.freeze({
      title: 'Bag',
      equipped: 'Equipped',
      empty: 'Empty',
      all: 'All',
      count: (n: number, max: number) => `Bag · ${n} / ${max}`,
      select: 'Select',
      sortLevel: 'Item level',
      sortRarity: 'Rarity',
      sortNewest: 'Newest',
      allClasses: 'Show all classes',
      markerNew: 'new',
      markerBetter: 'better',
      markerEquipped: 'equipped',
      noItems: 'No items here. Buy some in the shop.',
      pick: 'Select an item or a slot to see its card.',
      requires: (level: number) => `Requires level ${level}`,
      equippedBy: (names: string) => `Equipped by: ${names}`,
      salvageOne: (ore: number) => `Salvage → ${ore} Ore`,
      salvageMarked: (n: number, ore: number) => `Salvage marked (${n}) → ${ore} Ore`,
      salvageLow: (ore: number) => `Salvage all Common and Uncommon → ${ore} Ore`,
      markFirst: 'Mark items to salvage first',
      nothingLow: 'No unequipped Common or Uncommon items',
      confirmTitle: (n: number, ore: number) =>
        `Salvage ${n} item${n === 1 ? '' : 's'} for ${ore} Ore?`,
      confirmText: 'Salvaged items are gone for good.',
      confirmLegendary: (n: number) =>
        `This includes ${n} Legendary item${n === 1 ? '' : 's'}. Salvage anyway?`,
      confirm: 'Salvage',
      salvaged: (n: number, ore: number) => `Salvaged ${n} item${n === 1 ? '' : 's'}: +${ore} Ore.`,
      upgrade: (level: number) => `Upgrade to +${level} · `,
      upgraded: (slot: string, level: number) => `${slot} upgraded to +${level}.`,
      maxed: 'The slot is at +30',
      needGold: (n: number) => `Need ${n} more Gold`,
      needOre: (n: number) => `Need ${n} more Ore`,
      bonuses: (main: string, secondary: string) =>
        `Main stat ×${main} · secondary stats ×${secondary}`,
      nextMilestone: (level: number) => `Next milestone at +${level}`,
      allMilestones: 'Every milestone reached',
      equippedMsg: (name: string) => `Equipped: ${name}.`,
      unequippedMsg: (name: string) => `Unequipped: ${name}.`,
      failed: 'The action failed.',
      expand: 'Expand bag',
      expandTitle: (price: string) => `Expand the bag by 10 for ${price} Gold?`,
      expandText: 'The bag grows for the whole profile, forever.',
      expanded: (capacity: number) => `The bag now holds ${capacity} items.`,
      pickStat: 'Pick a stat',
      reforge: 'Reforge',
      reforgeTitle: (stat: string, price: string) => `Reforge “${stat}” for ${price} Gold?`,
      reforgeText:
        'It becomes a random other stat of this slot with a new value. This cannot be undone.',
      reforged: (name: string) => `Reforged: ${name}.`,
    }),
    equipment: Object.freeze({
      title: 'Equipment',
      empty: 'Empty',
      owned: 'Your items',
      all: 'All',
      noItems: 'No suitable items. Buy some in the shop.',
      toShop: 'To the shop',
      equip: 'Equip',
      unequip: 'Unequip',
      equipped: 'Equipped',
      compare: (name: string) => `If you equip “${name}”`,
      noChange: 'Your stats will not change.',
      finalStats: 'Final stats',
      without: 'Without gear',
      with: 'With gear',
      nextRun: 'Changes apply from the next run.',
      starter: 'Starter',
      unequipFailed: 'Could not unequip the item.',
      equipFailed: 'Could not equip.',
      needsLevel: (level: number) => `Needs class level ${level}`,
      close: 'Close',
    }),
    talents: Object.freeze({
      available: (n: number) => `Free points: ${n}`,
      seal: 'unlocks at level 30',
      learn: (rank: string) => `Learn rank ${rank}`,
      learned: (name: string, rank: string) => `Learned: “${name}”, rank ${rank}`,
      confirm: (name: string, rank: string) => `Learn “${name}” to rank ${rank}?`,
      confirmNote: 'Talents cannot be reset: the choice is final.',
      maxed: 'Fully mastered',
      locked: 'Locked',
      pickNode: 'Pick a talent to see its ranks.',
    }),
    /** Task 21 quests. */
    quests: Object.freeze({
      title: 'Quests',
      intro:
        'Quests are permanent: progress builds up over every run (leaving a run does not count). Collect rewards with “Claim”.',
      all: 'All',
      onlyAvailable: 'Only claimable',
      claim: 'Claim',
      claimed: 'Claimed',
      inProgress: 'In progress',
      complete: 'Complete',
      empty: 'No rewards to claim — keep journeying.',
      reward: 'Reward',
      fallback: (gold: number) => `already owned — ${formatNumber(gold)} Gold instead`,
      claimedToast: (title: string) => `Reward claimed: “${title}”`,
      completedToast: (n: number) => (n === 1 ? 'Quest complete!' : `Quests complete: ${n}`),
      toQuests: 'To quests',
      badge: (n: number) => `Rewards to claim: ${n}`,
      failed: 'Could not save.',
      refusals: Object.freeze({
        incomplete: 'The quest is not complete yet.',
        claimed: 'The reward has already been claimed.',
        unknown: 'Unknown quest.',
      }) as Readonly<Record<string, string>>,
    }),
    /** Task 20 pets. */
    pets: Object.freeze({
      title: 'Pets',
      intro:
        'Your pet joins every run with any hero: one active pet for the whole profile. It cannot be hurt, and its strikes never trigger synergies.',
      active: 'Active',
      choose: 'Take on runs',
      remove: 'Leave at home',
      none: 'No pet',
      now: 'Now',
      next: (level: number) => `At level ${level}`,
      maxed: 'Maximum level',
      locked: 'Not found yet',
      toShop: 'To the shop',
      toForge: 'To the forge',
      slot: 'Pet',
      change: 'Change',
      buy: 'Buy',
      bought: (name: string) => `New pet: “${name}”`,
      confirmBuy: (name: string, price: number) => `Buy “${name}” for ${formatNumber(price)} Gold?`,
      upgrade: (level: number) => `Upgrade to level ${level}`,
      upgraded: (name: string, level: number) => `“${name}”: level ${level}`,
      refusals: Object.freeze({
        gold: 'Not enough Gold.',
        ore: 'Not enough Ore.',
        max: 'The pet is already at its maximum level.',
        owned: 'Already owned.',
        quest: 'This pet can only be earned through a quest.',
        'not-owned': 'You do not have this pet yet.',
      }) as Readonly<Record<string, string>>,
      failed: 'Could not save.',
    }),
    /** Task 19 forge. */
    forge: Object.freeze({
      title: 'Forge',
      intro:
        "An upgrade always succeeds: each level adds +5% to the item's base stats (up to +10). An item's level is shared by every class.",
      items: 'Items',
      noItems: 'Nothing to upgrade. Buy gear in the shop.',
      pick: 'Pick an item to see its upgrade.',
      level: (level: number, max: number) => `Level +${level} of +${max}`,
      now: 'Now',
      next: (level: number) => `After +${level}`,
      cost: 'Cost',
      upgrade: 'Upgrade',
      upgraded: (name: string) => `Upgraded: “${name}”`,
      maxed: 'Maximum level',
      equippedBy: (classes: string) => `Equipped: ${classes}`,
      toForge: 'To the forge',
      backToEquipment: 'Back to equipment',
      refusals: Object.freeze({
        gold: 'Not enough Gold.',
        ore: 'Not enough Ore.',
        max: 'The item is already upgraded to +10.',
        'not-owned': 'You do not own this item.',
        starter: 'Starter weapons cannot be upgraded.',
      }) as Readonly<Record<string, string>>,
      failed: 'Could not upgrade.',
    }),
    shop: Object.freeze({
      lockedOverlay: (mapId: number) => `unlocks after map ${mapId}`,
      owned: 'Owned',
      soldOut: 'Sold out until the next level',
      equippedStamp: 'Equipped',
    }),
    maps: Object.freeze({
      title: 'Campaign map',
      act: (roman: string, name: string) => `Act ${roman} · ${name}`,
      node: (id: number, name: string, state: string) => `Map ${id}: ${name}${state}`,
      locked: ', locked',
      done: ', cleared',
      available: ', open',
      lockedReason: (prev: number) => `Win on map ${prev}`,
      duration: 'Duration',
      difficulty: 'Difficulty',
      recommended: 'Recommended level',
      yourLevel: (level: number) => `your level ${level}`,
      rewards: 'Reward',
      reward: (xp: number, gold: number) => `${formatNumber(xp)} XP · ${formatNumber(gold)} Gold`,
      modifiers: 'Features',
      noModifiers: 'none',
      boss: 'Boss',
      bossHidden: '???',
      best: 'Best result',
      notDone: 'Not cleared yet',
      fight: 'To battle',
      fightLabel: (id: number) => `Play: map ${id}`,
      /** Task 39: difficulty tiers. */
      tier: 'Tier',
      tierNames: Object.freeze({
        normal: 'Normal',
        hard: 'Hard',
        nightmare: 'Nightmare',
        trial: 'Elite Trial',
      }),
      tierHints: Object.freeze({
        normal: 'The map as it is.',
        hard: 'All monsters: +50% health and damage. Victory Gold and Ore ×1.5.',
        nightmare: 'All monsters: +100% health and damage. Victory Gold and Ore ×2.',
        trial:
          'No ordinary enemies. 5 elites every 30 seconds (×3), the boss at 3:00 (×3). Victory Ore ×2, class XP ×0.2.',
      }),
      tierLocked: (previous: string) => `Win on ${previous} first`,
      tierUnlocked: (name: string) => `${name} unlocked on this map`,
      rewardScaled: (gold: number, ore: number, xp: number) =>
        ` · Gold ×${gold} · Ore ×${ore}${xp !== 1 ? ` · class XP ×${xp}` : ''}`,
      select: 'Select',
      close: 'Close',
    }),
    modal: Object.freeze({ confirm: 'Confirm', cancel: 'Cancel' }),
    /** Task 14: level-up offer controls. */
    offer: Object.freeze({
      reroll: (n: number) => `Reroll · ${n} left`,
      banish: (n: number) => `Banish · ${n} left`,
      banishCancel: 'Cancel banish',
      banishHint: 'Pick the card to banish for the rest of the run.',
      banishCard: (name: string) => `Banish: ${name}`,
      skip: (coins: number) => (coins > 0 ? `Skip · +${coins} coins` : 'Skip'),
      noRerolls: 'No rerolls left, or a reroll would change nothing',
      reasons: Object.freeze({
        'none-left': 'No banishes left',
        'last-upgrade': 'The last available upgrade cannot be banished',
        'not-skill': 'A reward cannot be banished',
        'no-offer': 'Banish unavailable',
      }) as Readonly<Record<string, string>>,
      banished: (n: number) => `Banished: ${n}`,
    }),
  }),
});
/** English number format: 1,240 (Task 23). */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}

const EFFECT_LABELS: Record<string, string> = {
  poison: 'Poison',
  burn: 'Burn',
  bleed: 'Bleed',
};
const ENEMY_TYPE_LABELS: Record<EnemyType | 'unknown', string> = {
  melee: 'Melee',
  ranged: 'Shooters',
  swift: 'Swift Imps',
  brute: 'Stone Trolls',
  bombard: 'Bombard Warlocks',
  'elite-melee': 'Elite · melee',
  'elite-ranged': 'Elite · shooter',
  boss: 'Boss',
  unknown: 'Other',
};
const WEAPON_BY_ID = new Map(
  CHARACTER_CLASSES.map((c) => [ALPHA_WEAPONS[c].id, WEAPON_LABELS[c]] as const),
);
const SKILL_NAMES = new Map(SKILL_CATALOG.map((s) => [s.id, s.name] as const));
const SKILL_BY_ID = new Map(SKILL_CATALOG.map((s) => [s.id, s] as const));
const SYNERGY_NAMES = new Map(SYNERGY_RULES.map((r) => [r.id as string, r.name] as const));

/** `weapon:<id>` / `skill:<id>` / `synergy:<id>` / `status:<effect>` / `debug` → English label. */
export function damageSourceLabel(source: string): string {
  // Task 20: pet hits / Burn are their own source `pet.<id>`.
  if (source.startsWith('pet.')) {
    const pet = source.slice(4);
    return `Pet “${isPetId(pet) ? PET_CONFIG[pet].name : pet}”`;
  }
  const [kind, id = ''] = source.split(':');
  switch (kind) {
    case 'weapon':
      return WEAPON_BY_ID.get(id) ?? 'Weapon';
    case 'skill':
      return SKILL_NAMES.get(id) ?? 'Skill';
    case 'synergy':
      return `Synergy “${SYNERGY_NAMES.get(id) ?? id}”`;
    case 'status':
      return EFFECT_LABELS[id] ?? 'Effect';
    case 'talent':
      return `Talent “${TALENT_CONFIG.nodes.get(source.slice('talent:'.length))?.name ?? 'talent'}”`;
    case 'debug':
      return 'Debug';
    default:
      return 'Other';
  }
}
/** Task 27: the catalogue skill behind a `skill:<id>` damage source (its icon), else null. */
export function damageSourceSkill(source: string): { id: string; icon: string } | null {
  if (!source.startsWith('skill:')) return null;
  const skill = SKILL_BY_ID.get(source.slice('skill:'.length));
  return skill ? { id: skill.id, icon: skill.icon } : null;
}
/** Task 28: the synergy behind a `synergy:<id>` damage source (its icon), else null. */
export function damageSourceSynergy(source: string): string | null {
  if (!source.startsWith('synergy:')) return null;
  const id = source.slice('synergy:'.length);
  return SYNERGY_NAMES.has(id) ? id : null;
}
export const enemyTypeLabel = (type: EnemyType | 'unknown') => ENEMY_TYPE_LABELS[type];
