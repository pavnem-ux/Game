import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4179',
    '--strictPort',
  ],
  { stdio: 'pipe' },
);
let logs = '';
server.stderr.on('data', (b) => {
  logs += b;
});
server.stdout.on('data', (b) => {
  logs += b;
});
let browser;
try {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch('http://127.0.0.1:4179/');
      if (r.ok) break;
    } catch {}
    if (i > 100 || server.exitCode !== null) throw new Error('Preview failed: ' + logs);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:4179/?debug');
  await page.getByRole('button', { name: 'Начать забег' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /DEV ·/ }).count(), 0);
  assert.equal(await page.evaluate(() => typeof window.__alpha), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.__survivors), 'undefined');
  assert.equal(await page.getByLabel('Стартовый уровень').count(), 0);
  await page.getByRole('button', { name: 'Маг Посох', exact: false }).click();
  await page.getByRole('button', { name: 'Начать забег' }).click();
  await page.getByRole('progressbar', { name: 'Здоровье' }).waitFor();
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.getByRole('button', { name: 'Продолжить' }).waitFor();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.screenshot({ path: 'artifacts/alpha-09-production.png' });
  for (const file of await readdir('dist/assets'))
    if (file.endsWith('.js')) {
      const source = await readFile('dist/assets/' + file, 'utf8');
      assert.ok(
        !source.includes('Developer Testing Mode'),
        'debug UI code eliminated from production JS',
      );
      assert.ok(
        !source.includes('Unknown test action.'),
        'testing controller eliminated from production JS',
      );
      assert.ok(!source.includes('__alpha'), 'alpha debug bridge eliminated from production JS');
      assert.ok(
        !source.includes('__survivors'),
        'legacy debug bridge eliminated from production JS',
      );
    }
  assert.deepEqual(errors, []);
  console.log(
    'PASS production: playable Mage, pause/resume; ?debug exposes no testing controls, globals or testing controller code.',
  );
} finally {
  await browser?.close();
  server.kill();
}
