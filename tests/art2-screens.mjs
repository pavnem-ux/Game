import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { brand, startMap } from './e2e-nav.mjs';

/**
 * Task 26: before / after screenshots of art pack 2 (biome grounds, pickups, currency icons). Not
 * part of `test:e2e`; needs a running dev server (`/?debug` tools). Writes small JPEGs to
 * `docs/art-pack-2/<tag>-*.jpg`:
 *  - maps 1, 15, 25, 35 (acts I–IV): XP crystals, coin piles (from kills), a wooden and an
 *    enchanted chest and a bombard telegraph on screen — full view and a 2× close-up;
 *  - the hub and the results screen (Gold / Ore badges).
 *
 *   CHROMIUM_PATH=… node tests/art2-screens.mjs before
 */
const tag = process.argv[2] || 'after';
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
const out = process.env.ART_SCREENS_DIR || 'docs/art-pack-2';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
});
const errors = [];
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
const shot = (name, clip) =>
  page.screenshot({ path: `${out}/${tag}-${name}.jpg`, type: 'jpeg', quality: 72, clip });
const full = { x: 0, y: 0, width: 1280, height: 720 };
const nav = brand(page);
/** Leaves any run, then unlocks maps 1…mapId through a normal profile edit (highest = selected). */
async function unlock(mapId) {
  await page.goto(base + '/?debug');
  await nav.waitFor();
  await page.evaluate((id) => {
    const p = JSON.parse(localStorage.getItem('skazki.profile'));
    p.completedMaps = Array.from({ length: id - 1 }, (_, i) => i + 1);
    p.highestUnlockedMap = id;
    p.gold = 1240;
    p.ore = 37;
    localStorage.setItem('skazki.profile', JSON.stringify(p));
  }, mapId);
  await page.goto(base + '/?debug');
  await nav.waitFor();
}
const command = (a) => page.evaluate((x) => window.__alpha.command(x), a);
const state = () => page.evaluate(() => window.__alpha.state());
/** Takes the first card of any pending level-up offer. */
async function takeOffers() {
  for (let guard = 0; guard < 20; guard++) {
    const offer = (await state()).world?.skills.offer;
    if (!offer) return;
    const c = offer.cards[0];
    await command({
      type: 'choose-skill',
      card: c.kind === 'skill' ? c.skillId : `bonus:${c.bonusId}`,
    });
  }
}

for (const mapId of [1, 15, 25, 35]) {
  await unlock(mapId);
  await startMap(page, mapId);
  await page.waitForFunction(() => window.__alpha?.state().screen === 'playing');
  await page
    .getByRole('button', { name: 'Hide' })
    .click({ timeout: 2000 })
    .catch(() => {});
  await command({ type: 'protection', enabled: true });
  await command({ type: 'spawning', settings: { enabled: false } });
  await command({ type: 'clear-enemies' });
  // Coins and crystals drop from kills in view (normal reward pipeline); a few extra crystals.
  await command({ type: 'spawn-n', kind: 'melee', count: 16, distance: 150 });
  await command({ type: 'kill-in-view' });
  for (const d of [90, 120, 160]) await command({ type: 'xp-crystal', value: 5, distance: d });
  await command({ type: 'chest', chestType: 'wooden' }).catch(() => {});
  await command({ type: 'chest', chestType: 'enchanted' }).catch(() => {});
  // A guaranteed coin burst: a caught treasure thief pays its coins (normal reward pipeline).
  await command({ type: 'activity', activityType: 'thief' });
  const thief = (await state()).world.activities.items.find((x) => x.type === 'thief');
  if (thief) await command({ type: 'activity-resolve', id: thief.id, outcome: 'complete' });
  // A bombard telegraph circle (artillery strike) for the readability check.
  await command({ type: 'spawn-n', kind: 'bombard', count: 2, distance: 300 });
  // Advance until an artillery telegraph is on the ground (it lasts about a second).
  for (let i = 0; i < 60 && (await state()).world.artilleryStrikes.length === 0; i++) {
    await page.evaluate(() => window.__alpha.advance(0.2));
    await takeOffers();
  }
  const ws = (await state()).world;
  console.log(
    `map ${mapId}: ${ws.coins.piles.length} coin piles, ${ws.crystals?.count ?? '?'} crystals, ${ws.chests.items.length} chests, ${ws.artilleryStrikes.length} telegraphs`,
  );
  await takeOffers();
  await page.waitForTimeout(300);
  await shot(`map${mapId}`, full);
  await shot(`map${mapId}-closeup`, { x: 340, y: 160, width: 600, height: 400 });
}

// Hub (Gold / Ore badges) and the results screen of a won map.
await unlock(2);
await shot('hub', full);
await startMap(page, 2);
await page.waitForFunction(() => window.__alpha?.state().screen === 'playing');
await command({ type: 'campaign-force', outcome: 'victory' });
const results = page.getByRole('dialog', { name: 'Victory.' });
await results.waitFor();
await page.waitForTimeout(400);
await shot('results', full);

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`art pack 2 screens (${tag}) written to ${out}/`);
