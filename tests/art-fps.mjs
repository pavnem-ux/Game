import { chromium } from 'playwright-core';

/**
 * Task 25: FPS with 120 enemies, procedural looks ("before": the art manifest is blocked, so the
 * Task 18 path draws everything) vs the owner's art ("after"). Same scene each time: the sandbox
 * run, protection on, wave spawning off, 24 of each of the five enemy kinds around the player (the
 * alpha cap of 120, topped up as the player kills), real frames for 8 s after a 2 s warm-up. FPS
 * is the debug overlay's value (`game.loop.actualFps`), sampled every 0.5 s. Runs are alternated
 * to spread machine noise.
 * Not part of `test:e2e` (timing-dependent); needs a dev server.
 *
 *   CHROMIUM_PATH=… node tests/art-fps.mjs [rounds=2] [dpr=1]
 */
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
const rounds = Number(process.argv[2] ?? 2);
const dpr = Number(process.argv[3] ?? 1);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
});

async function measure(withArt) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: dpr,
  });
  const page = await context.newPage();
  if (!withArt)
    await page.route('**/assets/manifest.json', (route) => route.fulfill({ status: 404 }));
  await page.goto(base + '/?debug');
  await page.waitForFunction(() => !!window.__alpha);
  // The sandbox run: no reserved elite / boss slots, so all 120 alpha enemy slots can be filled
  // (a campaign map keeps 20 of them for elites and the boss).
  await page.evaluate(() =>
    window.__alpha.command({
      type: 'restart',
      options: { characterClass: 'warrior', level: 1, initialEnemies: false },
    }),
  );
  await page.waitForFunction(() => window.__alpha?.state().screen === 'playing');
  if (withArt)
    await page.waitForFunction(() => window.__alpha.presentation().artLooks === 13, null, {
      timeout: 15_000,
    });
  const command = (a) => page.evaluate((x) => window.__alpha.command(x), a);
  await command({ type: 'protection', enabled: true });
  await command({ type: 'spawning', settings: { enabled: false } });
  await command({ type: 'clear-enemies' });
  for (const [kind, distance] of [
    ['melee', 260],
    ['ranged', 300],
    ['swift', 340],
    ['brute', 380],
    ['bombard', 420],
  ])
    await command({ type: 'spawn-n', kind, count: 24, distance });
  await page.waitForTimeout(2000);
  const fps = [],
    alive = [];
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => {
      const st = window.__alpha.state();
      return { fps: st.fps ?? 0, alive: st.world.enemies.filter((e) => e.alive).length };
    });
    // A level-up offer pauses the world (no frames to measure): take a card and keep going.
    await page.evaluate(() => {
      const offer = window.__alpha.state().world.skills.offer;
      if (!offer) return;
      const c = offer.cards[0];
      window.__alpha.command({
        type: 'choose-skill',
        card: c.kind === 'skill' ? c.skillId : `bonus:${c.bonusId}`,
      });
    });
    fps.push(s.fps);
    alive.push(s.alive);
    // Keep the population at the cap: replace the enemies the player killed.
    const missing = Math.min(24, 120 - s.alive);
    if (missing > 0)
      await command({ type: 'spawn-n', kind: 'melee', count: missing, distance: 300 }).catch(
        () => {},
      );
  }
  await context.close();
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return { fps: mean(fps), min: Math.min(...fps), enemies: mean(alive) };
}

const results = { procedural: [], art: [] };
for (let r = 0; r < rounds; r++) {
  results.procedural.push(await measure(false));
  results.art.push(await measure(true));
}
await browser.close();
for (const [mode, runs] of Object.entries(results))
  console.log(
    `${mode.padEnd(10)} DPR ${dpr}: ` +
      runs
        .map((r) => `${r.fps.toFixed(1)} fps (min ${r.min}, ${r.enemies.toFixed(0)} enemies)`)
        .join(' | '),
  );
