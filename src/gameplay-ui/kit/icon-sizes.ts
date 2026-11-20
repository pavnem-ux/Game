/**
 * Task 27 / 28: displayed sizes (CSS px) of every art-pack icon in the UI, all set here and
 * installed once as `--icon-<size>` custom properties on the document root, which `alpha.css`
 * reads (media queries pick the compact / touch variants). Provisional, for the owner to tune.
 * Sources: skill and synergy icons 128 px, talent branch emblems 192 px.
 */
export const ICON_SIZES = Object.freeze({
  /** Level-up offer card (skill). */
  card: 96,
  /** Level-up offer card on short landscape phones / narrow screens (cards stay compact). */
  cardCompact: 64,
  /** In-run HUD active skills (desktop). */
  hud: 44,
  /** In-run HUD active skills on touch / short landscape screens (Task 16 minimum). */
  hudTouch: 44,
  /** Pause skill list and synergy list. */
  list: 32,
  /** Results / run stats damage sources (keeps the rows as tight as the text rows). */
  stats: 24,
  /** Inline icons in synergy pair rows and card hints («▲ Synergy II»). */
  pair: 20,
  /** Task 28: synergy banners (unlock / level II / awakening). */
  banner: 72,
  /** Task 28: synergy banners on short landscape phones. */
  bannerCompact: 44,
  /** Task 28: talent branch header emblem. */
  branch: 96,
  /** Task 28: talent branch header emblem on short landscape phones. */
  branchCompact: 64,
  /** Task 28: talent node (the branch emblem with number badge and rank pips). */
  talentNode: 56,
  /** Task 28: talent node on touch screens (stays ≥ the Task 16 44 px minimum). */
  talentNodeTouch: 48,
  /** Task 30: item icon on shop / owned / forge cards. */
  itemCard: 48,
  /** Task 30: item icon in a paper-doll equipment slot. */
  itemSlot: 40,
  /** Task 30: item icon in the item details and forge upgrade panels. */
  itemDetail: 64,
  /** Task 30: item icon inline in compare titles and quest rewards. */
  itemSmall: 24,
  /** Task 31: buff icon in the HUD buff bar. */
  buff: 28,
  /** Task 31: buff / magnet icon in the chest pickup popup. */
  popup: 32,
  /** Task 31: the game emblem above the hub title (the source is 512 px). */
  emblem: 168,
  /** Task 31: the emblem on short / narrow screens. */
  emblemCompact: 96,
  /** Task 32: the boss portrait in the map-path side panel (the source is 512 px). */
  bossPanel: 72,
});
export type IconSize = keyof typeof ICON_SIZES;
/** The size config as CSS custom properties (`--icon-<size>`). */
export const iconSizeVars = (): Record<string, string> =>
  Object.fromEntries(Object.entries(ICON_SIZES).map(([k, px]) => [`--icon-${k}`, `${px}px`]));
// Installed once on the document root, so every screen (and its media queries) reads this config.
if (typeof document !== 'undefined')
  for (const [name, value] of Object.entries(iconSizeVars()))
    document.documentElement.style.setProperty(name, value);
