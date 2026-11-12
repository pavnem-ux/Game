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
  await touch('touchEnd', [{ x: ox + 80, y: oy, id: 1 }]);
  await page.waitForTimeout(60);
  await advance(0.3);
  let s = await state();
  assert.equal(s.world.dash.used, before + 1, 'dash button = one dash');
  // The joystick finger is still down: the hero keeps moving after the dash tap.
  const x1 = s.world.playerBody.x;
  await advance(0.5);
  assert.ok((await state()).world.playerBody.x > x1 + 40, 'joystick kept working during the tap');
  await touch('touchEnd', []);
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

await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
console.log('PASS mobile: touch joystick, dash button (= Space), multi-touch joystick + dash.');
