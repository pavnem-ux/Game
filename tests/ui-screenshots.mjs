import { chromium } from 'playwright-core';
import { mkdir, readFile } from 'node:fs/promises';
import { brand, goTo } from './e2e-nav.mjs';

/**
 * Task 13: screenshots of every meta screen with the showcase profile
 * (`tests/fixtures/ui-showcase-profile.json`) for the before/after comparison. Not a test: run
 * against a dev server, output goes to the ignored `artifacts/`.
 *
 *   SHOT_PREFIX=before SHOT_SIZES=1280x720 node tests/ui-screenshots.mjs
 *
 * `SHOT_PAGES` lists the menu pages as `<file name>:<navigation button>`; the defaults match the
 * menu at the time of the run (override after the redesign renames pages).
 */
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
const prefix = process.env.SHOT_PREFIX || 'shot';
const sizes = (process.env.SHOT_SIZES || '1280x720')
  .split(',')
  .map((s) => s.split('x').map(Number));
const pages = (
  process.env.SHOT_PAGES ||
  'hub:Play,character:Hero,maps:Maps,shop:Shop,progression:Progress,settings:Settings'
)
  .split(',')
  .map((p) => p.split(':'));
const profile = await readFile('tests/fixtures/ui-showcase-profile.json', 'utf8');
await mkdir('artifacts/ui', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors = [];
try {
  for (const [width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/');
    await page.evaluate((json) => {
      localStorage.clear();
      localStorage.setItem('skazki.profile', json);
    }, profile);
    await page.goto(base + '/');
    const nav = brand(page);
    await nav.waitFor();
    for (const [file, label] of pages) {
      await goTo(page, label);
      await page.waitForTimeout(350); // let entry transitions settle
      const path = `artifacts/ui/${prefix}-${file}-${width}x${height}.png`;
      await page.screenshot({ path, fullPage: true });
      console.log(path);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
if (errors.length) {
  console.error('Page errors:', errors);
  process.exit(1);
}
