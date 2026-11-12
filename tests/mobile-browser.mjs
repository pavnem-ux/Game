import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

/**
 * Task 16 mobile e2e (Chromium device emulation with touch): touch joystick moves the hero, the
 * dash button dashes (same as Space), multi-touch keeps the joystick while tapping dash.
 * Needs a dev server (`/?debug`). CHROMIUM_PATH / GAME_URL as the other browser tests.
 */
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
});
const errors = [];

async function open(viewport) {
  const context = await browser.newContext({
    viewport,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + '/?debug');
  await page.waitForFunction(() => !!window.__alpha);
  const cdp = await context.newCDPSession(page);
  const state = () => page.evaluate(() => window.__alpha.state());
  const command = (a) => page.evaluate((x) => window.__alpha.command(x), a);
  const advance = (s) => page.evaluate((x) => window.__alpha.advance(x), s);
  /** Raw multi-touch through CDP (each point: {x, y, id}). */
  const touch = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4 })),
    });
  return { context, page, state, command, advance, touch };
}

// ── Phase 1: touch input on a landscape phone ──
{
  const { context, page, state, command, advance, touch } = await open({ width: 844, height: 390 });
  await command({
    type: 'restart',
    options: {
      characterClass: 'mage',
      level: 10,
      initialEnemies: false,
      spawning: { enabled: false },
    },
  });
  await command({ type: 'protection', enabled: true });
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  // The debug overlay (debug builds only) covers the joystick zone: collapse it.
  await page.getByRole('button', { name: 'Скрыть' }).click(); // lazy-loaded: wait for it
  const canvas = await page.locator('.game-canvas canvas').boundingBox();
  // Joystick: touch the left half, drag 80 px right (full speed), hold.
  const visibleBottom = Math.min(canvas.y + canvas.height, page.viewportSize().height);
  const ox = canvas.x + 150,
    oy = canvas.y + (visibleBottom - canvas.y) * 0.8;
  const start = (await state()).world.playerBody.x;
  await touch('touchStart', [{ x: ox, y: oy, id: 1 }]);
  await touch('touchMove', [{ x: ox + 80, y: oy, id: 1 }]);
  await page.waitForTimeout(60);
  await advance(1);
  const moved = (await state()).world.playerBody.x - start;
  assert.ok(moved > 100, `joystick moved the hero right (${moved})`);
  // Multi-touch: tap the dash button with a second finger while the joystick is held.
  const dash = page.locator('.touch-dash');
  await dash.waitFor();
  const box = await dash.boundingBox();
  assert.ok(box.width >= 72 && box.height >= 72, 'dash button ≥ 72 px');
  assert.ok(box.x + box.width > canvas.x + canvas.width * 0.6, 'dash button on the right');
  const before = (await state()).world.dash.used;
  await touch('touchStart', [
    { x: ox + 80, y: oy, id: 1 },
    { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 2 },
  ]);
  // CDP touchEnd lists the points being released: lift only the dash finger.
  await touch('touchEnd', [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 2 }]);
  await page.waitForTimeout(60);
  await advance(0.3);
  let s = await state();
  assert.equal(s.world.dash.used, before + 1, 'dash button = one dash');
  // The joystick finger is still down: the hero keeps moving after the dash tap.
  const x1 = s.world.playerBody.x;
  await advance(0.5);
  assert.ok((await state()).world.playerBody.x > x1 + 40, 'joystick kept working during the tap');
  await touch('touchEnd', [{ x: ox + 80, y: oy, id: 1 }]);
  await page.waitForTimeout(60);
  await advance(0.3);
  const x2 = (await state()).world.playerBody.x;
  await advance(0.5);
  assert.equal((await state()).world.playerBody.x, x2, 'released joystick stops the hero');
  // Dash button and Space give the same dash (distance and cooldown).
  await command({ type: 'dash-cooldown', seconds: 0 });
  const k0 = (await state()).world.playerBody.x;
  await page.keyboard.press('Space');
  await page.waitForTimeout(60);
  await advance(0.3);
  const byKey = (await state()).world.playerBody.x - k0;
  const b0 = (await state()).world.playerBody.x;
  await dash.tap();
  await page.waitForTimeout(60);
  await advance(0.3);
  const byButton = (await state()).world.playerBody.x - b0;
  assert.ok(Math.abs(byKey - byButton) < 1e-6, `same dash distance (${byKey} vs ${byButton})`);
  await context.close();
}

