import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { checkSkillsAccess } from './skills-ui-browser.mjs';
import { checkQaTools } from './qa-tools-browser.mjs';

await mkdir('artifacts', { recursive: true });
const html = await readFile('dist-qa/index.html', 'utf8');
assert.ok(!html.includes('/src/'), 'QA serves a compiled static build');
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--outDir',
    'dist-qa',
    '--host',
    '127.0.0.1',
    '--port',
    '4189',
    '--strictPort',
  ],
  { stdio: 'pipe' },
);
let logs = '';
server.stdout.on('data', (b) => {
  logs += b;
});
server.stderr.on('data', (b) => {
  logs += b;
});
let browser;
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch('http://127.0.0.1:4189/')).ok) break;
    } catch {}
    if (i > 100 || server.exitCode !== null) throw new Error('QA preview failed: ' + logs);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4189/?debug');
  await page.waitForFunction(() => !!window.__alpha);
  await page.getByText('QA PREVIEW', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Маг Посох', exact: false }).click();
  await page.getByRole('button', { name: 'Начать забег' }).click();
  const state = () => page.evaluate(() => window.__alpha.state());
  const command = (action) => page.evaluate((a) => window.__alpha.command(a), action);
  await command({ type: 'clear-enemies' });
  await command({ type: 'spawning', settings: { enabled: false } });
  await command({ type: 'protection', enabled: true });
  await page.getByRole('button', { name: 'QA · Тестирование' }).click();
  await page.getByLabel('DEV навык').selectOption('fireball');
  await page.getByRole('button', { name: 'Выдать навык', exact: true }).click();
  assert.equal((await state()).world.skills.owned.find((s) => s.skillId === 'fireball').rank, 1);
  await page.getByRole('button', { name: /^Улучшить / }).click();
  assert.equal((await state()).world.skills.owned.find((s) => s.skillId === 'fireball').rank, 2);
  await page.getByLabel('Тестовое HP').fill('40');
  await page.getByRole('button', { name: 'Установить HP' }).click();
  const max = (await state()).world.player.maxHp;
  await page.getByRole('button', { name: 'Следующий уровень забега' }).click();
  assert.equal((await state()).world.player.currentHp, Math.min(max, 40 + max * 0.15));
  assert.equal((await state()).world.progression.level, 2);
  await page.getByRole('button', { name: 'QA · Закрыть' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Перебросить · осталось 3/ })
    .waitFor();
  await page.locator('.skill-card').first().click();
  await command({ type: 'grant-skill', skillId: 'elemental_mastery', rank: 1 });
  // Presentation rounds HP without changing the Core value.
  await command({ type: 'hp', value: (await state()).world.player.maxHp });
  await page.getByRole('button', { name: 'Обзор навыков', exact: true }).click();
  const overview = page.getByRole('complementary', { name: 'Обзор навыков', exact: true });
  await overview.waitFor();
  await overview.getByRole('region', { name: 'Автоматические навыки' }).waitFor();
  await overview.getByRole('region', { name: 'Пассивные навыки' }).waitFor();
  assert.ok((await overview.innerText()).includes('Свободных слотов:'));
  assert.ok(
    (await overview.innerText()).includes('Перезарядка:') ||
      (await overview.innerText()).includes('Готов'),
  );
  const before = (await state()).world.time;
  await command({ type: 'spawn', kind: 'melee', distance: 300 });
  await page.evaluate(() => window.__alpha.advance(0.2));
  assert.ok(
    (await state()).world.time >= before + 0.2,
    'read-only overview leaves simulation running',
  );
  assert.ok(
    (await state()).world.skillCombat.cooldowns.fireball > 0,
    'automatic skill starts its cooldown',
  );
  assert.match(
    await overview.getByLabel('Перезарядка: Огненный шар', { exact: true }).innerText(),
    /Перезарядка: \d+\.\d с/,
  );
  await command({ type: 'clear-enemies' });
  await command({ type: 'hp', value: (await state()).world.player.maxHp - 1 });
  await command({ type: 'grant-xp', amount: 30 });
  await page.getByRole('button', { name: 'Закрыть обзор навыков' }).click();
  await page.locator('.skill-card').first().click();
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  await page.getByRole('button', { name: 'Обзор навыков', exact: true }).click();
  const label = await page.locator('.health-label > span').innerText();
  assert.match(label, /^\d+ \/ \d+ HP$/, 'HUD uses whole HP');
  const [current, maximum] = label.match(/\d+/g).map(Number);
  assert.ok(current <= maximum);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const paused = (await state()).world.time;
  await page.waitForTimeout(150);
  assert.equal((await state()).world.time, paused, 'overview does not override manual pause');
  // Task 07.3: the quick-look folds into the Pause screen, which shows Skills inline.
  await overview.waitFor({ state: 'detached' });
  await page.getByRole('region', { name: 'Обзор навыков', exact: true }).waitFor();
  assert.equal((await state()).screen, 'paused');
  await page.getByRole('button', { name: 'Продолжить', exact: false }).click();
  await page.getByRole('button', { name: 'Обзор навыков', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const box = await overview.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390, 'skill overview fits mobile viewport');
  await page.screenshot({ path: 'artifacts/alpha-13-qa-skills-mobile.png' });
  await page.getByRole('button', { name: 'Закрыть обзор навыков' }).click();
  await checkSkillsAccess(page);
  await checkQaTools(page);
  await page.goto('http://127.0.0.1:4189/?prototype&debug');
  await page.getByRole('button', { name: 'Войти в руины' }).waitFor();
  assert.equal(
    await page.evaluate(() => typeof window.__survivors),
    'undefined',
    'QA does not enable legacy debug tools',
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS QA static build: panel, XP/level healing, skills/ranks/cooldowns/slots, whole HP, paused and queued-level Skills access on desktop/mobile, actual Stun badges, exact synergy diagnostics/reset and God Mode ON/OFF/new-run reset; legacy debug remains excluded.',
  );
} finally {
  await browser?.close();
  server.kill();
}
