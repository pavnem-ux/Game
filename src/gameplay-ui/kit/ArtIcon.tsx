import { useState, useSyncExternalStore } from 'react';
import type { CharacterClass } from '../../character-stats';
import type { ArtEntry, ArtManifest } from '../../engine/visuals/art-manifest';
import { artManifestStore, artUrl } from '../../engine/visuals/art-pack';
import {
  itemIconEntry,
  synergyIconEntry,
  talentBranchIconEntry,
} from '../../engine/visuals/art-registry';
import { ICON_SIZES } from './icon-sizes';
import type { IconSize } from './icon-sizes';

/** The art manifest for React (null while it loads or when it is unavailable). */
export const useArtManifest = (): ArtManifest | null =>
  useSyncExternalStore(
    artManifestStore.subscribe,
    artManifestStore.getSnapshot,
    artManifestStore.getServerSnapshot,
  );

/**
 * Task 28: a decorative pack image (round art with its own glow, no frame), or nothing: with no
 * entry, or when the image fails, it renders `null` and the screen keeps its current look.
 */
export function ArtImage({
  entry,
  size,
  className,
}: {
  entry: ArtEntry | null;
  size: IconSize;
  className: string;
}) {
  // The image that failed to load (a later, different image on the same element is tried again).
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = entry ? artUrl(entry.file) : null;
  if (!src || src === failedSrc) return null;
  return (
    <img
      className={`art-icon ${className} icon-${size}`}
      src={src}
      alt=""
      aria-hidden="true"
      width={ICON_SIZES[size]}
      height={ICON_SIZES[size]}
      decoding="async"
      draggable={false}
      onError={() => setFailedSrc(src)}
    />
  );
}

/** Synergy icon for a given manifest (server-render tests use this). Level III adds a gold ring. */
export function SynergyIconView({
  manifest,
  synergyId,
  size,
  level = 0,
}: {
  manifest: ArtManifest | null;
  synergyId: string;
  size: IconSize;
  /** 3 = awakened: the same icon with a gold ring and glow drawn in CSS. */
  level?: number;
}) {
  return (
    <ArtImage
      entry={synergyIconEntry(manifest, synergyId)}
      size={size}
      className={`synergy-icon${level >= 3 ? ' is-awakened' : ''}`}
    />
  );
}
/**
 * Task 28: a synergy's icon from art pack 4, or nothing (the text label stays) while the manifest
 * loads, for an unknown synergy, or when the image fails. Decorative.
 */
export function SynergyIcon(props: { synergyId: string; size: IconSize; level?: number }) {
  return <SynergyIconView manifest={useArtManifest()} {...props} />;
}

/** Talent branch emblem for a given manifest (server-render tests use this). */
export function TalentBranchIconView({
  manifest,
  characterClass,
  branch,
  size,
  className = '',
}: {
  manifest: ArtManifest | null;
  characterClass: CharacterClass;
  branch: number;
  size: IconSize;
  className?: string;
}) {
  return (
    <ArtImage
      entry={talentBranchIconEntry(manifest, characterClass, branch)}
      size={size}
      className={`talent-branch-icon${className ? ` ${className}` : ''}`}
    />
  );
}
/** Task 28: a talent branch's emblem from art pack 4, or nothing (current look). Decorative. */
export function TalentBranchIcon(props: {
  characterClass: CharacterClass;
  branch: number;
  size: IconSize;
  className?: string;
}) {
  return <TalentBranchIconView manifest={useArtManifest()} {...props} />;
}

/**
 * Task 30: an item's icon from art pack 5 (shared by every tier of its gear template), with the
 * forge level as a small «+N» badge. Nothing without the icon (the text card is the current look).
 * The tier stays shown by the surrounding tier frame / colour. Decorative.
 */
export function ItemIconView({
  manifest,
  templateId,
  size,
  level = 0,
}: {
  manifest: ArtManifest | null;
  templateId: string;
  size: IconSize;
  /** Forge upgrade level; > 0 shows the «+N» badge. */
  level?: number;
}) {
  const entry = itemIconEntry(manifest, templateId);
  if (!entry) return null;
  return (
    <span className={`item-icon item-icon-${size}`} aria-hidden="true">
      <ArtImage entry={entry} size={size} className="item-art" />
      {level > 0 && <b className="item-upgrade-badge">+{level}</b>}
    </span>
  );
}
export function ItemIcon(props: { templateId: string; size: IconSize; level?: number }) {
  return <ItemIconView manifest={useArtManifest()} {...props} />;
}
