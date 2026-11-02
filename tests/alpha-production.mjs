import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
// Cloudflare Workers Builds uploads only dist/ (wrangler.jsonc assets.directory). SPA fallback
// comes from assets.not_found_handling; a root 404.html is still kept out of the artifact.
async function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory())
      files.push(...(await listFiles(join(directory, entry.name), relative + '/')));
    else files.push(relative);
  }
  return files;
}
const files = await listFiles('dist');
assert.ok(files.includes('index.html'), 'static entry point exists');
assert.ok(!files.includes('404.html'), 'no root 404.html in the deployed artifact');
assert.ok(
  !files.some((file) => /(^|\/)(?:\.env(?:\.[^/]*)?|\.git|node_modules|src)(?:\/|$)/.test(file)),
  'source, dependencies and environment files are not deployed',
);
assert.ok(!files.some((file) => file.endsWith('.map')), 'production source maps are not published');
for (const file of files)
  assert.ok(
    (await stat(join('dist', file))).size <= 25 * 1024 * 1024,
    `${file} fits the Cloudflare static-asset per-file limit`,
  );
const html = await readFile('dist/index.html', 'utf8');
assert.ok(!html.includes('/src/'), 'entry point references compiled assets');
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
assert.ok(assets.length >= 2, 'compiled JS and CSS are linked');
for (const asset of assets)
  assert.ok(files.includes(asset.slice(1)), `${asset} is present in dist`);
console.log(
  `PASS static artifact: ${files.length} files, compiled asset references, no source maps or root 404.html.`,
);
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
  assert.equal(await page.getByRole('button', { name: /QA ·/ }).count(), 0);
  assert.equal(await page.getByText('QA PREVIEW', { exact: false }).count(), 0);
  await page.getByRole('button', { name: 'Маг Посох', exact: false }).click();
  await page.getByRole('button', { name: 'Начать забег' }).click();
  await page.getByRole('progressbar', { name: 'Здоровье' }).waitFor();
  await page.getByRole('progressbar', { name: 'Опыт забега' }).waitFor();
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.getByRole('button', { name: 'Продолжить' }).waitFor();
  const pauseTime = await page.getByTestId('alpha-timer').innerText();
  // Task 07.3: the Pause screen shows Skills and Synergies immediately (production UI).
  await page.getByRole('region', { name: 'Обзор навыков', exact: true }).waitFor();
  await page.getByRole('region', { name: 'Синергии', exact: true }).waitFor();
  assert.equal(await page.locator('.synergy-entry').count(), 3);
  await page.waitForTimeout(100);
  assert.equal(await page.getByTestId('alpha-timer').innerText(), pauseTime);
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
      assert.ok(!source.includes('QA PREVIEW'), 'QA build UI eliminated from production JS');
      for (const marker of [
        'god-mode',
        'God Mode',
        'godMode',
        'QaGameplayWorld',
        'reset-synergy-counters',
        'Synergy Diagnostics',
        'Campaign Debug',
        'Campaign Run Debug',
        'campaign-force',
        'campaign-boss-now',
        'Time scale must be',
      ])
        assert.ok(
          !source.includes(marker),
          `${marker} QA implementation is absent from production JS`,
        );
      assert.ok(
        !source.includes('__survivors'),
        'legacy debug bridge eliminated from production JS',
      );
    }
  // The Worker serves index.html for unknown non-asset paths (SPA not_found_handling); Vite preview
  // models that fallback locally.
  const nested = await page.goto('http://127.0.0.1:4179/alpha/routing-check?debug');
  assert.equal(nested.status(), 200);
  await page.getByRole('button', { name: 'Начать забег' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /DEV ·/ }).count(), 0);
  assert.equal(await page.evaluate(() => typeof window.__alpha), 'undefined');
  assert.equal(await page.getByRole('checkbox', { name: 'God Mode', exact: true }).count(), 0);
  await page.goto('http://127.0.0.1:4179/?prototype&debug');
  await page.getByRole('button', { name: 'Войти в руины' }).waitFor();
  assert.equal(await page.evaluate(() => typeof window.__survivors), 'undefined');
  await page.goto('http://127.0.0.1:4179/?debug&qa=true&VITE_ENABLE_QA=true');
  await page.getByRole('button', { name: 'Начать забег' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /(?:QA|DEV) ·/ }).count(), 0);
  assert.equal(await page.evaluate(() => typeof window.__alpha), 'undefined');
  assert.deepEqual(errors, []);
  console.log(
    'PASS production: playable Mage, paused Skills overview/return, pause/resume, nested SPA URL; alpha and legacy ?debug routes expose no QA/God Mode controls/globals or implementation.',
  );
} finally {
  await browser?.close();
  server.kill();
}