// ── Phase 2: a whole run and every menu screen, landscape phone and tablet ──
const MENU_PAGES = [
  'Главная',
  'Персонаж',
  'Экипировка',
  'Таланты',
  'Магазин',
  'Кузница',
  'Карта похода',
  'Прогресс',
  'Настройки',
];
async function noHorizontalScroll(page, where) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(over <= 0, `${where}: no horizontal page scroll (${over})`);
}
async function tapTarget(locator, what) {
  const box = await locator.boundingBox();
  assert.ok(box && box.height >= 44 && box.width >= 44, `${what} is a ≥ 44 px tap target`);
  return box;
}
for (const viewport of [
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
]) {
  const tag = `${viewport.width}×${viewport.height}`;
  const { context, page, state, command, advance, touch } = await open(viewport);
  // Start a map from the hub (touch tap on «Начать забег · карта N»).
  const start = page.getByRole('button', { name: /^Начать забег · карта/ });
  await tapTarget(start, `${tag} hub start`);
  await start.tap();
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  await command({ type: 'protection', enabled: true });
  await page.getByRole('button', { name: 'Скрыть' }).click();
  await noHorizontalScroll(page, `${tag} run`);
  // The arena fills the viewport (no outer header/footer on phones).
  const canvas = await page.locator('.game-canvas canvas').boundingBox();
  assert.ok(canvas.y + canvas.height <= viewport.height + 1, `${tag}: arena fits the screen`);
  // Move with the joystick.
  const ox = canvas.x + Math.min(160, canvas.width * 0.2),
    oy = canvas.y + canvas.height * 0.75;
  const x0 = (await state()).world.playerBody.x;
  await touch('touchStart', [{ x: ox, y: oy, id: 1 }]);
  await touch('touchMove', [{ x: ox + 70, y: oy, id: 1 }]);
  await page.waitForTimeout(80);
  await advance(0.6);
  await touch('touchEnd', [{ x: ox + 70, y: oy, id: 1 }]);
  await page.waitForTimeout(80);
  assert.ok((await state()).world.playerBody.x > x0 + 50, `${tag}: joystick moves`);
  // Dash with the button.
  const dash = page.locator('.touch-dash');
  await tapTarget(dash, `${tag} dash button`);
  const used = (await state()).world.dash.used;
  await dash.tap();
  await page.waitForTimeout(80);
  await advance(0.3);
  assert.equal((await state()).world.dash.used, used + 1, `${tag}: dash button dashes`);
  // Pick a level-up card by tapping it; the controls are tap targets.
  await command({ type: 'grant-xp', amount: 20 });
  await page.waitForFunction(() => window.__alpha.state().screen === 'level-up');
  await tapTarget(page.getByRole('button', { name: /^Перебросить/ }), `${tag} reroll`);
  const card = page.locator('.upgrade-grid .skill-card').first();
  await card.scrollIntoViewIfNeeded();
  await tapTarget(card, `${tag} card`);
  await card.tap();
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  assert.equal((await state()).world.skills.pendingChoices, 0, `${tag}: card picked`);
  // Pause button is a tap target.
  await tapTarget(page.getByRole('button', { name: 'Пауза', exact: true }), `${tag} pause`);
  // Finish via debug → results → back to the menu.
  await command({ type: 'campaign-force', outcome: 'victory' });
  await page.waitForFunction(() => window.__alpha.state().screen === 'results');
  await noHorizontalScroll(page, `${tag} results`);
  for (const name of ['Ещё раз →', 'В меню']) {
    const button = page.locator('.results-actions').getByRole('button', { name, exact: true });
    await button.scrollIntoViewIfNeeded();
    await tapTarget(button, `${tag} results «${name}»`);
  }
  await page.locator('.results-actions').getByRole('button', { name: 'В меню' }).tap();
  await page.waitForFunction(() => window.__alpha.state().screen === 'menu');
  // Menus: every screen opens without horizontal scroll; nav items are tap targets.
  for (const name of MENU_PAGES) {
    const nav = page.locator('.meta-nav').getByRole('button', { name, exact: true });
    await nav.scrollIntoViewIfNeeded();
    await tapTarget(nav, `${tag} nav «${name}»`);
    await nav.tap();
    await page.waitForTimeout(150);
    await noHorizontalScroll(page, `${tag} ${name}`);
  }
  await context.close();
}

await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
console.log(
  'PASS mobile: touch joystick, dash button (= Space), multi-touch; 844×390 and 768×1024: run from the hub, move, dash, pick a card, results, all menu screens without horizontal scroll, tap targets ≥ 44 px.',
);
