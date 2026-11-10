import assert from 'node:assert/strict';

export async function checkQaTools(page) {
  const state = () => page.evaluate(() => window.__alpha.state());
  const command = (action) => page.evaluate((a) => window.__alpha.command(a), action);
  await page.setViewportSize({ width: 1200, height: 800 });
  const restart = () =>
    command({
      type: 'restart',
      options: {
        characterClass: 'warrior',
        level: 1,
        seed: 7,
        onHit: [],
        initialEnemies: false,
        spawning: { enabled: false },
      },
    });
  await restart();
  await page.getByRole('button', { name: 'QA · Тестирование' }).click();
  const god = page.getByRole('checkbox', { name: 'God Mode', exact: true });
  assert.equal(await god.isChecked(), false);
  const diagnostics = page.getByRole('group', { name: 'Synergy Diagnostics', exact: true });
  await diagnostics.waitFor();
  for (const id of ['battle_momentum', 'skull_crusher', 'seismic_impact']) {
    assert.ok(
      (await diagnostics.locator(`[data-synergy-id="${id}"]`).innerText()).includes(
        'Заблокирована',
      ),
    );
  }
  await god.check();
  assert.equal((await state()).qa.godMode, true);
  const grant = async (skillId) => {
    await page.getByLabel('DEV навык').selectOption(skillId);
    await page.getByRole('button', { name: 'Выдать навык', exact: true }).click();
  };
  // Task 07.2 v2: one skill of a pair unlocks nothing; each completed workbook pair unlocks its rule.
  await grant('ground_slam');
  assert.ok((await state()).qa.synergies.every((s) => !s.unlocked));
  await grant('battle_fury'); // passive partner: Ground Slam + Battle Fury → Battle Momentum only
  assert.deepEqual(
    (await state()).qa.synergies.filter((s) => s.unlocked).map((s) => s.id),
    ['battle_momentum'],
  );
  await page.getByRole('button', { name: 'QA · Закрыть' }).click();
  await command({ type: 'spawn', kind: 'melee', distance: 50 });
  await page.waitForFunction(() => window.__alpha.presentation().stunIndicators.length > 0);
  await page.keyboard.press('p');
  assert.equal((await state()).screen, 'paused');
  const stunned = await page.evaluate(() => window.__alpha.presentation().stunIndicators);
  assert.ok(stunned.every((s) => s.text === 'СТАН'));
  await page.screenshot({
    path: 'artifacts/alpha-15-stun.png',
    style: '.modal-overlay { visibility: hidden !important; }',
  });
  await page.waitForTimeout(100);
  assert.deepEqual(
    await page.evaluate(() => window.__alpha.presentation().stunIndicators),
    stunned,
  );
  await page.getByRole('button', { name: 'Продолжить', exact: false }).click();
  await page.evaluate(() => window.__alpha.advance(0.65));
  await page.getByRole('button', { name: 'QA · Тестирование' }).click();
  for (const skillId of ['cleave', 'shield_bash']) await grant(skillId);
  assert.ok((await state()).qa.synergies.every((s) => s.unlocked && s.completedPairs.length > 0));
  assert.match(
    await diagnostics.locator('[data-synergy-id="seismic_impact"]').innerText(),
    /Разблокирована парой: ground_slam \+ shield_bash/,
  );
  await page.getByRole('button', { name: 'QA · Закрыть' }).click();
  assert.equal((await page.evaluate(() => window.__alpha.presentation().stunIndicators)).length, 0);
  const hp = (await state()).world.player.currentHp;
  await command({
    type: 'effect',
    targetId: 'player',
    effectType: 'burn',
    stacks: 1,
    damage: 1000000,
    duration: 20,
  });
  await page.evaluate(() => window.__alpha.advance(2));
  const protectedState = await state();
  assert.equal(protectedState.world.player.currentHp, hp);
  assert.ok(protectedState.world.player.alive);
  assert.ok(
    protectedState.world.statuses.some((g) => g.targetId === 'player' && g.effectType === 'burn'),
  );
  assert.ok(protectedState.world.kills > 0, 'outgoing damage still kills enemies');
  for (const diagnostic of protectedState.qa.synergies) {
    assert.equal(
      diagnostic.count,
      protectedState.events.filter(
        (e) => e.event.type === 'synergy-triggered' && e.event.synergyId === diagnostic.id,
      ).length,
    );
  }
  assert.ok(protectedState.qa.synergies.find((s) => s.id === 'battle_momentum').count > 0);
  await page.getByRole('button', { name: 'QA · Тестирование' }).click();
  const skills = (await state()).world.skills;
  await page.getByRole('button', { name: 'Сбросить счётчики синергий' }).click();
  assert.deepEqual((await state()).world.skills, skills);
  assert.ok((await state()).qa.synergies.every((s) => s.count === 0 && s.lastTime === null));
  await god.uncheck();
  await page.evaluate(() => window.__alpha.advance(1.01));
  assert.equal((await state()).world.player.alive, false, 'OFF restores incoming DoT damage');
  await restart();
  assert.equal(await god.isChecked(), false);
  assert.ok((await state()).qa.synergies.every((s) => !s.unlocked && s.count === 0));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await god.check();
  assert.equal((await state()).qa.godMode, true);
  await page.screenshot({ path: 'artifacts/alpha-16-qa-diagnostics-mobile.png' });
  await page.getByRole('button', { name: 'QA · Закрыть' }).click();
}
