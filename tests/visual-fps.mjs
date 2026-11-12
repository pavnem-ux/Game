import { chromium } from 'playwright-core';

/**
 * Task 18: FPS under load (debug build), desktop and a CPU-throttled phone profile. Two scenarios:
 * campaign map 40 at its own enemy cap (80 = 120 − reserved slots; the campaign never allows more)
 * and the sandbox at the alpha cap of 120 enemies.
 * Not a test: prints a table row per profile. `FPS_QUALITY` = high / medium / low (stored in the
 * settings first; ignored without the setting), `FPS_SECONDS` = measuring window (default 5).
 *
 *   FPS_QUALITY=high node tests/visual-fps.mjs
 */
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
const quality = process.env.FPS_QUALITY || '';
const seconds = Number(process.env.FPS_SECONDS || 5);
const profiles = [
  { name: 'desktop 1280×800', viewport: { width: 1280, height: 800 }, throttle: 1, touch: false },
  {
    name: 'phone 390×844, CPU ×4',
    viewport: { width: 390, height: 844 },
    throttle: 4,
    touch: true,
  },
  // Task 16: landscape is the play orientation on phones.
  {
    name: 'phone 844×390 landscape, CPU ×4',
    viewport: { width: 844, height: 390 },
    throttle: 4,
    touch: true,
  },
];
// FPS_PROFILES=phone|desktop limits the run to one profile.
const only = process.env.FPS_PROFILES;
const chosen = only ? profiles.filter((p) => p.name.startsWith(only)) : profiles;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
});
const scenarios = [
  { name: 'map 40', options: { characterClass: 'mage', level: 30, campaign: { mapId: 40 } } },
  { name: 'sandbox', options: { characterClass: 'mage', level: 30 } },
];
for (const p of chosen)
  for (const scenario of scenarios) {
    const context = await browser.newContext({
      viewport: p.viewport,
      hasTouch: p.touch,
      isMobile: p.touch,
      deviceScaleFactor: p.touch ? 2 : 1,
    });
    const page = await context.newPage();
    if (quality)
      await page.addInitScript((q) => {
        const raw = localStorage.getItem('skazki.settings');
        const s = raw ? JSON.parse(raw) : {};
        localStorage.setItem('skazki.settings', JSON.stringify({ ...s, graphicsQuality: q }));
      }, quality);
    await page.goto(base + '/?debug');
    await page.waitForFunction(() => !!window.__alpha);
    await page.evaluate(
      (options) => window.__alpha.command({ type: 'restart', options }),
      scenario.options,
    );
    await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
    const command = (a) => page.evaluate((x) => window.__alpha.command(x), a);
    await command({ type: 'protection', enabled: true });
    for (let i = 0; i < 5; i++) await command({ type: 'group', count: 24, distance: 300 });
    // Top up to the 120-enemy cap right before measuring (auto-attacks keep killing some).
    for (let i = 0; i < 12; i++) {
      const alive = await page.evaluate(
        () => window.__alpha.state().world.enemies.filter((e) => e.alive).length,
      );
      if (alive >= 118) break;
      await command({ type: 'group', count: Math.min(24, 120 - alive), distance: 300 });
      await page.waitForTimeout(120);
    }
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.throttle });
    await page.waitForTimeout(800);
    const result = await page.evaluate(async (ms) => {
      const frames = [];
      let last = performance.now();
      const start = last;
      await new Promise((resolve) => {
        const tick = (t) => {
          frames.push(t - last);
          last = t;
          if (t - start > ms) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      frames.sort((a, b) => a - b);
      const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
      return {
        fps: 1000 / avg,
        p95: frames[Math.floor(frames.length * 0.95)],
        enemies: window.__alpha.state().world.enemies.filter((e) => e.alive).length,
      };
    }, seconds * 1000);
    console.log(
      `| ${p.name} | ${scenario.name} | ${quality || 'n/a'} | ${result.enemies} | ${result.fps.toFixed(1)} | ${result.p95.toFixed(1)} ms |`,
    );
    await context.close();
  }
await browser.close();
