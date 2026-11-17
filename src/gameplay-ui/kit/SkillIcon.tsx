import { useState, useSyncExternalStore } from 'react';
import type { ArtManifest } from '../../engine/visuals/art-manifest';
import { artManifestStore, artUrl, loadArtManifest } from '../../engine/visuals/art-pack';
import { skillIconEntries, skillIconEntry } from '../../engine/visuals/art-registry';

/**
 * Task 27: displayed skill icon sizes in CSS px, all set here. The art is 128 px, so even the
 * 96 px card icon is sharp at DPR 1 and close to sharp at DPR 2. `hudTouch` keeps the Task 16
 * minimum touch size (44 px) on coarse pointers and short landscape phones.
 */
export const SKILL_ICON_SIZES = Object.freeze({
  /** Level-up offer card. */
  card: 96,
  /** Level-up offer card on short landscape phones / narrow screens (cards stay compact). */
  cardCompact: 64,
  /** In-run HUD active skills (desktop). */
  hud: 44,
  /** In-run HUD active skills on touch / short landscape screens (Task 16 minimum). */
  hudTouch: 44,
  /** Pause skill list. */
  list: 32,
  /** Results / run stats damage sources (keeps the rows as tight as the text rows). */
  stats: 24,
  /** Inline icons inside synergy pair rows and card hints. */
  pair: 20,
});
export type SkillIconSize = keyof typeof SKILL_ICON_SIZES;
/** The size config as CSS custom properties (`--skill-icon-<size>`), read by `alpha.css`. */
export const skillIconSizeVars = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(SKILL_ICON_SIZES).map(([k, px]) => [`--skill-icon-${k}`, `${px}px`]),
  );
// Installed once on the document root, so every screen (and its media queries) reads this config.
if (typeof document !== 'undefined')
  for (const [name, value] of Object.entries(skillIconSizeVars()))
    document.documentElement.style.setProperty(name, value);

/** Force monochrome text presentation so fallback glyphs never render as colour emoji. */
export const textGlyph = (icon: string) => `${icon}︎`;

/**
 * Task 27: share of the cooldown still left (0 ready … 1 just fired) for the radial overlay. A
 * cooldown shortened mid-way (Haste-style reductions) simply shows a smaller sector; an unknown
 * total (0) shows a full overlay rather than nothing.
 */
export function cooldownLeftFraction(left: number, total: number): number {
  if (!(left > 0)) return 0;
  if (!(total > 0)) return 1;
  return Math.min(1, left / total);
}

/** What a skill icon shows: the pack image, or the catalogue glyph (pure; tests use this). */
export function skillIconView(
  manifest: ArtManifest | null,
  skillId: string | null,
  glyph: string,
): { readonly src: string } | { readonly glyph: string } {
  const entry = skillId ? skillIconEntry(manifest, skillId) : null;
  return entry ? { src: artUrl(entry.file) } : { glyph: textGlyph(glyph) };
}

const kept: HTMLImageElement[] = [];
let preloading = false;
/**
 * Starts loading every skill icon as soon as the manifest is known (the in-run screens then draw
 * them without a blank frame). Called once per page; images that fail simply keep the glyph.
 */
export function preloadSkillIcons(): void {
  if (preloading || typeof Image === 'undefined') return;
  preloading = true;
  void loadArtManifest().then((manifest) => {
    for (const entry of skillIconEntries(manifest)) {
      const img = new Image();
      img.decoding = 'async';
      img.src = artUrl(entry.file);
      kept.push(img);
    }
  });
}

/** Presentational icon for a given manifest (also used by server-side render tests). */
export function SkillIconView({
  manifest,
  skillId,
  glyph,
  size,
  className,
}: {
  manifest: ArtManifest | null;
  skillId: string | null;
  glyph: string;
  size: SkillIconSize;
  className?: string;
}) {
  // The image that failed to load (a later, different icon on the same element is tried again).
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const art = skillIconView(manifest, skillId, glyph);
  const view = 'src' in art && art.src === failedSrc ? { glyph: textGlyph(glyph) } : art;
  const cls = `skill-icon skill-icon-${size}${className ? ` ${className}` : ''}`;
  if ('src' in view)
    return (
      <img
        className={`${cls} has-art`}
        src={view.src}
        alt=""
        aria-hidden="true"
        width={SKILL_ICON_SIZES[size]}
        height={SKILL_ICON_SIZES[size]}
        decoding="async"
        draggable={false}
        onError={() => setFailedSrc(view.src)}
      />
    );
  return (
    <i className={`${cls} is-glyph`} aria-hidden="true">
      {view.glyph}
    </i>
  );
}

/**
 * Task 27: a skill's round icon from art pack 3 (no frame; the art has its own soft glow), or its
 * catalogue glyph while the manifest loads, when the skill has no icon, or when the image fails.
 * Decorative: the surrounding text / aria-label names the skill.
 */
export function SkillIcon(props: {
  skillId: string | null;
  glyph: string;
  size: SkillIconSize;
  className?: string;
}) {
  const manifest = useSyncExternalStore(
    artManifestStore.subscribe,
    artManifestStore.getSnapshot,
    artManifestStore.getServerSnapshot,
  );
  return <SkillIconView manifest={manifest} {...props} />;
}
