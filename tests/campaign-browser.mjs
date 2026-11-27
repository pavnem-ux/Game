import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { EXTENDED, screenshot } from './e2e-options.mjs';
import { brand, goTo, sections, startMap } from './e2e-nav.mjs';

/** Task 08 campaign UI (dev server): menu, pages, campaign runs, results, persistence. */
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors = [];
/** Task 22: the element is fully inside the viewport (no scrolling needed). */
async function inViewport(locator, what) {
  const box = await locator.boundingBox();
  const vp = locator.page().viewportSize();
  assert.ok(
    box &&
      box.y >= 0 &&
      box.x >= 0 &&
      box.y + box.height <= vp.height &&
      box.x + box.width <= vp.width,
    `${what} is visible without scrolling`,
  );
}
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/');
  await page.evaluate(() => localStorage.clear());
  await page.goto(base + '/?debug');
  await page.waitForFunction(() => !!window.__alpha);
  const state = () => page.evaluate(() => window.__alpha.state());
  const nav = brand(page);

  // 5.1 Main menu: navigation and Gold.
  await nav.waitFor();
  // Task 45: no top navigation; the hub tiles are the only way into the sections, and the hub has
  // one battle button («To battle», no quick start).
  assert.equal(await page.locator('.meta-nav').count(), 0, 'no top navigation');
  for (const tab of [
    'Hero',
    'Equipment',
    'Talents',
    'Shop',
    'Forge',
    'Pets',
    'Quests',
    'Campaign map',
    'Progress',
    'Settings',
  ])
    assert.equal(
      await sections(page).getByRole('button', { name: tab, exact: true }).count(),
      1,
      tab,
    );
  assert.equal(await page.getByRole('button', { name: /^Start run/ }).count(), 0, 'no quick start');
  assert.equal(await page.getByRole('button', { name: /To battle/ }).count(), 1);
  assert.equal(await page.getByLabel('Gold: 0').count(), 1);
  assert.equal(
    await page.getByLabel(/^Build version: v\d+\.\d+\.\d+ · ([0-9a-f]{7}|unknown)$/).count(),
    1,
    'build label on the main menu',
  );
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.profile')));
  assert.equal(saved.highestUnlockedMap, 1, 'a new profile is persisted on first launch');
  /** Task 13: open the map path, pick map `id` and press «To battle» in its side panel. */
  const openMap = async (id) => {
    await goTo(page, 'Campaign map');
    await page.getByRole('button', { name: new RegExp(`^Map ${id}: `) }).click();
    return page.getByRole('button', { name: `Play: map ${id}`, exact: true });
  };
  const mapPanel = () => page.locator('.map-panel');

  // Task 13 hub: «To battle» opens the map path; Esc goes back to the hub.
  await page
    .getByRole('button', { name: /To battle/ })
    .first()
    .click();
  assert.equal(await page.locator('.map-node').count(), 40);
  await page.getByRole('heading', { name: 'Campaign map', level: 2 }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: 'The Last Light', level: 1 }).waitFor();
  // Task 45: «← Home» on every non-hub page (Esc with a confirm dialog open: see the shop below).
  for (const tab of [
    'Hero',
    'Equipment',
    'Talents',
    'Shop',
    'Forge',
    'Pets',
    'Quests',
    'Progress',
    'Settings',
  ]) {
    await goTo(page, tab);
    await page.getByRole('button', { name: '← Home', exact: true }).click();
    await page.getByRole('heading', { name: 'The Last Light', level: 1 }).waitFor();
  }

  // 5.2 Character page.
  await goTo(page, 'Hero');
  // Task 13: a card's quick link opens Equipment (Task 45 name) for that class.
  await page.getByRole('button', { name: 'Equipment: Mage', exact: true }).click();
  await page.getByRole('region', { name: 'Equipment: Mage' }).waitFor();
  await goTo(page, 'Hero');
  const cards = page.locator('.character-card');
  assert.equal(await cards.count(), 4);
  assert.match(await cards.first().innerText(), /Level 1 \/ 50 · XP 0 \/ 106/);
  assert.equal(await cards.first().getByLabel('Talent points: 0').count(), 1);
  await page
    .getByRole('article', { name: /Archer/ })
    .getByRole('button', { name: 'Choose' })
    .click();
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.profile')).selectedClass),
    'archer',
  );
  await screenshot(page, { path: 'artifacts/campaign-01-character.png', fullPage: true });

  // 5.2 Map path (Task 13): 40 nodes in 4 act regions; the side panel shows the lock reason,
  // recommended level, modifiers and the boss (hidden while locked); locked maps cannot start.
  await goTo(page, 'Campaign map');
  assert.equal(await page.locator('.map-node').count(), 40);
  for (const act of ['Act I · Forgotten Tales', 'Act II · Enchanted Lands'])
    assert.equal(await page.getByRole('region', { name: act, exact: true }).count(), 1, act);
  assert.equal(await page.getByRole('button', { name: /^Map 1: .*, open$/ }).count(), 1);
  assert.equal(await page.getByRole('button', { name: /^Map 2: .*, locked$/ }).count(), 1);
  assert.match(await mapPanel().innerText(), /Recommended level\s+1 ·/);
  const play2 = await openMap(2);
  assert.match(await mapPanel().innerText(), /Win on map 1[\s\S]*Recommended level\s+2 ·/);
  assert.match(await mapPanel().innerText(), /Boss\s+♚ \?\?\?/);
  assert.equal(await play2.isDisabled(), true);
  const play11 = await openMap(11);
  assert.match(await mapPanel().innerText(), /Whispering Pines[\s\S]*Win on map 10/);
  assert.equal(await play11.isDisabled(), true);
  await openMap(12);
  assert.match(await mapPanel().innerText(), /Swift enemies/);
  await screenshot(page, { path: 'artifacts/campaign-02b-maps-act2.png', fullPage: true });
  const play1 = await openMap(1);
  assert.match(await mapPanel().innerText(), /Boss\s+♚ Thornwarden/);
  await screenshot(page, { path: 'artifacts/campaign-02-maps.png', fullPage: true });
  await play1.click();
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  let s = await state();
  assert.equal(s.world.campaign.mapId, 1);
  assert.equal(s.world.character.characterClass, 'archer');
  assert.match(s.world.campaign.runId, /^run-/);

  // 5.3 Win Map 1: protected fast-forward to the boss (same simulation), then defeat it.
  const command = (action) => page.evaluate((a) => window.__alpha.command(a), action);
  await command({ type: 'protection', enabled: true });
  await command({ type: 'spawning', settings: { enabled: false } });
  const fastForward = async (until) => {
    for (let i = 0; i < 400 && (await state()).world.time < until; i++) {
      if ((await state()).screen === 'level-up') await page.locator('.skill-card').first().click();
      else {
        const t = (await state()).world.time;
        await page.evaluate((dt) => window.__alpha.advance(dt), Math.min(15, until - t));
      }
    }
  };
  // 5.4 HUD (Task 22): coins + one countdown to the nearest scheduled event (no map name, stage,
  // time left or separate boss countdown any more); boss HP bar.
  const hud = page.getByLabel('Campaign', { exact: true });
  await hud.waitFor();
  assert.match(await hud.innerText(), /Elite in \d:\d\d/);
  assert.doesNotMatch(await hud.innerText(), /Edge of Forgotten Tales|Stage:|left|Boss in/);
  assert.match(await page.locator('.run-level-label').innerText(), /Run level \d+/);
  await fastForward(112);
  // Shortly before the first elite the countdown reads 0:0N.
  await page.waitForFunction(() =>
    /Elite in 0:0\d/.test(document.querySelector('.campaign-hud-next')?.textContent ?? ''),
  );
  await screenshot(page, { path: 'artifacts/campaign-05-hud-elite.png' });
  // Task 08.5 §2.3 debug overlay: live DPS and damage per source (?debug only).
  const overlay = page.getByRole('complementary', { name: 'Debug Overlay' });
  await overlay.waitFor();
  assert.match(await overlay.innerText(), /Damage by source[\s\S]*Bow/i);
  const overlayTotal = await overlay.innerText();
  assert.match(overlayTotal, /Total damage\s+[1-9]/);
  // Task 08.5 §4.2: each run has its own seed, shown in the overlay.
  const runSeed = (await state()).world.seed;
  assert.ok(Number.isSafeInteger(runSeed) && runSeed >= 0 && runSeed <= 4294967295);
  assert.equal(await page.getByTestId('debug-seed').innerText(), String(runSeed));
  await fastForward(121);
  await page.waitForFunction(() =>
    document.querySelector('.campaign-alert')?.textContent?.includes('Elite: Savage Brute'),
  );
  await fastForward(600);
  await page.getByRole('progressbar', { name: 'Boss health' }).waitFor();
  assert.match(await page.getByLabel('Boss: Thornwarden').innerText(), /Thornwarden/);
  // Task 22: after the map duration nothing is scheduled — the countdown is hidden (coins stay).
  assert.equal(await page.locator('.campaign-hud-next').count(), 0);
  assert.match(await hud.innerText(), /◎ \d+/);
  await screenshot(page, { path: 'artifacts/campaign-06-boss.png' });
  s = await state();
  assert.equal(s.world.campaign.durationReached, true);
  assert.ok(s.world.campaign.boss?.alive, 'the boss spawned at 10:00 and is alive');
  await command({ type: 'clear-enemies' });
  await page.getByRole('dialog', { name: 'Victory.' }).waitFor();
  const results = page.getByRole('dialog', { name: 'Victory.' });
  await page.waitForFunction(() =>
    document.querySelector('.results-save')?.textContent?.includes('Progress saved'),
  );
  const text = await results.innerText();
  assert.match(text, /\+150 XP/);
  // Task 11: Gold = coins collected in the run + victory bonus (24 on map 1 after Task 40's ×0.8).
  assert.match(text, /Coins\s+\d+/);
  assert.match(text, /Victory bonus\s+\+24/);
  // Task 42: a victory always brings the boss item (Normal: Uncommon / Rare / Epic) — the Loot block.
  assert.match(
    await results.getByRole('group', { name: 'Loot' }).innerText(),
    /Loot[\s\S]*(Uncommon|Rare|Epic) [\s\S]*L1/,
  );
  // Task 19: Map 1, first victory → 6 map Ore. Task 24: a victory also pays the Ore banked by
  // activities this run (e.g. the thief's seeded 20% chance), shown as «(activities +N)»; the run
  // seed is random, so the total is 6 + N.
  const victoryOre = /Ore\s+\+(\d+) \(first victory ×3\)(?: \(activities \+(\d+)\))?/.exec(text);
  assert.ok(victoryOre, 'victory Ore line');
  assert.equal(
    Number(victoryOre[1]),
    6 + Number(victoryOre[2] ?? 0),
    `map Ore 6 + activity Ore (${victoryOre[0]})`,
  );
  assert.match(text, /1 → 2 \(\+1\)/);
  assert.match(text, /Talent points\s+\+1/);
  assert.match(text, /Map 2 unlocked: Misty Marshes/);
  assert.match(text, /Thornwarden defeated/);
  // Task 08.5 §2.2: compact run statistics on the results screen.
  const statsPanel = results.getByRole('region', { name: 'Run statistics' });
  const statsText = await statsPanel.innerText();
  assert.equal(await results.getByLabel(`Run seed: ${runSeed}`).count(), 1);
  assert.match(statsText, /Top damage sources[\s\S]*Bow[\s\S]*\d+%/i);
  assert.match(statsText, /Damage taken/);
  assert.match(statsText, /Death\s+never fell/);
  await screenshot(page, { path: 'artifacts/campaign-03-victory.png' });
  const afterWin = await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.profile')));
  const winGold = afterWin.gold;
  assert.ok(winGold >= 24, 'victory pays at least the bonus');
  assert.match(text, new RegExp(`Gold\\s+\\+${winGold}`));
  assert.equal(afterWin.highestUnlockedMap, 2);
  assert.equal(afterWin.classes.archer.level, 2);
  assert.equal(afterWin.stats.wins, 1);
  assert.ok(afterWin.recentRuns[0].stats.damageDealt > 0, 'recent run keeps the stats summary');
  assert.ok(afterWin.recentRuns[0].stats.topSources.length >= 1);
  await results.getByRole('button', { name: 'To menu' }).click();
  await nav.waitFor();
  assert.equal(await page.getByLabel(`Gold: ${winGold}`).count(), 1);

  // Restart browser (reload): progress intact; Map 2 with another class; shared Gold, separate XP.
  await page.reload();
  await page.waitForFunction(() => !!window.__alpha);
  await nav.waitFor();
  assert.equal(await page.getByLabel(`Gold: ${winGold}`).count(), 1);
  await goTo(page, 'Progress');
  assert.match(await page.locator('.progression-page').innerText(), /Maps cleared: 1 \/ 40/);
  assert.match(await page.locator('.recent-runs').innerText(), /Victory · map 1/);
  await screenshot(page, { path: 'artifacts/campaign-04-progression.png', fullPage: true });
  // Task 09 §1.5: talent screen (selected class = archer, level 2 → 1 point). Task 13: own page;
  // a node opens its ranks in the detail panel, which holds the «Learn» button.
  await goTo(page, 'Talents');
  const talents = page.getByRole('region', { name: 'Talents', exact: true });
  const detail = page.getByRole('region', { name: 'Talent details' });
  const pick = (item) => item.locator('.talent-orb').click();
  assert.match(await talents.innerText(), /Free points: 1 of 1/);
  // Task 09.1 G0: the catalog is approved; not-yet-implemented ranks are flagged instead.
  assert.match(await talents.innerText(), /Some ranks do not work in combat yet/);
  const superBranch = talents.getByRole('region', { name: /^Branch 3\./ });
  assert.match(await superBranch.innerText(), /unlocks at level 30/);
  await pick(superBranch.getByRole('listitem').first());
  assert.equal(await detail.getByRole('button', { name: /Learn/ }).isDisabled(), true);
  const eye = talents.getByRole('listitem', { name: /^Keen Eye: Rank 0$/ });
  const next = talents.getByRole('listitem', { name: /^Weak Spot: Rank 0$/ });
  await pick(next);
  assert.equal(await detail.getByRole('button', { name: 'Learn rank I' }).isDisabled(), true);
  assert.match(await detail.innerText(), /Learn the previous talent to rank II first/);
  await pick(eye);
  await detail.getByRole('button', { name: 'Learn rank I' }).click();
  await talents.getByText(/Free points: 0 of 1/).waitFor();
  assert.deepEqual(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('skazki.profile')).classes.archer.talents,
    ),
    { 'archer.b1.n01': 1 },
  );
  assert.equal(await talents.getByRole('listitem', { name: /^Keen Eye: Rank I$/ }).count(), 1);
  assert.equal(
    await detail.getByRole('button', { name: 'Learn rank II' }).isDisabled(),
    true,
    'no points left',
  );
  await talents
    .getByRole('group', { name: 'Talent tree class' })
    .getByRole('button', { name: 'Mage' })
    .click();
  assert.match(await talents.innerText(), /Free points: 0 of 0/);
  await screenshot(page, { path: 'artifacts/campaign-12-talents.png', fullPage: true });
  await goTo(page, 'Hero');
  await page.getByRole('article', { name: /Mage/ }).getByRole('button', { name: 'Choose' }).click();
  await (await openMap(2)).click();
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  s = await state();
  assert.equal(s.world.campaign.mapId, 2);
  assert.equal(s.world.character.characterClass, 'mage');
  assert.equal(s.world.character.permanentLevel, 1, 'mage XP is separate from archer XP');

  // Quit mid-run: abandoned, no rewards, recorded once.
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const buildLabel = /^Build version: v\d+\.\d+\.\d+ · ([0-9a-f]{7}|unknown)$/;
  await page.getByRole('dialog').getByLabel(buildLabel).waitFor(); // 3.1 pause screen
  // 3.3 «Report a problem» from the pause screen: a JSON report with every field.
  const [reportDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Report a problem' }).click(),
  ]);
  assert.match(reportDownload.suggestedFilename(), /^skazki-report-\d{4}-\d\d-\d\d-\d{4}\.json$/);
  const reportPath = await reportDownload.path();
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.format, 'skazki-report');
  assert.match(report.build.label, /^v\d+\.\d+\.\d+ · /);
  assert.equal(report.run.mapId, 2);
  assert.equal(report.run.characterClass, 'mage');
  assert.equal(typeof report.run.seed, 'number');
  assert.ok(report.run.time > 0);
  assert.ok(report.run.stats && Array.isArray(report.run.stats.bySource));
  assert.ok(Array.isArray(report.errors));
  assert.equal(report.save.ok, true);
  assert.equal(report.save.profile.gold, winGold);
  assert.match(report.userAgent, /Chrome/);
  await page.getByRole('status').filter({ hasText: 'Report saved' }).waitFor();
  await page.getByRole('button', { name: /Exit to menu · the run will not count/ }).click();
  await nav.waitFor();
  const afterQuit = await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.profile')));
  assert.equal(afterQuit.gold, winGold);
  assert.equal(afterQuit.classes.mage.lifetimeXp, 0);
  assert.equal(afterQuit.recentRuns[0].outcome, 'abandoned');
  assert.equal(afterQuit.stats.runs, 2);

  // Reload during a run abandons it as well (committed on pagehide).
  await startMap(page);
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  await page.reload();
  await page.waitForFunction(() => !!window.__alpha);
  const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.profile')));
  assert.equal(afterReload.recentRuns[0].outcome, 'abandoned');
  assert.equal(afterReload.stats.runs, 3);
  assert.equal(afterReload.gold, winGold);

  // 5.5 Save Management: status, warning, export download, import (invalid → unchanged; valid →
  // confirm → replace), visible warning on a write failure.
  await goTo(page, 'Settings');
  const mgmt = page.getByRole('region', { name: 'Save management' });
  assert.match(await mgmt.innerText(), /Progress saved/);
  assert.match(await mgmt.innerText(), /Clearing site or browser data deletes it/);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    mgmt.getByRole('button', { name: 'Export save' }).click(),
  ]);
  assert.match(download.suggestedFilename(), /^skazki-save-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(
    await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'),
  );
  assert.equal(exported.gold, winGold);
  const stored = () => page.evaluate(() => localStorage.getItem('skazki.profile'));
  const before = await stored();
  await page.getByLabel('Save file').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion": 1, oops'),
  });
  await page.getByText(/File not imported: The save file is damaged/).waitFor();
  assert.equal(await stored(), before, 'invalid import leaves the save unchanged');
  await page.getByLabel('Save file').setInputFiles({
    name: 'newer.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...exported, schemaVersion: 13 })), // Task 42: v12 is current
  });
  await page.getByText(/a newer version of the game/).waitFor();
  assert.equal(await stored(), before);
  await page.getByLabel('Save file').setInputFiles({
    name: 'rich.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...exported, gold: 999 })),
  });
  const confirm = page.getByRole('dialog', { name: 'Replace your save?' });
  await confirm.waitFor();
  assert.match(await confirm.innerText(), /Gold 999/);
  assert.equal(await confirm.getByRole('button', { name: 'Export current first' }).count(), 1);
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await stored(), before, 'cancel changes nothing');
  await page.getByLabel('Save file').setInputFiles({
    name: 'rich.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...exported, gold: 999 })),
  });
  await confirm.getByRole('button', { name: 'Replace save' }).click();
  await page.getByText('Save imported.').waitFor();
  assert.equal(JSON.parse(await stored()).gold, 999);
  assert.equal(await page.getByLabel('Gold: 999').count(), 1);
  // Import the original export back (round-trip).
  await page.getByLabel('Save file').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await confirm.getByRole('button', { name: 'Replace save' }).click();
  await page.getByText('Save imported.').waitFor();
  assert.equal(JSON.parse(await stored()).gold, winGold);
  await screenshot(page, { path: 'artifacts/campaign-07-settings.png', fullPage: true });
  // Write failure: storage refuses writes → visible warning, nothing claimed as saved.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.__restoreStorage = () => (Storage.prototype.setItem = original);
    Storage.prototype.setItem = function () {
      throw new DOMException('full', 'QuotaExceededError');
    };
  });
  await goTo(page, 'Hero');
  await page
    .getByRole('article', { name: /Warrior/ })
    .getByRole('button', { name: 'Choose' })
    .click();
  const banner = page.locator('.save-banner');
  await banner.waitFor();
  assert.match(await banner.innerText(), /NOT saved[\s\S]*storage is full/);
  await screenshot(page, { path: 'artifacts/campaign-08-save-warning.png' });
  await page.evaluate(() => window.__restoreStorage());
  await goTo(page, 'Settings');
  await page.getByRole('button', { name: 'Retry save' }).click();
  await page.getByText('Progress saved.', { exact: true }).first().waitFor();
  assert.equal(JSON.parse(await stored()).selectedClass, 'warrior');
  assert.equal(await banner.count(), 0);

  // 6.1 DEV campaign tools (normal pipelines): unlock maps, class level, Gold, boss, force win.
  await page.getByRole('button', { name: /DEV · Testing/ }).click();
  const devProfile = page.getByRole('group', { name: 'Campaign Debug' });
  await devProfile.getByRole('button', { name: 'Unlock all maps' }).click();
  await page.getByLabel('Debug class level').fill('12');
  await devProfile.getByRole('button', { name: /Set level/ }).click();
  await page.getByLabel('Debug gold').fill('500');
  await devProfile.getByRole('button', { name: 'Grant Gold' }).click();
  // Task 19: Ore grant (Map 1 was won above: first victory ×3 = 6 ore, plus any
  // Ore banked by activities in that run — Task 24 — exactly as the results screen paid it).
  const oreBefore = JSON.parse(await stored()).ore;
  assert.equal(oreBefore, Number(victoryOre[1]));
  await page.getByLabel('Debug ore').fill('20');
  await page
    .getByRole('group', { name: 'Gear Debug' })
    .getByRole('button', { name: 'Grant Ore' })
    .click();
  const devSave = JSON.parse(await stored());
  assert.equal(devSave.ore, oreBefore + 20);
  assert.equal(devSave.highestUnlockedMap, 40); // Task 10: 40 maps
  assert.equal(devSave.classes[devSave.selectedClass].level, 12);
  // Task 13: the DEV panel covers the right side of the redesigned pages; close it for the shop,
  // equipment and map steps and reopen it once the Map 10 run has started.
  await page.getByRole('button', { name: /DEV · Close/ }).click();
  // Task 40 / 41: shop → buy an item instance (confirmation, one atomic save) → Bag: equip, upgrade.
  await goTo(page, 'Shop');
  const slots = page.getByRole('group', { name: 'Shop slots' });
  assert.equal(await slots.getByRole('button').count(), 9); // All + 7 gear slots + Pets
  const goods = page.locator('.shop-rows-compact');
  // Task 41: «All» first — per slot one Common and three Uncommon offers at the class level (12).
  assert.equal(await goods.locator('.shop-cell').count(), 28);
  assert.match(
    await page.locator('.shop-level-line').innerText(),
    /Item level 12 · new stock at level 13/,
  );
  await slots.getByRole('button', { name: 'Armor' }).click();
  // Common armor at level 12 (band «Robe»): 40 max HP, 9 resistance; round(40 × (1 + 12/5)) = 136 Gold.
  const robe = page.getByRole('listitem', { name: 'Robe: 136 Gold' });
  assert.match(await robe.innerText(), /HP \+40[\s\S]*Armor \+9/); // Task 44 format
  await robe.getByRole('button', { name: /Buy · Gold 136/ }).click();
  // Task 13 keyboard: the confirm dialog focuses «Confirm»; Enter confirms.
  await page.getByRole('dialog', { name: /Buy “Robe” for 136 Gold\?/ }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Confirm');
  await page.keyboard.press('Enter');
  await page.getByText('Bought: Robe.').waitFor();
  const bought = JSON.parse(await stored());
  assert.equal(bought.gold, devSave.gold - 136);
  // Task 42: the Map 1 victory above already brought the boss item (i1); the Robe is the next uid.
  assert.equal(bought.items.length, 2);
  const robeItem = bought.items[1];
  assert.equal(robeItem.uid, 'i2');
  assert.equal(robeItem.slot, 'armor');
  assert.equal(robeItem.itemLevel, 12);
  assert.ok(bought.newItems.includes('i2')); // Task 41: the «new» marker
  assert.deepEqual(bought.shopBought[bought.selectedClass], {
    level: 12,
    offers: ['armor:common'],
  });
  // The bought offer is gone until the class levels up (a greyed placeholder keeps the row).
  assert.equal(await page.getByRole('listitem', { name: 'Robe: 136 Gold' }).count(), 0);
  assert.equal(await page.getByRole('listitem', { name: 'Robe: sold out' }).count(), 1);
  assert.equal(await goods.locator('.shop-cell:not(.sold)').count(), 3);
  // Esc cancels the dialog (no purchase) and stays in the shop (it does not go back to the hub).
  await slots.getByRole('button', { name: 'Amulet' }).click();
  await goods.locator('.shop-cell').first().getByRole('button', { name: /Buy/ }).click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.locator('.shop-page').count(), 1, 'still in the shop');
  assert.equal(await sections(page).count(), 0, 'Esc with a dialog open does not go to the hub');
  assert.equal(JSON.parse(await stored()).gold, bought.gold);
  await slots.getByRole('button', { name: 'Armor' }).click();
  await screenshot(page, { path: 'artifacts/campaign-13-shop.png', fullPage: true });
  // Task 41: the Bag — select the new item (its card clears «new»), equip it by uid.
  await goTo(page, 'Equipment');
  const bag = page.getByRole('region', { name: /^Equipment:/ });
  await bag.getByRole('button', { name: /^Robe, L12, new/ }).click();
  const itemCard = bag.getByRole('group', { name: 'Item card' });
  assert.match(await itemCard.innerText(), /Robe[\s\S]*Item level 12[\s\S]*HP\s+\+40/);
  // Task 44: the Bag «Stats» totals preview the open item (green «+40» on Max HP).
  assert.match(await bag.getByRole('list', { name: 'Stats' }).innerText(), /Max HP[\s\S]*\+40/);
  await page.waitForFunction(
    () => !JSON.parse(localStorage.getItem('skazki.profile')).newItems.includes('i2'),
  );
  // Task 22: «Equip» appears next to the selection — in the viewport without scrolling.
  await inViewport(itemCard.getByRole('button', { name: 'Equip' }), 'desktop «Equip»');
  await itemCard.getByRole('button', { name: 'Equip' }).click();
  await page.waitForFunction(
    (c) => JSON.parse(localStorage.getItem('skazki.profile')).classes[c].loadout.armor === 'i2',
    bought.selectedClass,
  );
  // Slot upgrade: the Armor row → «Upgrade to +1» (254 Gold, 12 Ore; one save).
  await bag.getByRole('button', { name: 'Armor +0: Robe' }).click();
  const preUpgrade = JSON.parse(await stored());
  await bag
    .getByRole('group', { name: 'Slot upgrade' })
    .getByRole('button', { name: /Upgrade to \+1/ })
    .click();
  await bag.getByRole('button', { name: 'Armor +1: Robe' }).waitFor();
  const upgraded = JSON.parse(await stored());
  assert.equal(upgraded.classes[bought.selectedClass].slotLevels.armor, 1);
  assert.equal(upgraded.gold, preUpgrade.gold - 254);
  assert.equal(upgraded.ore, preUpgrade.ore - 12);
  await screenshot(page, { path: 'artifacts/campaign-14-equipment.png', fullPage: true });
  // Task 40: the forge only upgrades pets now (item upgrades are replaced by the new item model).
  await goTo(page, 'Forge');
  // No pet owned yet: the forge points to the shop; there is no item upgrade any more.
  await page
    .locator('.forge-screen')
    .getByText(/buy a pet in the shop/)
    .waitFor();
  assert.equal(await page.getByRole('group', { name: 'Item upgrade' }).count(), 0);
  await goTo(page, 'Equipment');
  await bag.getByRole('button', { name: 'Armor +1: Robe' }).waitFor();
  const goldBefore = JSON.parse(await stored()).gold;
  await (await openMap(10)).click();
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  await page.getByRole('button', { name: /DEV · Testing/ }).click();
  assert.equal((await state()).world.character.permanentLevel, 12);
  const devRun = page.getByRole('group', { name: 'Campaign Run Debug' });
  const killsBefore = (await state()).world.kills;
  await page.evaluate(() =>
    window.__alpha.command({ type: 'spawning', settings: { enabled: false } }),
  );
  await page.evaluate(() =>
    window.__alpha.command({ type: 'spawn', kind: 'melee', distance: 150 }),
  );
  await devRun.getByRole('button', { name: 'Kill everything on screen' }).click();
  await page.waitForFunction((k) => window.__alpha.state().world.kills > k, killsBefore);
  await devRun.getByRole('button', { name: 'Summon boss' }).click();
  await page.getByRole('progressbar', { name: 'Boss health' }).waitFor();
  await devRun.getByRole('button', { name: 'Boss HP → 10%' }).click();
  const speed = page.getByRole('group', { name: 'Run speed-up' });
  await speed.getByRole('button', { name: '×8' }).click();
  await page.waitForFunction(() => window.__alpha.state().timeScale === 8);
  assert.equal(
    await speed.getByRole('button', { name: '×8' }).getAttribute('aria-pressed'),
    'true',
  );
  await devRun.getByRole('button', { name: 'Victory', exact: true }).click();
  const devResults = page.getByRole('dialog', { name: 'Victory.' });
  await devResults.waitFor();
  await page.waitForFunction(() =>
    document.querySelector('.results-save')?.textContent?.includes('Progress saved'),
  );
  const afterDev = JSON.parse(await stored());
  assert.ok(afterDev.completedMaps.includes(10), 'forced victory completes Map 10');
  assert.ok(afterDev.gold > goldBefore, 'forced victory pays through the normal results pipeline');
  await screenshot(page, { path: 'artifacts/campaign-10-dev-victory.png' });
  await devResults.getByRole('button', { name: 'To menu' }).click();
  await nav.waitFor();
  page.once('dialog', (d) => d.accept());
  await devProfile.getByRole('button', { name: 'Reset test progress' }).click();
  await page.getByLabel('Gold: 0').waitFor();
  assert.equal(JSON.parse(await stored()).highestUnlockedMap, 1);
  // Task 09 §1.6 (DEV): talent debug — superpower preset, set a rank, reset the tree.
  const talentDebug = page.getByRole('group', { name: 'Talent Debug' });
  await talentDebug.getByRole('button', { name: 'Toggle superpower preset' }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('skazki.profile')).classes.warrior.talents[
        'warrior.b3.n01'
      ] === 1,
  );
  assert.equal(JSON.parse(await stored()).classes.warrior.level, 30);
  await talentDebug.getByLabel('Debug talent', { exact: true }).selectOption('warrior.b1.n03');
  await talentDebug.getByLabel('Debug talent rank').selectOption('3');
  await talentDebug.getByRole('button', { name: 'Set talent rank' }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('skazki.profile')).classes.warrior.talents[
        'warrior.b1.n03'
      ] === 3,
  );
  assert.deepEqual(JSON.parse(await stored()).classes.warrior.talents, {
    'warrior.b3.n01': 1,
    'warrior.b1.n01': 2,
    'warrior.b1.n02': 2,
    'warrior.b1.n03': 3,
  });
  await talentDebug.getByRole('button', { name: 'Reset talent tree' }).click();
  await page.waitForFunction(
    () =>
      Object.keys(JSON.parse(localStorage.getItem('skazki.profile')).classes.warrior.talents)
        .length === 0,
  );
  await page.getByRole('button', { name: /DEV · Close/ }).click();

  // Task 08.5 §3.2: a crash mid-run shows the friendly screen, logs the error in its own key,
  // leaves the save byte-identical and «Back to the menu» recovers a working game.
  await page.evaluate(() => localStorage.removeItem('skazki.errors'));
  await startMap(page);
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  const saveBeforeCrash = await stored();
  page.once('pageerror', () => {}); // the simulated error is expected
  const expectedErrors = errors.length;
  await page.getByRole('button', { name: /DEV · Testing/ }).click();
  await page.getByRole('button', { name: 'Simulate a crash' }).click();
  const crashDialog = page.getByRole('alertdialog', { name: 'Something went wrong.' });
  await crashDialog.waitFor();
  assert.match(await crashDialog.innerText(), /save is unchanged/);
  await screenshot(page, { path: 'artifacts/campaign-11-crash.png' });
  const errorLog = await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.errors')));
  assert.ok(errorLog.length >= 1 && errorLog.length <= 5);
  assert.match(errorLog.at(-1).message, /Debug crash/);
  assert.equal(await stored(), saveBeforeCrash, 'the crash never writes the save');
  await crashDialog.getByRole('button', { name: 'Back to the menu' }).click();
  await nav.waitFor();
  assert.equal(await stored(), saveBeforeCrash, 'recovery never writes the save');
  await page.waitForFunction(() => window.__alpha?.state().screen === 'menu');
  await startMap(page);
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: /Exit to menu · the run will not count/ }).click();
  await nav.waitFor();
  errors.length = expectedErrors; // drop the simulated crash from the unexpected-error list

  // Task 08.5 §4.2 (DEV): start the selected map with a given seed.
  await page.getByRole('button', { name: /DEV · Testing/ }).click();
  await page.getByLabel('Debug seed').fill('424242');
  await page.getByRole('button', { name: 'Start the selected map with this seed' }).click();
  await page.waitForFunction(() => window.__alpha.state().world?.seed === 424242);
  await page.getByRole('button', { name: /DEV · Close/ }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: /Exit to menu · the run will not count/ }).click();
  await nav.waitFor();

  // Task 08.5 §3.4 (DEV): load the earlier report → its save goes through the normal import.
  const saveBeforeReport = await stored();
  await page.getByRole('button', { name: /DEV · Testing/ }).click();
  await page.getByLabel('Debug report file').setInputFiles(reportPath);
  const replace = page.getByRole('button', { name: 'Replace save' });
  await replace.waitFor();
  assert.equal(await stored(), saveBeforeReport, 'nothing changes before confirmation');
  await replace.click();
  await page.getByText('Save imported.').waitFor();
  const imported = JSON.parse(await stored());
  assert.equal(imported.profileId, report.save.profile.profileId);
  assert.equal(imported.gold, winGold);
  await page.getByRole('button', { name: /DEV · Close/ }).click();

  // Task 08.5 §5.3: «Screen shake» (on by default) lives in its own settings key.
  await goTo(page, 'Settings');
  const shake = page.getByRole('checkbox', { name: 'Screen shake' });
  assert.equal(await shake.isChecked(), true);
  const saveBeforeSetting = await stored();
  await shake.uncheck();
  // Task 14 added the sound settings to the same key (defaults 80/80/50, sound on).
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.settings'))), {
    screenShake: false,
    masterVolume: 80,
    sfxVolume: 80,
    musicVolume: 50,
    muted: false,
    graphicsQuality: 'high', // Task 18 default on desktop (fine pointer)
    leftHanded: false, // Task 16
    haptics: true,
    gameSpeed: 1, // Task 36 default
  });
  assert.equal(await stored(), saveBeforeSetting, 'settings never touch the save');
  // Task 36: «Game speed» is on the same Settings page, stored in settings (never the save).
  await page.getByTestId('game-speed-choice').locator('label', { hasText: '×1.5' }).click();
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.settings')).gameSpeed),
    1.5,
  );
  assert.equal(await stored(), saveBeforeSetting, 'the game speed never touches the save');
  await page.getByTestId('game-speed-choice').locator('label', { hasText: '×1' }).first().click();
  await page.reload();
  await page.waitForFunction(() => !!window.__alpha);
  await goTo(page, 'Settings');
  assert.equal(await page.getByRole('checkbox', { name: 'Screen shake' }).isChecked(), false);
  await page.getByRole('checkbox', { name: 'Screen shake' }).check();
  // Task 14: sound sliders and «Mute» persist in the settings key, never in the save.
  await page.getByRole('slider', { name: 'Music' }).fill('20');
  await page.getByRole('checkbox', { name: 'Mute' }).check();
  assert.equal(await stored(), saveBeforeSetting, 'sound settings never touch the save');
  await page.reload();
  await page.waitForFunction(() => !!window.__alpha);
  await goTo(page, 'Settings');
  assert.equal(await page.getByRole('slider', { name: 'Music' }).inputValue(), '20');
  assert.equal(await page.getByRole('checkbox', { name: 'Mute' }).isChecked(), true);
  assert.equal(await page.getByRole('slider', { name: 'Music' }).isDisabled(), true);
  await page.getByRole('checkbox', { name: 'Mute' }).uncheck();

  // Task 13 §3.1: desktop widths 1024 / 1280 / 1920 — no horizontal scrolling on any page.
  const pagesTabs = [
    'Home',
    'Hero',
    'Equipment',
    'Talents',
    'Shop',
    'Campaign map',
    'Progress',
    'Settings',
  ];
  for (const [width, height] of [
    [1024, 720],
    [1280, 720],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    for (const tab of pagesTabs) {
      await goTo(page, tab);
      assert.ok(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <= innerWidth &&
            [...document.querySelectorAll('.meta-content')].every(
              (e) => e.scrollWidth <= e.clientWidth + 1,
            ),
        ),
        `${tab} fits ${width}×${height}`,
      );
    }
  }
  // Reduced motion: motion tokens drop to 0 ms and the pulsing nodes stop.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await goTo(page, 'Campaign map');
  assert.equal(
    await page.evaluate(() =>
      getComputedStyle(document.querySelector('.meta-ui')).getPropertyValue('--dur').trim(),
    ),
    '0ms',
  );
  assert.equal(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('.state-available .map-node-button')).animationName,
    ),
    'none',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  assert.notEqual(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('.state-available .map-node-button')).animationName,
    ),
    'none',
  );

  // Phone width: extended runs only (Task 29 mobile freeze).
  if (EXTENDED) {
    // Phone width: every menu page fits without horizontal scrolling.
    await page.setViewportSize({ width: 390, height: 844 });
    for (const tab of [
      'Home',
      'Hero',
      'Equipment',
      'Talents',
      'Shop',
      'Campaign map',
      'Progress',
      'Settings',
    ]) {
      await goTo(page, tab);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${tab} fits a phone`,
      );
    }
    await goTo(page, 'Campaign map');
    await screenshot(page, { path: 'artifacts/campaign-09-maps-mobile.png', fullPage: true });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(
    'PASS campaign: menu/Gold, Character, Maps (lock/boss reveal), Map 1 win → results/rewards/unlock/save, reload keeps progress, Map 2 with another class (separate XP, shared Gold), quit/reload = abandoned without rewards, Save Management (export, invalid/newer import unchanged, confirm/cancel/replace, round-trip), write-failure warning + retry, DEV campaign tools (unlock/level/Gold, boss, forced Map 10 win, reset); 08.5: time scale, kill-all, stats panel, debug overlay, build label, report download, crash recovery (save untouched), report → save import; Task 13: hub «To battle»/Esc, quick links; Task 45: hub tiles only (no top nav, no quick start), «← Home» on every page, Esc kept while a dialog is open, map path panel, talent detail, paper doll, shop modal (Enter/Esc), widths 1024–1920, reduced motion.',
  );
} finally {
  await browser.close();
}
