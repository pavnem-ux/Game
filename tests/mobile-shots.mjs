import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

/**
 * Task 16: menu and in-run screenshots at phone/tablet/desktop sizes with touch emulation (for the
 * before/after comparison). Not a test: run against a dev server; output goes to the ignored
 * `artifacts/mobile/`.
 *
 *   SHOT_PREFIX=before node tests/mobile-shots.mjs
 */
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
const prefix = process.env.SHOT_PREFIX || 'shot';
const out = 'artifacts/mobile';
const sizes = [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 720 },
];
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
});
const errors = [];
for (const size of sizes) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    hasTouch: true,
    isMobile: size.width < 1024,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${size.name}: ${e}`));
  await page.goto(base + '/?debug');
  await page.waitForFunction(() => !!window.__alpha);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${prefix}-${size.name}-menu.png` });
  await page.evaluate(() =>
    window.__alpha.command({
      type: 'restart',
      options: { characterClass: 'archer', level: 10, campaign: { mapId: 3 } },
    }),
  );
  // Portrait phones show «Rotate your device» and pause the run (expected).
  await page.waitForFunction(() => window.__alpha.state().screen !== 'menu');
  await page.evaluate(() => window.__alpha.command({ type: 'protection', enabled: true }));
  await page.evaluate(() => window.__alpha.command({ type: 'group', count: 12, distance: 220 }));
  await page.evaluate(() => window.__alpha.advance(2));
  const hide = page.getByRole('button', { name: 'Hide' });
  await hide.waitFor({ timeout: 3000 }).catch(() => undefined);
  if (await hide.count()) await hide.click().catch(() => undefined);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${prefix}-${size.name}-run.png` });
  await context.close();
}
await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
console.log(`Saved ${prefix}-*.png to ${out}/`);
