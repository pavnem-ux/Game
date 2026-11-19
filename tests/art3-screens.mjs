import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

/**
 * Task 27: before / after screenshots of art pack 3 (skill icons). Not part of `test:e2e`; needs a
 * running dev server (`/?debug` tools). Writes small JPEGs to `docs/art-pack-3/<tag>-*.jpg`:
 *  - the level-up offer screen;
 *  - the in-run HUD with four active skills (cooldowns running) and a close-up of the skill bar;
 *  - the pause menu (skill list, synergy pairs and hints);
 *  - the results screen (top damage sources);
 *  - the HUD and the offer screen on a phone (touch layout).
 *
 *   CHROMIUM_PATH=… node tests/art3-screens.mjs before
 */
const tag = process.argv[2] || 'after';
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
const out = process.env.ART_SCREENS_DIR || 'docs/art-pack-3';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
});
const errors = [];

/** Warrior build: four actives at mixed ranks + two passives (a synergy pair and its hints). */
const BUILD = [
  ['ground_slam', 3],
  ['whirlwind', 2],
  ['cleave', 2],
  ['war_cry', 1],
  ['battle_fury', 2],
  ['power', 1],
];

async function session({ viewport, deviceScaleFactor, isMobile, hasTouch, prefix }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor, isMobile, hasTouch });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const full = { x: 0, y: 0, width: viewport.width, height: viewport.height };
  const shot = (name, clip = full) =>
    page.screenshot({
      path: `${out}/${tag}-${prefix}${name}.jpg`,
      type: 'jpeg',
      quality: 72,
      clip,
    });
  const command = (a) => page.evaluate((x) => window.__alpha.command(x), a);
  const state = () => page.evaluate(() => window.__alpha.state());
  const advance = (s) => page.evaluate((x) => window.__alpha.advance(x), s);
  /** Takes the first card of every pending level-up offer. */
  async function takeOffers() {
    for (let guard = 0; guard < 40; guard++) {
      const o = (await state()).world?.skills.offer;
      if (!o) return;
      const c = o.cards[0];
      await command({
        type: 'choose-skill',
        card: c.kind === 'skill' ? c.skillId : `bonus:${c.bonusId}`,
      });
    }
  }

  const nav = page.getByRole('navigation', { name: 'Main menu' });
  await page.clock.install();
  await page.goto(base + '/?debug');
  await nav.waitFor();
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('skazki.profile'));
    p.completedMaps = [1];
    p.highestUnlockedMap = 2;
    localStorage.setItem('skazki.profile', JSON.stringify(p));
  });
  await page.goto(base + '/?debug');
  await nav.waitFor();
  await page.getByRole('button', { name: /^Start run · map 2\b/ }).click();
  await page.waitForFunction(() => window.__alpha?.state().screen === 'playing');
  // Only `__alpha.advance` moves the world from here on (no level-ups between steps and shots).
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
  await page
    .getByRole('button', { name: 'Hide' })
    .click({ timeout: 2000 })
    .catch(() => {});
  await command({ type: 'protection', enabled: true });
  await command({ type: 'spawning', settings: { enabled: false } });
  await command({ type: 'clear-enemies' });
  for (const [skillId, rank] of BUILD) await command({ type: 'grant-skill', skillId, rank });
  // Enemies in range so the actives fire and their cooldowns run (and damage sources fill up);
  // 7 s of world time also lets the synergy banners fade before the HUD shot.
  await command({ type: 'spawn-n', kind: 'melee', count: 24, distance: 120 });
  for (let i = 0; i < 28; i++) {
    await advance(0.25);
    await takeOffers();
  }
  await page.waitForTimeout(300);
  await shot('hud');
  if (!isMobile) await shot('hud-skills', { x: 0, y: 520, width: 640, height: 200 });

  // Level-up offer: small XP grants until the next level opens an offer.
  for (let i = 0; i < 40 && !(await state()).world?.skills.offer; i++) {
    await command({ type: 'grant-xp', amount: 20 });
    await advance(0.05);
  }
  await page.waitForTimeout(400);
  await shot('offer');
  await takeOffers();
  if (!isMobile) {
    await page.keyboard.press('p');
    const pause = page.locator('.pause-panel');
    await pause.waitFor();
    await page.waitForTimeout(300);
    await shot('pause');
    // The synergy pairs and hints sit below the skill lists.
    await page.locator('.pause-skills > *').last().scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot('pause-bottom');
    await page.keyboard.press('p');

    await command({ type: 'campaign-force', outcome: 'victory' });
    await page.getByRole('dialog', { name: 'Victory.' }).waitFor();
    await page.waitForTimeout(400);
    await shot('results');
  }
  await context.close();
}

await session({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 2,
  isMobile: false,
  hasTouch: false,
  prefix: '',
});
await session({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  prefix: 'phone-',
});

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`art pack 3 screens (${tag}) written to ${out}/`);
