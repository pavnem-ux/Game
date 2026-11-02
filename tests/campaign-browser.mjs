import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';

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
  const nav = page.getByRole('navigation', { name: 'Главное меню' });

  // 5.1 Main menu: navigation and Gold.
  await nav.waitFor();
  for (const tab of ['Играть', 'Персонаж', 'Карты', 'Прогресс', 'Настройки'])
    assert.equal(await nav.getByRole('button', { name: tab, exact: true }).count(), 1, tab);
  assert.equal(await page.getByLabel('Золото: 0').count(), 1);
  assert.equal(
    await page.getByLabel(/^Версия сборки: v\d+\.\d+\.\d+ · ([0-9a-f]{7}|unknown)$/).count(),
    1,
    'build label on the main menu',
  );
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
  assert.equal(
    await page.getByRole('button', { name: 'Играть: карта 2', exact: true }).isDisabled(),
    true,
  );
  await page.screenshot({ path: 'artifacts/campaign-02-maps.png', fullPage: true });
  await page.getByRole('button', { name: 'Играть: карта 1', exact: true }).click();
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
  // 5.4 HUD: map, stage, time left, boss countdown; elite alert; boss HP bar.
  const hud = page.getByLabel('Кампания', { exact: true });
  await hud.waitFor();
  assert.match(await hud.innerText(), /1\. Опушка забытых сказок/);
  assert.match(await hud.innerText(), /Этап: Начало/);
  assert.match(await hud.innerText(), /Осталось 9:\d\d|Осталось 10:00/);
  assert.match(await hud.innerText(), /Босс через 9:\d\d|Босс через 10:00/);
  assert.match(await page.locator('.run-level-label').innerText(), /Уровень забега \d+/);
  await fastForward(112);
  await page.waitForFunction(() =>
    document.querySelector('.campaign-alert')?.textContent?.includes('Элита через'),
  );
  await page.screenshot({ path: 'artifacts/campaign-05-hud-elite.png' });
  // Task 08.5 §2.3 debug overlay: live DPS and damage per source (?debug only).
  const overlay = page.getByRole('complementary', { name: 'Debug Overlay' });
  await overlay.waitFor();
  assert.match(await overlay.innerText(), /Урон по источникам[\s\S]*Лук/i);
  const overlayTotal = await overlay.innerText();
  assert.match(overlayTotal, /Всего урона\s+[1-9]/);
  // Task 08.5 §4.2: each run has its own seed, shown in the overlay.
  const runSeed = (await state()).world.seed;
  assert.ok(Number.isSafeInteger(runSeed) && runSeed >= 0 && runSeed <= 4294967295);
  assert.equal(await page.getByTestId('debug-seed').innerText(), String(runSeed));
  await fastForward(121);
  await page.waitForFunction(() =>
    document.querySelector('.campaign-alert')?.textContent?.includes('Элита: Свирепый громила'),
  );
  await fastForward(600);
  await page.getByRole('progressbar', { name: 'Здоровье босса' }).waitFor();
  assert.match(await page.getByLabel('Босс: Терновый страж').innerText(), /Терновый страж/);
  assert.match(await hud.innerText(), /Время вышло — добейте босса/);
  await page.screenshot({ path: 'artifacts/campaign-06-boss.png' });
  s = await state();
  assert.equal(s.world.campaign.durationReached, true);
  assert.ok(s.world.campaign.boss?.alive, 'the boss spawned at 10:00 and is alive');
  await command({ type: 'clear-enemies' });
  await page.getByRole('dialog', { name: 'Победа.' }).waitFor();
  const results = page.getByRole('dialog', { name: 'Победа.' });
  await page.waitForFunction(() =>
    document.querySelector('.results-save')?.textContent?.includes('Прогресс сохранён'),
  );
  const text = await results.innerText();
  assert.match(text, /\+150 XP/);
  assert.match(text, /Золото\s+\+75/);
  assert.match(text, /1 → 2 \(\+1\)/);
  assert.match(text, /Очки талантов\s+\+1/);
  assert.match(text, /Открыта карта 2: Туманные болота/);
  assert.match(text, /Терновый страж повержен/);
  // Task 08.5 §2.2: compact run statistics on the results screen.
  const statsPanel = results.getByRole('region', { name: 'Статистика забега' });
  const statsText = await statsPanel.innerText();
  assert.equal(await results.getByLabel(`Сид забега: ${runSeed}`).count(), 1);
  assert.match(statsText, /Главные источники урона[\s\S]*Лук[\s\S]*\d+%/i);
  assert.match(statsText, /Получено урона/);
  assert.match(statsText, /Гибель\s+не погибали/);
  await page.screenshot({ path: 'artifacts/campaign-03-victory.png' });
  const afterWin = await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.profile')));
  assert.equal(afterWin.gold, 75);
  assert.equal(afterWin.highestUnlockedMap, 2);
  assert.equal(afterWin.classes.archer.level, 2);
  assert.equal(afterWin.stats.wins, 1);
  assert.ok(afterWin.recentRuns[0].stats.damageDealt > 0, 'recent run keeps the stats summary');
  assert.ok(afterWin.recentRuns[0].stats.topSources.length >= 1);
  await results.getByRole('button', { name: 'В меню' }).click();
  await nav.waitFor();
  assert.equal(await page.getByLabel('Золото: 75').count(), 1);

  // Restart browser (reload): progress intact; Map 2 with another class; shared Gold, separate XP.
  await page.reload();
  await page.waitForFunction(() => !!window.__alpha);
  await nav.waitFor();
  assert.equal(await page.getByLabel('Золото: 75').count(), 1);
  await nav.getByRole('button', { name: 'Прогресс', exact: true }).click();
  assert.match(await page.locator('.progression-page').innerText(), /Пройдено карт: 1 \/ 10/);
  assert.match(await page.locator('.recent-runs').innerText(), /Победа · карта 1/);
  await page.screenshot({ path: 'artifacts/campaign-04-progression.png', fullPage: true });
  // Task 09 §1.5: talent screen (selected class = archer, level 2 → 1 point).
  const talents = page.getByRole('region', { name: 'Таланты', exact: true });
  assert.equal(await page.getByRole('button', { name: 'Таланты — скоро' }).count(), 0);
  assert.match(await talents.innerText(), /Свободно очков: 1 из 1/);
  assert.match(await talents.innerText(), /Каталог талантов ещё не утверждён/);
  const superBranch = talents.getByRole('region', { name: /^Ветка 3\./ });
  assert.match(await superBranch.innerText(), /доступно с 30 уровня/);
  assert.equal(
    await superBranch
      .getByRole('button', { name: /Изучить/ })
      .first()
      .isDisabled(),
    true,
  );
  const eye = talents.getByRole('listitem', { name: /^Меткий глаз: Ранг 0$/ });
  const next = talents.getByRole('listitem', { name: /^Слабая точка: Ранг 0$/ });
  assert.equal(await next.getByRole('button', { name: 'Изучить ранг I' }).isDisabled(), true);
  assert.match(await next.innerText(), /Сначала изучите предыдущий талант до ранга II/);
  await eye.getByRole('button', { name: 'Изучить ранг I' }).click();
  await talents.getByText(/Свободно очков: 0 из 1/).waitFor();
  assert.deepEqual(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('skazki.profile')).classes.archer.talents,
    ),
    { 'archer.b1.n01': 1 },
  );
  assert.equal(
    await talents
      .getByRole('listitem', { name: /^Меткий глаз: Ранг I$/ })
      .getByRole('button', { name: 'Изучить ранг II' })
      .isDisabled(),
    true,
    'no points left',
  );
  await talents.getByRole('button', { name: /Маг/ }).click();
  assert.match(await talents.innerText(), /Свободно очков: 0 из 0/);
  await page.screenshot({ path: 'artifacts/campaign-12-talents.png', fullPage: true });
  await nav.getByRole('button', { name: 'Персонаж', exact: true }).click();
  await page.getByRole('article', { name: /Маг/ }).getByRole('button', { name: 'Выбрать' }).click();
  await nav.getByRole('button', { name: 'Карты', exact: true }).click();
  await page.getByRole('button', { name: 'Играть: карта 2', exact: true }).click();
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  s = await state();
  assert.equal(s.world.campaign.mapId, 2);
  assert.equal(s.world.character.characterClass, 'mage');
  assert.equal(s.world.character.permanentLevel, 1, 'mage XP is separate from archer XP');

  // Quit mid-run: abandoned, no rewards, recorded once.
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const buildLabel = /^Версия сборки: v\d+\.\d+\.\d+ · ([0-9a-f]{7}|unknown)$/;
  await page.getByRole('dialog').getByLabel(buildLabel).waitFor(); // 3.1 pause screen
  // 3.3 «Сообщить о проблеме» from the pause screen: a JSON report with every field.
  const [reportDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Сообщить о проблеме' }).click(),
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
  assert.equal(report.save.profile.gold, 75);
  assert.match(report.userAgent, /Chrome/);
  await page.getByRole('status').filter({ hasText: 'Отчёт сохранён' }).waitFor();
  await page.getByRole('button', { name: /Выйти в меню · забег не засчитается/ }).click();
  await nav.waitFor();
  const afterQuit = await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.profile')));
  assert.equal(afterQuit.gold, 75);
  assert.equal(afterQuit.classes.mage.lifetimeXp, 0);
  assert.equal(afterQuit.recentRuns[0].outcome, 'abandoned');
  assert.equal(afterQuit.stats.runs, 2);

  // Reload during a run abandons it as well (committed on pagehide).
  await page.getByRole('button', { name: 'Начать забег' }).click();
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  await page.reload();
  await page.waitForFunction(() => !!window.__alpha);
  const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.profile')));
  assert.equal(afterReload.recentRuns[0].outcome, 'abandoned');
  assert.equal(afterReload.stats.runs, 3);
  assert.equal(afterReload.gold, 75);

  // 5.5 Save Management: status, warning, export download, import (invalid → unchanged; valid →
  // confirm → replace), visible warning on a write failure.
  await nav.getByRole('button', { name: 'Настройки', exact: true }).click();
  const mgmt = page.getByRole('region', { name: 'Управление сохранением' });
  assert.match(await mgmt.innerText(), /Прогресс сохранён/);
  assert.match(await mgmt.innerText(), /Очистка данных сайта или браузера удалит его/);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    mgmt.getByRole('button', { name: 'Экспорт сохранения' }).click(),
  ]);
  assert.match(download.suggestedFilename(), /^skazki-save-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(
    await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'),
  );
  assert.equal(exported.gold, 75);
  const stored = () => page.evaluate(() => localStorage.getItem('skazki.profile'));
  const before = await stored();
  await page.getByLabel('Файл сохранения').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion": 1, oops'),
  });
  await page.getByText(/Файл не импортирован: Файл сохранения повреждён/).waitFor();
  assert.equal(await stored(), before, 'invalid import leaves the save unchanged');
  await page.getByLabel('Файл сохранения').setInputFiles({
    name: 'newer.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...exported, schemaVersion: 9 })),
  });
  await page.getByText(/более новой версией игры/).waitFor();
  assert.equal(await stored(), before);
  await page.getByLabel('Файл сохранения').setInputFiles({
    name: 'rich.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...exported, gold: 999 })),
  });
  const confirm = page.getByRole('dialog', { name: 'Заменить сохранение?' });
  await confirm.waitFor();
  assert.match(await confirm.innerText(), /золото 999/);
  assert.equal(
    await confirm.getByRole('button', { name: 'Сначала экспортировать текущее' }).count(),
    1,
  );
  await confirm.getByRole('button', { name: 'Отмена' }).click();
  assert.equal(await stored(), before, 'cancel changes nothing');
  await page.getByLabel('Файл сохранения').setInputFiles({
    name: 'rich.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...exported, gold: 999 })),
  });
  await confirm.getByRole('button', { name: 'Заменить сохранение' }).click();
  await page.getByText('Сохранение импортировано.').waitFor();
  assert.equal(JSON.parse(await stored()).gold, 999);
  assert.equal(await page.getByLabel('Золото: 999').count(), 1);
  // Import the original export back (round-trip).
  await page.getByLabel('Файл сохранения').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await confirm.getByRole('button', { name: 'Заменить сохранение' }).click();
  await page.getByText('Сохранение импортировано.').waitFor();
  assert.equal(JSON.parse(await stored()).gold, 75);
  await page.screenshot({ path: 'artifacts/campaign-07-settings.png', fullPage: true });
  // Write failure: storage refuses writes → visible warning, nothing claimed as saved.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.__restoreStorage = () => (Storage.prototype.setItem = original);
    Storage.prototype.setItem = function () {
      throw new DOMException('full', 'QuotaExceededError');
    };
  });
  await nav.getByRole('button', { name: 'Персонаж', exact: true }).click();
  await page
    .getByRole('article', { name: /Воин/ })
    .getByRole('button', { name: 'Выбрать' })
    .click();
  const banner = page.locator('.save-banner');
  await banner.waitFor();
  assert.match(await banner.innerText(), /НЕ сохранены[\s\S]*закончилось место/);
  await page.screenshot({ path: 'artifacts/campaign-08-save-warning.png' });
  await page.evaluate(() => window.__restoreStorage());
  await nav.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByRole('button', { name: 'Повторить сохранение' }).click();
  await page.getByText('Прогресс сохранён.', { exact: true }).first().waitFor();
  assert.equal(JSON.parse(await stored()).selectedClass, 'warrior');
  assert.equal(await banner.count(), 0);

  // 6.1 DEV campaign tools (normal pipelines): unlock maps, class level, Gold, boss, force win.
  await page.getByRole('button', { name: /DEV · Тестирование/ }).click();
  const devProfile = page.getByRole('group', { name: 'Campaign Debug' });
  await devProfile.getByRole('button', { name: 'Открыть все карты' }).click();
  await page.getByLabel('Debug уровень класса').fill('12');
  await devProfile.getByRole('button', { name: /Установить уровень/ }).click();
  await page.getByLabel('Debug золото').fill('500');
  await devProfile.getByRole('button', { name: 'Выдать золото' }).click();
  const devSave = JSON.parse(await stored());
  assert.equal(devSave.highestUnlockedMap, 10);
  assert.equal(devSave.classes[devSave.selectedClass].level, 12);
  const goldBefore = devSave.gold;
  await nav.getByRole('button', { name: 'Карты', exact: true }).click();
  await page.getByRole('button', { name: 'Играть: карта 10', exact: true }).click();
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  assert.equal((await state()).world.character.permanentLevel, 12);
  const devRun = page.getByRole('group', { name: 'Campaign Run Debug' });
  const killsBefore = (await state()).world.kills;
  await page.evaluate(() =>
    window.__alpha.command({ type: 'spawning', settings: { enabled: false } }),
  );
  await page.evaluate(() =>
    window.__alpha.command({ type: 'spawn', kind: 'melee', distance: 150 }),
  );
  await devRun.getByRole('button', { name: 'Убить всех на экране' }).click();
  await page.waitForFunction((k) => window.__alpha.state().world.kills > k, killsBefore);
  await devRun.getByRole('button', { name: 'Призвать босса' }).click();
  await page.getByRole('progressbar', { name: 'Здоровье босса' }).waitFor();
  await devRun.getByRole('button', { name: 'HP босса → 10%' }).click();
  const speed = page.getByRole('group', { name: 'Ускорение забега' });
  await speed.getByRole('button', { name: '×8' }).click();
  await page.waitForFunction(() => window.__alpha.state().timeScale === 8);
  assert.equal(
    await speed.getByRole('button', { name: '×8' }).getAttribute('aria-pressed'),
    'true',
  );
  await devRun.getByRole('button', { name: 'Победа', exact: true }).click();
  const devResults = page.getByRole('dialog', { name: 'Победа.' });
  await devResults.waitFor();
  await page.waitForFunction(() =>
    document.querySelector('.results-save')?.textContent?.includes('Прогресс сохранён'),
  );
  const afterDev = JSON.parse(await stored());
  assert.ok(afterDev.completedMaps.includes(10), 'forced victory completes Map 10');
  assert.ok(afterDev.gold > goldBefore, 'forced victory pays through the normal results pipeline');
  await page.screenshot({ path: 'artifacts/campaign-10-dev-victory.png' });
  await devResults.getByRole('button', { name: 'В меню' }).click();
  await nav.waitFor();
  page.once('dialog', (d) => d.accept());
  await devProfile.getByRole('button', { name: 'Сбросить тестовый прогресс' }).click();
  await page.getByLabel('Золото: 0').waitFor();
  assert.equal(JSON.parse(await stored()).highestUnlockedMap, 1);
  // Task 09 §1.6 (DEV): talent debug — superpower preset, set a rank, reset the tree.
  const talentDebug = page.getByRole('group', { name: 'Talent Debug' });
  await talentDebug.getByRole('button', { name: 'Пресет сверхспособности вкл/выкл' }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('skazki.profile')).classes.warrior.talents[
        'warrior.b3.n01'
      ] === 1,
  );
  assert.equal(JSON.parse(await stored()).classes.warrior.level, 30);
  await talentDebug.getByLabel('Debug талант').selectOption('warrior.b1.n03');
  await talentDebug.getByLabel('Debug ранг таланта').selectOption('3');
  await talentDebug.getByRole('button', { name: 'Установить ранг таланта' }).click();
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
  await talentDebug.getByRole('button', { name: 'Сбросить дерево талантов' }).click();
  await page.waitForFunction(
    () =>
      Object.keys(JSON.parse(localStorage.getItem('skazki.profile')).classes.warrior.talents)
        .length === 0,
  );
  await page.getByRole('button', { name: /DEV · Закрыть/ }).click();

  // Task 08.5 §3.2: a crash mid-run shows the friendly screen, logs the error in its own key,
  // leaves the save byte-identical and «Вернуться в меню» recovers a working game.
  await page.evaluate(() => localStorage.removeItem('skazki.errors'));
  await page.getByRole('button', { name: 'Начать забег' }).click();
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  const saveBeforeCrash = await stored();
  page.once('pageerror', () => {}); // the simulated error is expected
  const expectedErrors = errors.length;
  await page.getByRole('button', { name: /DEV · Тестирование/ }).click();
  await page.getByRole('button', { name: 'Сымитировать сбой' }).click();
  const crashDialog = page.getByRole('alertdialog', { name: 'Что-то пошло не так.' });
  await crashDialog.waitFor();
  assert.match(await crashDialog.innerText(), /сохранение не изменено/);
  await page.screenshot({ path: 'artifacts/campaign-11-crash.png' });
  const errorLog = await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.errors')));
  assert.ok(errorLog.length >= 1 && errorLog.length <= 5);
  assert.match(errorLog.at(-1).message, /Debug crash/);
  assert.equal(await stored(), saveBeforeCrash, 'the crash never writes the save');
  await crashDialog.getByRole('button', { name: 'Вернуться в меню' }).click();
  await nav.waitFor();
  assert.equal(await stored(), saveBeforeCrash, 'recovery never writes the save');
  await page.waitForFunction(() => window.__alpha?.state().screen === 'menu');
  await page.getByRole('button', { name: 'Начать забег' }).click();
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.getByRole('button', { name: /Выйти в меню · забег не засчитается/ }).click();
  await nav.waitFor();
  errors.length = expectedErrors; // drop the simulated crash from the unexpected-error list

  // Task 08.5 §4.2 (DEV): start the selected map with a given seed.
  await page.getByRole('button', { name: /DEV · Тестирование/ }).click();
  await page.getByLabel('Debug сид').fill('424242');
  await page.getByRole('button', { name: 'Начать выбранную карту с этим сидом' }).click();
  await page.waitForFunction(() => window.__alpha.state().world?.seed === 424242);
  await page.getByRole('button', { name: /DEV · Закрыть/ }).click();
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.getByRole('button', { name: /Выйти в меню · забег не засчитается/ }).click();
  await nav.waitFor();

  // Task 08.5 §3.4 (DEV): load the earlier report → its save goes through the normal import.
  const saveBeforeReport = await stored();
  await page.getByRole('button', { name: /DEV · Тестирование/ }).click();
  await page.getByLabel('Debug файл отчёта').setInputFiles(reportPath);
  const replace = page.getByRole('button', { name: 'Заменить сохранение' });
  await replace.waitFor();
  assert.equal(await stored(), saveBeforeReport, 'nothing changes before confirmation');
  await replace.click();
  await page.getByText('Сохранение импортировано.').waitFor();
  const imported = JSON.parse(await stored());
  assert.equal(imported.profileId, report.save.profile.profileId);
  assert.equal(imported.gold, 75);
  await page.getByRole('button', { name: /DEV · Закрыть/ }).click();

  // Task 08.5 §5.3: «Тряска экрана» (on by default) lives in its own settings key.
  await nav.getByRole('button', { name: 'Настройки', exact: true }).click();
  const shake = page.getByRole('checkbox', { name: 'Тряска экрана' });
  assert.equal(await shake.isChecked(), true);
  const saveBeforeSetting = await stored();
  await shake.uncheck();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.settings'))), {
    screenShake: false,
  });
  assert.equal(await stored(), saveBeforeSetting, 'settings never touch the save');
  await page.reload();
  await page.waitForFunction(() => !!window.__alpha);
  await nav.getByRole('button', { name: 'Настройки', exact: true }).click();
  assert.equal(await page.getByRole('checkbox', { name: 'Тряска экрана' }).isChecked(), false);
  await page.getByRole('checkbox', { name: 'Тряска экрана' }).check();

  // Phone width: every menu page fits without horizontal scrolling.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tab of ['Играть', 'Персонаж', 'Карты', 'Прогресс', 'Настройки']) {
    await nav.getByRole('button', { name: tab, exact: true }).click();
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${tab} fits a phone`,
    );
  }
  await nav.getByRole('button', { name: 'Карты', exact: true }).click();
  await page.screenshot({ path: 'artifacts/campaign-09-maps-mobile.png', fullPage: true });

  if (errors.length) throw new Error(errors.join('\n'));
  console.log(
    'PASS campaign: menu/Gold, Character, Maps (lock/boss reveal), Map 1 win → results/rewards/unlock/save, reload keeps progress, Map 2 with another class (separate XP, shared Gold), quit/reload = abandoned without rewards, Save Management (export, invalid/newer import unchanged, confirm/cancel/replace, round-trip), write-failure warning + retry, DEV campaign tools (unlock/level/Gold, boss, forced Map 10 win, reset); 08.5: time scale, kill-all, stats panel, debug overlay, build label, report download, crash recovery (save untouched), report → save import.',
  );
} finally {
  await browser.close();
}
