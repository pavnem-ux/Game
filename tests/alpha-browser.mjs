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
  await page.waitForFunction(() => !!window.__alpha);
  await page.getByRole('heading', { name: 'Выберите свой свет.' }).waitFor();
  await page.screenshot({ path: 'artifacts/alpha-01-selection.png' });
  await page.getByRole('button', { name: 'Воин Меч', exact: false }).click();
  await page.getByRole('button', { name: 'Начать забег' }).click();
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  const state = () => page.evaluate(() => window.__alpha.state());
  const command = (action) => page.evaluate((a) => window.__alpha.command(a), action);
  let s = await state();
  assert.equal(s.world.character.characterClass, 'warrior');
  assert.ok(s.world.enemies.some((e) => e.config.behavior === 'melee'));
  assert.ok(s.world.enemies.some((e) => e.config.behavior === 'ranged'));
  const before = s.world.playerBody.x;
  await page.keyboard.down('d');
  await page.waitForTimeout(350);
  await page.keyboard.up('d');
  assert.ok((await state()).world.playerBody.x > before + 30, 'WASD moves integrated player');
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const paused = await state();
  await page.waitForTimeout(200);
  assert.equal((await state()).world.time, paused.world.time);
  await page.keyboard.press('p');
  await command({ type: 'protection', enabled: true });
  await command({ type: 'spawn', kind: 'melee', distance: 35 });
  await page.evaluate(() => window.__alpha.advance(1));
  assert.ok(
    (await state()).events.some(
      (e) => e.channel === 'combat' && e.event.type === 'damage' && e.event.targetId !== 'player',
    ),
    'actual sword damage',
  );
  await page.screenshot({ path: 'artifacts/alpha-02-warrior.png' });
  // Test the interactive panel, not only the automation bridge.
  await page.getByRole('button', { name: 'DEV · Тестирование' }).click();
  await page.getByRole('complementary', { name: 'Developer Testing Mode' }).waitFor();
  await page.getByLabel('DEV класс').selectOption('mage');
  await page.getByLabel('DEV уровень').fill('7');
  await page.getByRole('button', { name: 'Начать / повторить конфигурацию' }).click();
  await page.waitForFunction(
    () => window.__alpha.state().world.character.characterClass === 'mage',
  );
  assert.equal((await state()).world.character.permanentLevel, 7);
  await command({ type: 'protection', enabled: true });
  await page.waitForFunction(() => window.__alpha.state().world.playerProjectiles.length > 0);
  assert.equal((await state()).world.weapon.weapon.category, 'staff');
  await page.screenshot({ path: 'artifacts/alpha-03-developer.png' });
  await page.getByRole('button', { name: 'DEV · Закрыть' }).click();
  // Measured status cap/timers in the real loop; ordinary test protection disabled for effects.
  await command({ type: 'protection', enabled: false });
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await command({
    type: 'effect',
    targetId: 'player',
    effectType: 'poison',
    stacks: 12,
    damage: 1,
    duration: 6,
  });
  s = await state();
  assert.equal(s.world.statuses.find((g) => g.targetId === 'player').stacks.length, 10);
  const runId = s.runId,
    positions = s.world.enemies.map((e) => e.position),
    projectiles = s.world.enemyProjectiles;
  await command({ type: 'death' });
  await page.getByRole('button', { name: 'Воскреснуть · Revive' }).waitFor();
  const dead = await state();
  await page.waitForTimeout(250);
  assert.equal((await state()).world.time, dead.world.time);
  assert.deepEqual((await state()).world.enemyProjectiles, projectiles);
  await page.screenshot({ path: 'artifacts/alpha-04-death-choice.png' });
  await page.getByRole('button', { name: 'Воскреснуть · Revive' }).click();
  s = await state();
  assert.equal(s.runId, runId);
  assert.equal(s.world.survival.revivalUsed, true);
  assert.ok(s.world.player.currentHp <= s.world.player.maxHp / 2);
  assert.ok(s.world.player.currentHp > 0);
  assert.ok(s.world.survival.fullyProtected);
  assert.deepEqual(
    s.world.enemies.map((e) => e.position),
    positions,
  );
  assert.ok(s.world.statuses.every((g) => g.targetId !== 'player'));
  await page.screenshot({ path: 'artifacts/alpha-05-revival.png' });
  await command({ type: 'death' });
  await page.getByRole('heading', { name: 'Искра погасла.' }).waitFor();
  assert.equal((await state()).world.survival.runState, 'ended');
  await page.screenshot({ path: 'artifacts/alpha-06-ended.png' });
  for (const [characterClass, category] of [
    ['archer', 'bow'],
    ['rogue', 'dual_daggers'],
  ]) {
    await command({ type: 'restart', options: { characterClass, initialEnemies: false } });
    await command({ type: 'spawn', kind: 'melee', distance: 35 });
    await page.evaluate(() => window.__alpha.advance(0.5));
    s = await state();
    assert.equal(s.world.weapon.weapon.category, category);
    assert.ok(
      s.events.some(
        (e) => e.channel === 'combat' && e.event.type === 'damage' && e.event.targetId !== 'player',
      ),
    );
    if (characterClass === 'rogue')
      assert.ok(
        s.events.filter((e) => e.event.type === 'attack-started').length >= 2,
        'both dagger strikes',
      );
  }
  await command({ type: 'restart', options: { characterClass: 'mage', initialEnemies: false } });
  await command({ type: 'protection', enabled: true });
  for (let i = 0; i < 5; i++) await command({ type: 'group', count: 24, distance: 550 });
  const perf = await page.evaluate(async () => {
    let frames = 0;
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        frames++;
        if (performance.now() - start > 1200) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return {
      frames,
      elapsed: performance.now() - start,
      enemies: window.__alpha.state().world.enemies.length,
    };
  });
  console.log('Alpha performance:', JSON.stringify(perf));
  await page.screenshot({ path: 'artifacts/alpha-07-group.png' });
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on('pageerror', (e) => errors.push(e.message));
  await mobile.goto(base + '/?debug');
  await mobile.waitForFunction(() => !!window.__alpha);
  await mobile.getByRole('button', { name: 'Начать забег' }).click();
  await mobile.waitForFunction(() => window.__alpha.state().screen === 'playing');
  const x0 = await mobile.evaluate(() => window.__alpha.state().world.playerBody.x);
  const canvas = await mobile.locator('canvas').boundingBox();
  const client = await mobile.context().newCDPSession(mobile);
  const x = canvas.x + 60,
    y = canvas.y + canvas.height * 0.65;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 65, y }],
  });
  await mobile.waitForTimeout(300);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok(
    await mobile.evaluate((before) => window.__alpha.state().world.playerBody.x > before, x0),
    'integrated touchscreen joystick',
  );
  await mobile.screenshot({ path: 'artifacts/alpha-08-mobile.png' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS alpha: class selection, all four weapons, both enemies, actual damage, WASD/joystick, interactive DEV, status cap, pause, same-world revival, second death, bounded enemy group; no browser exceptions.',
  );
} finally {
  await browser.close();
}
