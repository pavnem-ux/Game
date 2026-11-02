import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

/** Task 08 campaign UI (dev server): menu, pages, campaign runs, results, persistence. */
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/');
  await page.evaluate(() => localStorage.clear());
  await page.goto(base + '/?debug');
  await page.waitForFunction(() => !!window.__alpha);
  const state = () => page.evaluate(() => window.__alpha.state());
  const nav = page.getByRole('navigation', { name: 'Главное меню' });

  // 5.1 Main menu: navigation and Gold.
  await nav.waitFor();
  for (const tab of ['Играть', 'Персонаж', 'Карты', 'Прогресс', 'Настройки'])
    assert.equal(await nav.getByRole('button', { name: tab, exact: true }).count(), 1, tab);
  assert.equal(await page.getByLabel('Золото: 0').count(), 1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.profile')));
  assert.equal(saved.highestUnlockedMap, 1, 'a new profile is persisted on first launch');

  // 5.2 Character page.
  await nav.getByRole('button', { name: 'Персонаж', exact: true }).click();
  const cards = page.locator('.character-card');
  assert.equal(await cards.count(), 4);
  assert.match(await cards.first().innerText(), /Уровень 1 \/ 50 · XP 0 \/ 100/);
  assert.match(await cards.first().innerText(), /Очки талантов\s+0/);
  await page
    .getByRole('article', { name: /Лучник/ })
    .getByRole('button', { name: 'Выбрать' })
    .click();
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.profile')).selectedClass),
    'archer',
  );
  await page.screenshot({ path: 'artifacts/campaign-01-character.png', fullPage: true });

  // 5.2 Maps page: lock state; boss hidden while locked; locked maps cannot start.
  await nav.getByRole('button', { name: 'Карты', exact: true }).click();
  const maps = page.locator('.map-card');
  assert.equal(await maps.count(), 10);
  assert.match(await maps.nth(0).innerText(), /Открыта[\s\S]*Терновый страж/);
  assert.match(await maps.nth(1).innerText(), /Закрыта[\s\S]*Босс: \?\?\?/);
  assert.equal(await page.getByRole('button', { name: 'Играть: карта 2', exact: true }).isDisabled(), true);
  await page.screenshot({ path: 'artifacts/campaign-02-maps.png', fullPage: true });
  await page.getByRole('button', { name: 'Играть: карта 1', exact: true }).click();
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  let s = await state();
  assert.equal(s.world.campaign.mapId, 1);
  assert.equal(s.world.character.characterClass, 'archer');
  assert.match(s.world.campaign.runId, /^run-/);

  if (errors.length) throw new Error(errors.join('\n'));
  console.log(
    'PASS campaign: menu/Gold, Character page, Maps page (lock, boss reveal), campaign start.',
  );
} finally {
  await browser.close();
}
