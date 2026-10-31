import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/?debug');
  await page.waitForFunction(() => !!window.__survivors);
  await page.screenshot({ path: 'artifacts/01-menu.png' });
  await page.getByRole('button', { name: 'Войти в руины' }).click();
  await page.waitForFunction(() => window.__survivors.state().phase === 'playing');
  const state = () => page.evaluate(() => window.__survivors.state());
  const before = await state();
  await page.keyboard.down('d');
  await page.waitForTimeout(400);
  await page.keyboard.up('d');
  assert.ok((await state()).x > before.x + 30, 'WASD movement');
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const paused = await state();
  await page.waitForTimeout(250);
  assert.equal((await state()).seconds, paused.seconds);
  await page.keyboard.press('p');
  assert.equal((await state()).phase, 'playing');
  await page.evaluate(() => window.__survivors.advance(6));
  assert.ok((await state()).kills > 0, 'automatic projectiles kill real enemies');
  // Walk towards a real dropped crystal; this exercises attraction and collection.
  for (let i = 0; i < 100; i++) {
    const s = await state();
    if (s.phase !== 'playing' || s.xp > 0 || s.level > 1) break;
    if (!s.gem) {
      await page.evaluate(() => window.__survivors.advance(0.1));
      continue;
    }
    const dx = s.gem.x - s.x,
      dy = s.gem.y - s.y;
    const keys = [];
    if (Math.abs(dx) > 12) keys.push(dx > 0 ? 'd' : 'a');
    if (Math.abs(dy) > 12) keys.push(dy > 0 ? 's' : 'w');
    for (const key of keys) await page.keyboard.down(key);
    await page.evaluate(() => window.__survivors.advance(0.1));
    for (const key of keys) await page.keyboard.up(key);
  }
  assert.ok(
    (await state()).xp > 0 || (await state()).level > 1,
    `real crystal collection awards XP: ${JSON.stringify(await state())}`,
  );
  if ((await state()).phase === 'upgrade') await page.locator('.upgrade-card').first().click();
  await page.screenshot({ path: 'artifacts/02-arena.png' });
  await page.evaluate(() => window.__survivors.grantXp(100));
  await page.getByRole('dialog', { name: 'Новый уровень.' }).waitFor();
  assert.equal(await page.locator('.upgrade-card').count(), 3);
  const upgradeTime = (await state()).seconds;
  await page.waitForTimeout(200);
  assert.equal((await state()).seconds, upgradeTime);
  await page.screenshot({ path: 'artifacts/03-upgrade.png' });
  let chosen = 0;
  while ((await state()).phase === 'upgrade' && chosen < 10) {
    await page.locator('.upgrade-card').first().click();
    chosen++;
  }
  assert.ok(chosen >= 2, 'queued levels each get a choice');
  assert.equal((await state()).phase, 'playing');
  await page.evaluate(() => window.__survivors.hurt(99999));
  await page.getByRole('heading', { name: 'Искра погасла.' }).waitFor();
  assert.equal((await state()).hp, 0);
  await page.screenshot({ path: 'artifacts/04-end.png' });
  const save = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('fantasy-survivors.progression')),
  );
  assert.equal(save.version, 1);
  assert.ok(save.runs >= 1);
  await page.getByRole('button', { name: 'Зажечь снова' }).click();
  const reset = await state();
  assert.equal(reset.hp, 100);
  assert.equal(reset.level, 1);
  assert.equal(reset.kills, 0);
  assert.equal(reset.xp, 0);
  assert.ok(reset.seconds < 1);
  await page.reload();
  await page.waitForFunction(() => !!window.__survivors);
  assert.ok(await page.locator('.record').count(), 'record survives reload');
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on('pageerror', (e) => errors.push(e.message));
  await mobile.goto(base + '/?debug');
  await mobile.waitForFunction(() => !!window.__survivors);
  await mobile.screenshot({ path: 'artifacts/05-mobile-menu.png' });
  assert.equal(
    await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await mobile.getByRole('button', { name: 'Войти в руины' }).click();
  const x = await mobile.evaluate(() => window.__survivors.state().x);
  await mobile.mouse.move(60, 500);
  await mobile.mouse.down();
  await mobile.mouse.move(120, 500, { steps: 5 });
  await mobile.waitForTimeout(400);
  await mobile.mouse.up();
  assert.ok(
    await mobile.evaluate((x) => window.__survivors.state().x > x + 15, x),
    'virtual joystick moves player',
  );
  await mobile.evaluate(() => window.__survivors.grantXp(12));
  await mobile.locator('.upgrade-card').first().waitFor();
  await mobile.screenshot({ path: 'artifacts/06-mobile-upgrade.png' });
  assert.equal(
    await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await mobile.locator('.upgrade-card').first().click();
  assert.equal(await mobile.evaluate(() => window.__survivors.state().phase), 'playing');
  await page.getByRole('button', { name: 'Войти в руины' }).click();
  await page.evaluate(() => window.__survivors.spawnEnemies(300));
  assert.ok((await state()).enemies <= 240);
  assert.ok((await state()).enemies >= 235);
  const frames = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let count = 0;
        const start = performance.now();
        function tick(t) {
          count++;
          if (t - start >= 1000) resolve(count);
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }),
  );
  await page.screenshot({ path: 'artifacts/07-stress.png' });
  console.log(
    `Stress: 240-enemy pool; ${frames} animation frames in approximately one second (headless Chromium).`,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: desktop movement, auto-combat, real XP pickup, pause, 3 choices, queued levels, death, restart, saved record, mobile joystick/layout; no browser exceptions.',
  );
} finally {
  await browser.close();
}
