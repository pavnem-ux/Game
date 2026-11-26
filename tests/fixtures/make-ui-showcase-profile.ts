/**
 * Task 13: builds the "showcase" profile used by `tests/ui-screenshots.mjs` (a partly played
 * campaign: maps 1–12 won, mixed class levels, talents on one class, a few bought item instances) with the
 * game's own pure functions, validates it with the normal save parser and prints the JSON.
 *
 * Run: npx tsx tests/fixtures/make-ui-showcase-profile.ts > tests/fixtures/ui-showcase-profile.json
 */
import { CAMPAIGN_MAPS } from '../../src/campaign';
import { parseProfile } from '../../src/persistence';
import {
  addClassXp,
  applyRunResult,
  buyOffer,
  createProfile,
  equipItem,
  xpToNextLevel,
} from '../../src/profile';
import type { PlayerProfile } from '../../src/profile';
import { validateTalentRanks } from '../../src/talents';
import type { CharacterClass } from '../../src/character-stats';

const NOW = '2026-11-11T12:00:00.000Z';
let p: PlayerProfile = createProfile('ui-showcase', NOW);
const win = (mapId: number, characterClass: CharacterClass, i: number) => {
  p = applyRunResult(
    p,
    {
      runId: `showcase-${characterClass}-${mapId}-${i}`,
      mapId,
      characterClass,
      outcome: 'victory',
      elapsed: CAMPAIGN_MAPS[mapId - 1].durationSeconds,
      kills: 900,
      eliteKills: 4,
      bossKilled: true,
      runLevel: 40,
      coins: Math.round(CAMPAIGN_MAPS[mapId - 1].victoryGold * 0.6),
    },
    NOW,
  ).profile;
};
for (let id = 1; id <= 12; id++) win(id, 'warrior', 0);
for (let id = 1; id <= 4; id++) win(id, 'mage', 1);
for (let id = 1; id <= 2; id++) win(id, 'archer', 2);
// The rogue is a veteran (level 32) with a superpower-ready talent build.
let rogue = p.classes.rogue;
while (rogue.level < 32) rogue = addClassXp(rogue, xpToNextLevel(rogue.level)! - rogue.xp).progress;
const ranks: Record<string, number> = {};
const order = [
  'rogue.b1.n01',
  'rogue.b1.n03',
  'rogue.b2.n01',
  'rogue.b2.n02',
  'rogue.b3.n01',
  'rogue.b3.n02',
  'rogue.b1.n04',
];
for (const node of order)
  for (let r = 1; r <= 3; r++) {
    const before = ranks[node];
    ranks[node] = r;
    if (!validateTalentRanks('rogue', rogue.level, ranks).ok) {
      if (before) ranks[node] = before;
      else delete ranks[node];
      break;
    }
  }
p = {
  ...p,
  classes: {
    ...p.classes,
    rogue: { ...rogue, talents: ranks },
  },
};
// Task 40: a few shop offers bought for the Warrior (item instances i1 … i4); three equipped.
for (const id of ['armor:common', 'amulet:common', 'ring:common', 'weapon:common'])
  p = buyOffer(p, 'warrior', id);
for (const uid of ['i1', 'i4', 'i2']) p = equipItem(p, 'warrior', uid);
p = { ...p, selectedClass: 'warrior' };
const checked = parseProfile(JSON.parse(JSON.stringify(p)));
if (!checked.ok) throw new Error(`Invalid showcase profile: ${JSON.stringify(checked.error)}`);
process.stdout.write(JSON.stringify(checked.profile, null, 2) + '\n');
