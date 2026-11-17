import { useState, useSyncExternalStore } from 'react';
import type { CharacterClass } from '../../character-stats';
import { artManifestStore, artUrl } from '../../engine/visuals/art-pack';
import { portraitArtKey } from '../../engine/visuals/art-registry';
import { ClassEmblem } from './ClassEmblem';

/**
 * Task 25: the class portrait from the owner's art pack (`portrait_<class>`) in a framed tile with
 * the class accent. Falls back to the procedural `ClassEmblem` while the manifest loads, when the
 * pack has no portrait for the class, or if the image fails — so the layout never breaks.
 * Decorative (`alt=""`): the class name is always shown next to it.
 */
export function ClassPortrait({
  characterClass,
  size = 96,
  glow = false,
}: {
  characterClass: CharacterClass;
  size?: number;
  glow?: boolean;
}) {
  const manifest = useSyncExternalStore(artManifestStore.subscribe, artManifestStore.getSnapshot);
  const [failed, setFailed] = useState(false);
  const entry = manifest?.get(portraitArtKey(characterClass));
  if (!entry || failed)
    return <ClassEmblem characterClass={characterClass} size={size} glow={glow} />;
  return (
    <span
      className={`class-portrait emblem-${characterClass} ${glow ? 'glow' : ''}`}
      style={{ width: size, height: size }}
      data-portrait={characterClass}
    >
      <img
        src={artUrl(entry.file)}
        alt=""
        width={size}
        height={size}
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
      />
    </span>
  );
}
