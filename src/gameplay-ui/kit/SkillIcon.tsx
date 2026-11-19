import { useState, useSyncExternalStore } from 'react';
import type { ArtManifest } from '../../engine/visuals/art-manifest';
import { artManifestStore, artUrl, loadArtManifest } from '../../engine/visuals/art-pack';
import {
  skillIconEntries,
  skillIconEntry,
  itemIconEntries,
  petArtEntry,
  synergyIconEntries,
  talentBranchIconEntries,
} from '../../engine/visuals/art-registry';
import { PET_IDS } from '../../pets/config';
import { ICON_SIZES, iconSizeVars } from './icon-sizes';
import type { IconSize } from './icon-sizes';

/** Task 27 names for the shared icon size config (Task 28 moved it to `icon-sizes.ts`). */
export const SKILL_ICON_SIZES = ICON_SIZES;
export type SkillIconSize = IconSize;
export const skillIconSizeVars = iconSizeVars;

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
 * Starts loading every skill icon (Task 27), synergy icon and talent branch emblem (Task 28) as
 * soon as the manifest is known, so the screens draw them without a blank frame. Called once per
 * page; images that fail simply keep the current look.
 */
export function preloadSkillIcons(): void {
  if (preloading || typeof Image === 'undefined') return;
  preloading = true;
  void loadArtManifest().then((manifest) => {
    const entries = [
      ...skillIconEntries(manifest),
      ...synergyIconEntries(manifest),
      ...talentBranchIconEntries(manifest),
      ...itemIconEntries(manifest),
      ...PET_IDS.map((id) => petArtEntry(manifest, id)).filter((e) => e !== null),
    ];
    for (const entry of entries) {
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
        width={ICON_SIZES[size]}
        height={ICON_SIZES[size]}
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
