import { useState } from 'react';
import type { CharacterClass } from '../../character-stats';
import type { ArtManifest } from '../../engine/visuals/art-manifest';
import { artUrl } from '../../engine/visuals/art-pack';
import { classEmblemEntry } from '../../engine/visuals/art-registry';
import { useArtManifest } from './ArtIcon';

interface EmblemProps {
  characterClass: CharacterClass;
  /** Width (px); the art is 4:5, so its height is `size × 1.25` (the SVG stays square). */
  size?: number;
  glow?: boolean;
}
/**
 * Task 37: the class emblem — the owner's shield art (art pack 10) once the manifest has it, with
 * no extra frame and its 4:5 aspect; else (loading, missing key, failed image) the Task 13
 * procedural SVG. Used everywhere a class emblem shows (hub, equipment, talents, portrait fallback).
 */
export function ClassEmblem(props: EmblemProps) {
  return <ClassEmblemView manifest={useArtManifest()} {...props} />;
}
/** The same for a given manifest (server-render tests use this). */
export function ClassEmblemView({
  manifest,
  ...props
}: EmblemProps & { manifest: ArtManifest | null }) {
  const [failed, setFailed] = useState<string | null>(null);
  const entry = classEmblemEntry(manifest, props.characterClass);
  const src = entry ? artUrl(entry.file) : null;
  if (!src || src === failed) return <ClassEmblemSvg {...props} />;
  const size = props.size ?? 64;
  return (
    <img
      className={`class-emblem class-emblem-art emblem-${props.characterClass} ${props.glow ? 'glow' : ''}`}
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={Math.round(size * 1.25)}
      decoding="async"
      draggable={false}
      onError={() => setFailed(src)}
    />
  );
}

/**
 * Task 13: original procedural class emblems (inline SVG, no external art). A shield-shaped crest
 * in the class accent colour with a simple mark: crossed swords (Warrior), staff with a star (Mage),
 * bow and arrow (Archer), twin daggers under a crescent (Rogue).
 */
export function ClassEmblemSvg({
  characterClass,
  size = 64,
  glow = false,
}: {
  characterClass: CharacterClass;
  size?: number;
  glow?: boolean;
}) {
  return (
    <svg
      className={`class-emblem emblem-${characterClass} ${glow ? 'glow' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="emblem-crest"
        d="M32 3 L56 11 L56 30 C56 45 45 55 32 61 C19 55 8 45 8 30 L8 11 Z"
      />
      <path
        className="emblem-rim"
        d="M32 7 L52 14 L52 30 C52 43 43 51 32 56 C21 51 12 43 12 30 L12 14 Z"
      />
      <g className="emblem-mark">{MARKS[characterClass]}</g>
    </svg>
  );
}

const MARKS: Record<CharacterClass, React.ReactNode> = {
  warrior: (
    <>
      <path d="M20 44 L42 18 M42 18 L44 16 L45 19 Z" />
      <path d="M44 44 L22 18 M22 18 L20 16 L19 19 Z" />
      <path d="M17 41 L23 47 M47 41 L41 47" />
      <circle cx="32" cy="31" r="3" />
    </>
  ),
  mage: (
    <>
      <path d="M32 50 L32 24" />
      <path d="M32 13 L34.5 19.5 L41 20 L36 24.5 L37.5 31 L32 27.5 L26.5 31 L28 24.5 L23 20 L29.5 19.5 Z" />
      <path d="M27 50 L37 50" />
    </>
  ),
  archer: (
    <>
      <path d="M22 14 C40 22 40 42 22 50" />
      <path d="M22 14 L22 50" />
      <path d="M18 32 L46 32 M46 32 L40 28 M46 32 L40 36" />
      <path d="M18 32 L15 29 M18 32 L15 35" />
    </>
  ),
  rogue: (
    <>
      <path d="M23 47 L35 23 L37 24 L26 48 Z" />
      <path d="M41 47 L29 23 L27 24 L38 48 Z" />
      <path d="M26 15 C30 11 38 11 41 17 C37 14 31 14 26 15 Z" />
    </>
  ),
};
