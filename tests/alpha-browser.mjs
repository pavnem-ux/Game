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
  assert.equal((await state()).screen, 'playing');
  // Regression: keys pressed in the same frame as P/Esc must not replay the pause toggle
  // (Phaser re-scans its key queue on every key event until the next game step).
  const sameFrame = await page.evaluate(() => {
    const key = (type, key, code, keyCode) =>
      document.body.dispatchEvent(new KeyboardEvent(type, { key, code, keyCode, bubbles: true }));
    const screens = [];
    key('keydown', 'Escape', 'Escape', 27);
    key('keyup', 'Escape', 'Escape', 27);
    screens.push(window.__alpha.state().screen);
    for (const [k, code, keyCode] of [
      ['d', 'KeyD', 68],
      ['w', 'KeyW', 87],
    ]) {
      key('keydown', k, code, keyCode);
      screens.push(window.__alpha.state().screen);
      key('keyup', k, code, keyCode);
      screens.push(window.__alpha.state().screen);
    }
    key('keydown', 'Escape', 'Escape', 27);
    key('keyup', 'Escape', 'Escape', 27);
    screens.push(window.__alpha.state().screen);
    return screens;
  });
  assert.deepEqual(sameFrame, ['paused', 'paused', 'paused', 'paused', 'paused', 'playing']);
  // The normal hidden-page auto-pause is unchanged.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
  });
  assert.equal((await state()).screen, 'paused', 'hidden document pauses the alpha');
  await page.keyboard.press('p');
  assert.equal((await state()).screen, 'playing');
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
    positions = s.world.enemies.map((e) => ({ id: e.entityId, position: e.position })),
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
  for (const previous of positions) {
    const current = s.world.enemies.find((e) => e.entityId === previous.id);
    if (current)
      assert.ok(
        Math.hypot(
          current.position.x - previous.position.x,
          current.position.y - previous.position.y,
        ) <=
          101 * (s.world.time - dead.world.time) + 1e-7,
        'revival preserves positions before ordinary resumed movement',
      );
  }
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
  // Real enemy deaths drop persistent crystals; collect them by moving, without granting XP.
  await command({
    type: 'restart',
    options: {
      characterClass: 'warrior',
      level: 50,
      initialEnemies: false,
      spawning: { enabled: false },
    },
  });
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await command({ type: 'group', count: 2, distance: 80 });
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.evaluate(() => window.__alpha.advance(1));
  s = await state();
  assert.ok(s.world.crystals.length > 0, 'real death crystals remain in the world');
  const permanent = s.world.character.permanentLevel,
    maxHp = s.world.player.maxHp;
  // Walk to real crystals with simulated input, exercising the same pickup API as normal play.
  for (let i = 0; i < 100; i++) {
    s = await state();
    if (s.world.progression.totalXp >= 20) break;
    const crystal = s.world.crystals[0];
    if (!crystal) {
      await page.evaluate(() => window.__alpha.advance(0.1));
      continue;
    }
    const dx = crystal.x - s.world.playerBody.x,
      dy = crystal.y - s.world.playerBody.y;
    const keys = [];
    if (Math.abs(dx) > 8) keys.push(dx > 0 ? 'd' : 'a');
    if (Math.abs(dy) > 8) keys.push(dy > 0 ? 's' : 'w');
    for (const key of keys) await page.keyboard.down(key);
    await page.evaluate(() => window.__alpha.advance(0.1));
    for (const key of keys) await page.keyboard.up(key);
  }
  s = await state();
  assert.ok(s.world.progression.level >= 2, 'collectible XP raises only run level');
  assert.equal(s.world.character.permanentLevel, permanent);
  assert.equal(s.world.player.maxHp, maxHp);
  await page.getByRole('progressbar', { name: 'Опыт забега' }).waitFor();
  await page.screenshot({ path: 'artifacts/alpha-10-xp.png' });
  await page.getByRole('button', { name: 'DEV · Тестирование' }).click();
  await page.getByLabel('DEV XP').fill('20');
  const totalBefore = (await state()).world.progression.totalXp;
  await page.getByRole('button', { name: 'Выдать XP', exact: true }).click();
  assert.ok(
    (await state()).world.progression.totalXp >= totalBefore + 20,
    'interactive DEV XP control',
  );
  await page.getByRole('button', { name: 'DEV · Закрыть' }).click();
  await command({
    type: 'restart',
    options: {
      characterClass: 'mage',
      initialEnemies: false,
      spawning: { interval: 1, minimumInterval: 1, count: 3, maximumCount: 3, maxActive: 6 },
    },
  });
  await command({ type: 'protection', enabled: true });
  await page.evaluate(() => window.__alpha.advance(1));
  s = await state();
  assert.equal(s.world.enemies.length, 3);
  const view = s.world.spawning.viewport;
  for (const e of s.world.enemies)
    assert.ok(
      Math.abs(e.position.x - s.world.playerBody.x) >= view.width / 2 ||
        Math.abs(e.position.y - s.world.playerBody.y) >= view.height / 2,
      'new wave spawns off screen',
    );
  await page.evaluate(() => window.__alpha.advance(2));
  s = await state();
  assert.equal(s.world.spawning.waves, 3);
  assert.ok(s.world.enemies.length <= 6);
  await page.screenshot({ path: 'artifacts/alpha-11-waves.png' });
  // Task 07: real level-up dialog, reroll and skill choice for every class.
  for (const characterClass of ['warrior', 'mage', 'archer', 'rogue']) {
    await command({
      type: 'restart',
      options: { characterClass, initialEnemies: false, spawning: { enabled: false } },
    });
    await command({ type: 'protection', enabled: true });
    await command({ type: 'grant-xp', amount: 20 });
    await page.getByRole('dialog', { name: /Уровень забега 2/ }).waitFor();
    if (characterClass === 'warrior')
      await page.screenshot({ path: 'artifacts/alpha-12-level-up.png' });
    s = await state();
    assert.equal(s.screen, 'level-up');
    assert.equal(s.world.paused, true, 'level-up pauses the world');
    assert.equal(s.world.skills.offer.cards.length, 3);
    assert.ok(s.world.skills.offer.cards.every((c) => c.kind === 'skill' && c.isNew));
    const frozen = s.world.time;
    await page.evaluate(() => window.__alpha.advance(1));
    assert.equal((await state()).world.time, frozen, 'no simulation while choosing');
    await page.getByRole('button', { name: /Перебросить · осталось 3/ }).click();
    assert.equal((await state()).world.skills.rerolls, 2);
    const first = (await state()).world.skills.offer.cards[0];
    await page.getByRole('listitem', { name: new RegExp(first.name) }).click();
    s = await state();
    assert.equal(s.screen, 'playing');
    assert.equal(s.world.skills.owned[0].skillId, first.skillId);
    assert.equal(s.world.skills.owned[0].rank, 1);
    await page.getByLabel('Навыки забега').waitFor();
    if (characterClass === 'mage') {
      await command({ type: 'grant-skill', skillId: 'frost_nova', rank: 5 });
      await command({ type: 'group', count: 6, distance: 90 });
      await page.evaluate(() => window.__alpha.advance(1.5));
      s = await state();
      assert.ok(
        s.events.some((e) => e.channel === 'skill' && e.event.type === 'skill-activated'),
        'automatic skill activates without input',
      );
      await page.screenshot({ path: 'artifacts/alpha-12-skills.png' });
    }
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
    'PASS alpha: class selection, all four weapons, both enemies, actual damage, WASD/joystick, interactive DEV, status cap, pause, same-world revival, second death, bounded enemy group, collectible death XP/run levels, DEV XP, continuous off-screen waves, level-up skill choice/reroll for all classes and automatic skills; no browser exceptions.',
  );
} finally {
  await browser.close();
}
