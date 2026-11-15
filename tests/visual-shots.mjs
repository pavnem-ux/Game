import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

/**
 * Task 18: arena screenshots for the visual before/after comparison (maps 1, 15, 25, 35 and a boss
 * phase). Not a test: run against a dev server (`/?debug`); output goes to the ignored `artifacts/`.
 *
 *   SHOT_PREFIX=before node tests/visual-shots.mjs
 *   SHOT_PREFIX=after SHOT_QUALITY=low node tests/visual-shots.mjs
 *
 * `SHOT_QUALITY` (high / medium / low) is stored in the settings before loading (ignored by builds
 * without the setting).
 */
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
const prefix = process.env.SHOT_PREFIX || 'shot';
const quality = process.env.SHOT_QUALITY || '';
const out = 'artifacts/visuals';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
if (quality)
  await page.addInitScript((q) => {
    const raw = localStorage.getItem('skazki.settings');
    const s = raw ? JSON.parse(raw) : {};
    localStorage.setItem('skazki.settings', JSON.stringify({ ...s, graphicsQuality: q }));
  }, quality);
await page.goto(base + '/?debug');
await page.waitForFunction(() => !!window.__alpha);
await page.getByRole('button', { name: 'Warrior Sword', exact: false }).click();
await page.getByRole('button', { name: 'Start run' }).click();
await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
const command = (a) => page.evaluate((x) => window.__alpha.command(x), a);
const advance = (s) => page.evaluate((x) => window.__alpha.advance(x), s);
const scene = async (mapId, characterClass, name, boss = false) => {
  await command({ type: 'restart', options: { characterClass, level: 30, campaign: { mapId } } });
  await command({ type: 'protection', enabled: true });
  await advance(boss ? 0.5 : 20);
  await command({ type: 'group', count: 18, distance: 260 });
  if (boss) {
    await command({ type: 'campaign-boss-now' });
    await advance(15);
  } else await advance(1);
  // Close level-up offers (auto-collected XP) so the arena is visible.
  for (let i = 0; i < 10; i++) {
    const offer = await page.evaluate(() => window.__alpha.state().world?.skills.offer ?? null);
    if (!offer) break;
    const card = offer.cards[0];
    await command({
      type: 'choose-skill',
      card: card.kind === 'skill' ? card.skillId : `bonus:${card.bonusId}`,
    });
  }
  // Hide the debug overlay so it does not cover the arena.
  const hide = page.getByRole('button', { name: 'Hide' });
  if (await hide.count()) await hide.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${prefix}-${name}.png` });
};
await scene(1, 'warrior', 'map01');
await scene(15, 'mage', 'map15');
await scene(25, 'archer', 'map25');
await scene(35, 'rogue', 'map35');
await scene(25, 'mage', 'boss', true);
await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
console.log(`Saved ${prefix}-*.png to ${out}/`);
