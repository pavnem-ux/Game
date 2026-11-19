import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

/**
 * Task 28: before / after screenshots of art pack 4 (synergy icons, talent branch emblems). Not
 * part of `test:e2e`; needs a running dev server (`/?debug` tools). Writes JPEGs to
 * `docs/art-pack-4/<tag>-*.jpg`:
 *  - the talent screen of each class (level 30: free points, a maxed node, a partly learned node,
 *    locked nodes and the superpower branch), full page; the warrior's also on a phone;
 *  - synergy banners (unlock I, level II, awakening III) on the HUD;
 *  - a level-up card with the «▲ Thermal Shock II» hint;
 *  - the pause menu's synergy list with level pips;
 *  - the results screen with a synergy among the top damage sources (warrior run).
 *
 *   CHROMIUM_PATH=… node tests/art4-screens.mjs before
 */
const tag = process.argv[2] || 'after';
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
const out = process.env.ART_SCREENS_DIR || 'docs/art-pack-4';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
});
const errors = [];
const CLASSES = ['warrior', 'archer', 'mage', 'rogue'];

async function open({ viewport, isMobile = false, hasTouch = false }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile, hasTouch });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = (name, opts = {}) =>
    page.screenshot({ path: `${out}/${tag}-${name}.jpg`, type: 'jpeg', quality: 72, ...opts });
  const command = (a) => page.evaluate((x) => window.__alpha.command(x), a);
  const state = () => page.evaluate(() => window.__alpha.state());
  const advance = (s) => page.evaluate((x) => window.__alpha.advance(x), s);
  const nav = page.getByRole('navigation', { name: 'Main menu' });
  return { context, page, shot, command, state, advance, nav };
}

/**
 * Level 30 (default) with a maxed node (B1·1 III), a partly learned one (B1·2 II) and B2·1 I; at a
 * level below 30 the superpower branch shows its «unlocks at level 30» seal.
 */
async function talentProfile(page, cls, level = 30) {
  await page.evaluate(
    ([c, lv]) => {
      const p = JSON.parse(localStorage.getItem('skazki.profile'));
      p.selectedClass = c;
      p.classes[c].level = lv;
      p.classes[c].xp = 0;
      p.classes[c].talents = { [`${c}.b1.n01`]: 3, [`${c}.b1.n02`]: 2, [`${c}.b2.n01`]: 1 };
      localStorage.setItem('skazki.profile', JSON.stringify(p));
    },
    [cls, level],
  );
}

