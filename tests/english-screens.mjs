import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

/**
 * Task 23 §3: every screen in English at desktop 1280×720 and phone 844×390 (landscape, touch).
 * For each screen: a screenshot in the ignored `artifacts/english/`, no Cyrillic in the visible
 * text, no horizontal page scroll and no clipped text (an element with hidden/clipped overflow
 * whose content is wider or taller than its box). Needs a running dev server (`?debug` tools).
 *
 *   CHROMIUM_PATH=… node tests/english-screens.mjs
 */
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
const out = 'artifacts/english';
const save = JSON.parse(await readFile('tests/fixtures/pre-task23-save-v7.json', 'utf8'));
await mkdir(out, { recursive: true });

const VIEWPORTS = [
  ['desktop', { width: 1280, height: 720 }, false],
  ['mobile', { width: 844, height: 390 }, true],
];

/** Runs in the page: what is wrong with the current screen (empty = fine). */
function inspect() {
  const problems = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > window.innerWidth + 1)
    problems.push(`horizontal scroll ${doc.scrollWidth} > ${window.innerWidth}`);
  if (/[Ѐ-ӿ]/.test(document.body.innerText)) problems.push('Cyrillic text on screen');
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  for (const el of document.querySelectorAll('body *')) {
    if (
      el.closest(
        'canvas, svg, .visually-hidden, .developer-panel, .debug-overlay, [data-dev-toggle]',
      )
    )
      continue;
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .join('');
    if (!text || !visible(el)) continue;
    const cs = getComputedStyle(el);
    const clipsX = ['hidden', 'clip'].includes(cs.overflowX) || cs.textOverflow === 'ellipsis';
    const clipsY = ['hidden', 'clip'].includes(cs.overflowY);
    const wide = clipsX && el.scrollWidth > el.clientWidth + 1;
    const tall = clipsY && el.scrollHeight > el.clientHeight + 2;
    if (wide || tall)
      problems.push(
        `clipped ${wide ? 'width' : 'height'}: <${el.tagName.toLowerCase()} class="${el.className}"> “${text.slice(0, 60)}”`,
      );
  }
  return problems;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const failures = [];
const errors = [];
let shots = 0;
try {
  for (const [tag, viewport, touch] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    const check = async (name) => {
      await page.waitForTimeout(350); // entry transitions
      await page.screenshot({ path: `${out}/${tag}-${name}.png` });
      shots++;
      for (const p of await page.evaluate(inspect)) failures.push(`${tag} ${name}: ${p}`);
    };
    await page.goto(base + '/?debug');
    await page.evaluate(
      (json) => {
        localStorage.clear();
        localStorage.setItem('skazki.profile', json);
      },
      JSON.stringify({ ...save, gold: 12345, ore: 240 }),
    );
    await page.reload();
    const nav = page.getByRole('navigation', { name: 'Main menu' });
    await nav.waitFor();
    const go = async (label) => {
      const b = nav.getByRole('button', { name: label, exact: true });
      await b.evaluate((el) => el.click()); // the DEV toggle may overlap the row on phones
    };
    const tile = async (label) => {
      await go('Home');
      await page
        .getByRole('navigation', { name: 'Sections' })
        .getByRole('button', { name: new RegExp(`^${label}`) })
        .click();
    };

    // ── Meta screens ──
    for (const [name, label] of [
      ['home', 'Home'],
      ['hero', 'Hero'],
      ['equipment', 'Bag'],
      ['talents', 'Talents'],
      ['shop', 'Shop'],
      ['forge', 'Forge'],
      ['map', 'Campaign map'],
      ['progress', 'Progress'],
      ['settings', 'Settings'],
    ]) {
      await go(label);
      await check(name);
    }
    await go('Bag');
    await page.locator('.bag-cell').first().click();
    await check('equipment-selected');
    await go('Shop');
    await page
      .getByRole('group', { name: 'Shop slots' })
      .getByRole('button', { name: /Pets/ })
      .evaluate((el) => el.click());
    await check('shop-pets');
    // Task 40: the forge upgrades pets only (covered by the «forge» screen above).
    await tile('Pets');
    await check('pets');
    await tile('Quests');
    await check('quests');

    // ── Run screens ──
    await go('Home');
    await page.getByRole('button', { name: /^Start run · map/ }).click();
    await page.waitForFunction(() => window.__alpha?.state().screen === 'playing');
    await page
      .getByRole('button', { name: 'Hide' })
      .click({ timeout: 2000 })
      .catch(() => {});
    const cmd = (a) => page.evaluate((x) => window.__alpha.command(x), a);
    await cmd({ type: 'protection', enabled: true });
    for (const s of ['shield_bash', 'cleave', 'power', 'haste'])
      await cmd({ type: 'grant-skill', skillId: s, rank: 2 });
    await page.evaluate(() => window.__alpha.advance(3));
    await check('run-hud');
    await cmd({ type: 'grant-xp', amount: 400 });
    await page.waitForFunction(() => window.__alpha.state().screen === 'level-up');
    await check('level-up');
    for (let k = 0; k < 20; k++) {
      const offer = await page.evaluate(() => window.__alpha.state().world.skills.offer);
      if (!offer) break;
      const c = offer.cards[0];
      await cmd({
        type: 'choose-skill',
        card: c.kind === 'skill' ? c.skillId : 'bonus:' + c.bonusId,
      });
    }
    await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await check('pause');
    await page.getByRole('button', { name: 'Continue', exact: false }).click();
    await cmd({ type: 'protection', enabled: false });
    await cmd({ type: 'death' });
    await page.waitForFunction(() => window.__alpha.state().screen === 'revival');
    await check('revival');
    await page.getByRole('button', { name: /Revive/ }).click();
    await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
    await cmd({ type: 'campaign-force', outcome: 'victory' });
    await page.getByRole('dialog', { name: 'Victory.' }).waitFor();
    await check('results-victory');
    await ctx.close();
  }
} finally {
  await browser.close();
}
assert.deepEqual(errors, [], 'no page errors');
assert.deepEqual(failures, [], 'every screen fits and is English');
console.log(
  `PASS english screens: ${shots} screenshots (1280×720 + 844×390) in ${out}/ — English only, no horizontal scroll, no clipped text.`,
);
