/**
 * Task 45: the meta menu has no top navigation — the hub tiles («Sections») open every page, the
 * title in the top bar and «← Home» return to the hub, and «To battle» opens the campaign map.
 */
export const TITLE = 'The Last Light';
/** The game title in the top bar (always present in the menu; click → hub). */
export const brand = (page) => page.getByRole('button', { name: `${TITLE} — Home`, exact: true });
/** The hub's section tiles. */
export const sections = (page) => page.getByRole('navigation', { name: 'Sections' });

/**
 * Opens a menu page the way a player does: back to the hub, then its tile. `'Home'` stops at the
 * hub. `how` is 'click' (default), 'tap' (touch) or 'dom' (a DOM click, for covered elements).
 */
export async function goTo(page, label, how = 'click') {
  const press = async (locator) => {
    if (how === 'tap') await locator.tap();
    else if (how === 'dom') await locator.evaluate((el) => el.click());
    else await locator.click();
  };
  await brand(page).waitFor();
  if ((await sections(page).count()) === 0) await press(brand(page));
  await sections(page).waitFor();
  if (label === 'Home') return;
  const tile = sections(page).getByRole('button', { name: label, exact: true });
  // The Quests tile carries the reward badge in its name («Quests. N rewards …»).
  await press(
    (await tile.count()) > 0
      ? tile
      : sections(page).getByRole('button', { name: new RegExp(`^${label}\\b`) }),
  );
}

/** Hub → «To battle» → the selected map's «Play: map N» button (optionally checks the map id). */
export async function startMap(page, mapId, how = 'click') {
  await goTo(page, 'Home', how);
  const fight = page.locator('.hub-fight');
  if (how === 'tap') await fight.tap();
  else await fight.click();
  const play = page.getByRole('button', {
    name: mapId === undefined ? /^Play: map \d+$/ : `Play: map ${mapId}`,
    exact: true,
  });
  if (how === 'tap') await play.tap();
  else await play.click();
}
