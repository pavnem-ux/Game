import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

/**
 * Task 25: before / after screenshots of the art pack (not part of `test:e2e`). Needs a running dev
 * server (`/?debug` tools). Writes small JPEGs to `docs/art-pack-1/<tag>-*.jpg`:
 * hub and character select (desktop 1280×720 + phone 844×390), and in-run scenes on map 1 and
 * map 25 with every enemy type (melee, ranged, swift, brute, bombard), both elite profiles, the
 * treasure thief and the blight nest spawned through the DEV tools.
 *
 *   CHROMIUM_PATH=… node tests/art-screens.mjs before
 */
const tag = process.argv[2] || 'after';
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
const out = process.env.ART_SCREENS_DIR || 'docs/art-pack-1';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
});
const errors = [];
const shot = (page, name) =>
  page.screenshot({ path: `${out}/${tag}-${name}.jpg`, type: 'jpeg', quality: 72 });

for (const [device, viewport, touch] of [
  ['desktop', { width: 1280, height: 720 }, false],
  ['mobile', { width: 844, height: 390 }, true],
]) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${device}: ${e.message}`));
  await page.goto(base + '/?debug');
  const nav = page.getByRole('navigation', { name: 'Main menu' });
  /** Unlocks maps 1…mapId through a normal profile edit; the highest one is selected. */
  const unlock = async (mapId) => {
    await page.evaluate((id) => {
      const p = JSON.parse(localStorage.getItem('skazki.profile'));
      p.completedMaps = Array.from({ length: id - 1 }, (_, i) => i + 1);
      p.highestUnlockedMap = id;
      localStorage.setItem('skazki.profile', JSON.stringify(p));
    }, mapId);
    await page.reload();
    await nav.waitFor();
  };
  await nav.waitFor();
  await unlock(25);
  const go = (label) =>
    nav.getByRole('button', { name: label, exact: true }).evaluate((el) => el.click());
  await go('Home');
  await page.waitForTimeout(400);
  await shot(page, `${device}-hub`);
  await go('Hero');
  await page.waitForTimeout(400);
  await shot(page, `${device}-character-select`);
  if (device === 'mobile') {
    await context.close();
    continue;
  }

  for (const mapId of [1, 25]) {
    await unlock(mapId);
    await go('Home');
    await page.getByRole('button', { name: new RegExp(`^Start run · map ${mapId}\\b`) }).click();
    await page.waitForFunction(() => window.__alpha?.state().screen === 'playing');
    await page
      .getByRole('button', { name: 'Hide' })
      .click({ timeout: 2000 })
      .catch(() => {});
    const command = (a) => page.evaluate((x) => window.__alpha.command(x), a);
    const state = () => page.evaluate(() => window.__alpha.state());
    /** Takes the first card of any pending level-up offer (accelerated time levels up). */
    const takeOffers = async () => {
      for (let guard = 0; guard < 20; guard++) {
        const offer = (await state()).world.skills.offer;
        if (!offer) return;
        const c = offer.cards[0];
        await command({
          type: 'choose-skill',
          card: c.kind === 'skill' ? c.skillId : `bonus:${c.bonusId}`,
        });
      }
    };
    await command({ type: 'protection', enabled: true });
    await command({ type: 'spawning', settings: { enabled: false } });
    await command({ type: 'clear-enemies' }).catch(() => {});
    if (mapId === 25) {
      // Two elites through the normal campaign schedule (accelerated with the normal simulation).
      // A level-up offer pauses the skip, so keep going until two elites are on the map.
      for (let i = 0; i < 30 && (await state()).world.campaign.eliteEnemyIds.length < 2; i++) {
        const next = (await state()).world.campaign.nextEvent;
        if (!next || next.kind !== 'elite') break;
        await command({ type: 'campaign-skip' });
        await takeOffers();
      }
      // Elites enter at the arena edge: let them close in on the player.
      for (let t = 0; t < 8; t++) {
        await page.evaluate(() => window.__alpha.advance(1));
        await takeOffers();
      }
      await command({ type: 'activity', activityType: 'thief' });
      await command({ type: 'activity', activityType: 'nest' });
    }
    for (const [kind, distance] of [
      ['melee', 150],
      ['ranged', 230],
      ['swift', 190],
      ['brute', 270],
      ['bombard', 310],
    ])
      await command({ type: 'spawn-n', kind, count: 3, distance });
    await page.evaluate(() => window.__alpha.advance(0.4));
    await takeOffers();
    await page.waitForTimeout(300);
    await shot(page, `${device}-map${mapId}`);
    await page.goto(base + '/?debug'); // leaving abandons the run (no rewards)
    await nav.waitFor();
  }
  await context.close();
}
await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`art screens (${tag}) written to ${out}/`);
