import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
// Cloudflare Pages uploads only dist/. Its native SPA fallback requires no root 404.html.
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
assert.ok(!files.includes('404.html'), 'Pages native SPA fallback remains enabled');
assert.ok(
  !files.some((file) => /(^|\/)(?:\.env(?:\.[^/]*)?|\.git|node_modules|src)(?:\/|$)/.test(file)),
  'source, dependencies and environment files are not deployed',
);
assert.ok(!files.some((file) => file.endsWith('.map')), 'production source maps are not published');
for (const file of files)
  assert.ok(
    (await stat(join('dist', file))).size <= 25 * 1024 * 1024,
    `${file} fits the Pages per-file limit`,
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
  // Pages serves index.html for unknown non-asset paths; Vite preview models that fallback locally.
  const nested = await page.goto('http://127.0.0.1:4179/alpha/routing-check?debug');
  assert.equal(nested.status(), 200);
  await page.getByRole('button', { name: 'Начать забег' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /DEV ·/ }).count(), 0);
  assert.equal(await page.evaluate(() => typeof window.__alpha), 'undefined');
  await page.goto('http://127.0.0.1:4179/?prototype&debug');
  await page.getByRole('button', { name: 'Войти в руины' }).waitFor();
  assert.equal(await page.evaluate(() => typeof window.__survivors), 'undefined');
  assert.deepEqual(errors, []);
  console.log(
    'PASS production: playable Mage, pause/resume, nested SPA URL; alpha and legacy ?debug routes expose no testing controls/globals; testing controller code is absent.',
  );
} finally {
  await browser?.close();
  server.kill();
}