// ── Talent screens ──
{
  // Taller than 720: the talent page scrolls inside the app shell, so a full-page shot would cut
  // the lower nodes off.
  const { context, page, shot, nav } = await open({ viewport: { width: 1280, height: 1000 } });
  await page.goto(base + '/?debug');
  await nav.waitFor();
  for (const cls of CLASSES) {
    await talentProfile(page, cls);
    await page.goto(base + '/?debug');
    await nav.waitFor();
    await nav.getByRole('button', { name: 'Talents', exact: true }).click();
    await page.getByRole('region', { name: 'Talents', exact: true }).waitFor();
    await page.waitForTimeout(500);
    await shot(`talents-${cls}`, { fullPage: true });
  }
  // Below level 30: the superpower branch keeps its frame and the level-30 seal.
  await talentProfile(page, 'mage', 20);
  await page.goto(base + '/?debug');
  await nav.waitFor();
  await nav.getByRole('button', { name: 'Talents', exact: true }).click();
  await page.locator('.talent-seal').waitFor();
  await page.waitForTimeout(500);
  await shot('talents-mage-level20', { fullPage: true });
  await context.close();
}
{
  const { context, page, shot, nav } = await open({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(base + '/?debug');
  await nav.waitFor();
  await talentProfile(page, 'warrior');
  await page.goto(base + '/?debug');
  await nav.waitFor();
  await nav.getByRole('button', { name: 'Talents', exact: true }).evaluate((el) => el.click());
  await page.getByRole('region', { name: 'Talents', exact: true }).waitFor();
  await page.waitForTimeout(500);
  await shot('phone-talents-warrior', { fullPage: true });
  // The page scrolls inside the app shell on a phone: bring the first nodes into view.
  await page.locator('.talent-node-cell').nth(1).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot('phone-talents-warrior-nodes');
  await context.close();
}

// ── Synergy banners, card hint, pause list (mage: Fireball + Frost Nova = Thermal Shock) ──
{
  const { context, page, shot, command, state, nav } = await open({
    viewport: { width: 1280, height: 720 },
  });
  await page.clock.install();
  await page.goto(base + '/?debug');
  await nav.waitFor();
  await page.waitForFunction(() => !!window.__alpha);
  await command({
    type: 'restart',
    options: { characterClass: 'mage', seed: 28, initialEnemies: false },
  });
  await page.waitForFunction(() => window.__alpha?.state().screen === 'playing');
  // Only `__alpha.advance` moves the world from here on; banners stay until shot.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
  await page
    .getByRole('button', { name: 'Hide' })
    .click({ timeout: 2000 })
    .catch(() => {});
  await command({ type: 'protection', enabled: true });
  await command({ type: 'spawning', settings: { enabled: false } });
  await command({ type: 'grant-skill', skillId: 'fireball', rank: 3 });
  await command({ type: 'grant-skill', skillId: 'frost_nova', rank: 2 });
  await page.getByText('✦ Synergy unlocked: Thermal Shock · I').waitFor();
  await page.waitForTimeout(300);
  await shot('banner-unlock');

  // A level-up offer holding the Frost Nova upgrade (the card with «▲ Thermal Shock II»).
  await command({ type: 'grant-choices', rerolls: 12, banishes: 0 });
  await command({ type: 'grant-xp', amount: 20 });
  await page.waitForFunction(() => window.__alpha.state().screen === 'level-up');
  for (let i = 0; i < 12; i++) {
    const cards = (await state()).world.skills.offer.cards;
    if (cards.some((c) => c.kind === 'skill' && c.skillId === 'frost_nova')) break;
    await command({ type: 'reroll-skills' });
    await page.waitForTimeout(150);
  }
  await page.getByTestId('card-level-hint').first().waitFor();
  await page.waitForTimeout(300);
  await shot('card-hint');
  await command({ type: 'choose-skill', card: 'frost_nova' });
  await page.getByText('▲ Thermal Shock · level II').waitFor();
  await page.waitForTimeout(300);
  await shot('banner-level2');

  await command({ type: 'grant-skill', skillId: 'fireball', rank: 5 });
  await command({ type: 'grant-skill', skillId: 'frost_nova', rank: 5 });
  await page.locator('.synergy-banner.level-3').waitFor();
  await page.waitForTimeout(300);
  await shot('banner-awakening');

  await page.keyboard.press('p');
  await page.locator('.pause-panel').waitFor();
  await page.locator('.synergy-overview').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot('pause-synergies');
  await context.close();
}

// ── Results with a synergy among the damage sources (warrior, campaign map 1) ──
{
  const { context, page, shot, command, advance, nav } = await open({
    viewport: { width: 1280, height: 720 },
  });
  await page.clock.install();
  await page.goto(base + '/?debug');
  await nav.waitFor();
  await page.waitForFunction(() => !!window.__alpha);
  // Seeded campaign run, so «before» and «after» get the same damage sources.
  await command({
    type: 'restart',
    options: {
      characterClass: 'warrior',
      seed: 2801,
      campaign: { mapId: 1, runId: `art4-${tag}` },
    },
  });
  await page.waitForFunction(() => window.__alpha?.state().screen === 'playing');
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
  await command({ type: 'protection', enabled: true });
  await command({ type: 'spawning', settings: { enabled: false } });
  // Ground Slam stuns; Cleave on stunned enemies triggers Skull Crusher.
  for (const [skillId, rank] of [
    ['ground_slam', 5],
    ['cleave', 5],
  ])
    await command({ type: 'grant-skill', skillId, rank });
  for (let i = 0; i < 80; i++) {
    if (i % 20 === 0) await command({ type: 'spawn-n', kind: 'brute', count: 16, distance: 90 });
    await advance(0.25);
    const offer = await page.evaluate(() => window.__alpha.state().world?.skills.offer);
    if (offer) {
      const c = offer.cards[0];
      await command({
        type: 'choose-skill',
        card: c.kind === 'skill' ? c.skillId : `bonus:${c.bonusId}`,
      });
    }
  }
  await command({ type: 'campaign-force', outcome: 'victory' });
  await page.getByRole('dialog', { name: 'Victory.' }).waitFor();
  await page.locator('.run-stats-sources').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot('results');
  await context.close();
}

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`art pack 4 screens (${tag}) written to ${out}/`);
