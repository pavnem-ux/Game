import { parseArtManifest } from './art-manifest';
import type { ArtManifest } from './art-manifest';

/**
 * Task 25: the art-pack manifest, fetched once per page and shared by the in-run scene (unit
 * textures) and the menus (portraits). No Phaser here. A missing or invalid manifest is not an
 * error for the player: everything keeps its procedural art and a warning is logged once.
 */
export const ART_MANIFEST_FILE = 'assets/manifest.json';
/** URL of a pack file (`assets/…`) under the site's base path (works on nested SPA routes). */
export const artUrl = (file: string): string => `${import.meta.env.BASE_URL}${file}`;

let pending: Promise<ArtManifest | null> | null = null;
let current: ArtManifest | null = null;

export function loadArtManifest(): Promise<ArtManifest | null> {
  pending ??= fetch(artUrl(ART_MANIFEST_FILE))
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((text) => (current = parseArtManifest(text)))
    .catch((e: unknown) => {
      console.warn(`[art] manifest unavailable, using procedural art: ${(e as Error).message}`);
      return null;
    });
  return pending;
}
/** The manifest if it has already loaded (null before, or when unavailable). */
export const artManifest = (): ArtManifest | null => current;
