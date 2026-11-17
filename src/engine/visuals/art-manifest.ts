/**
 * Task 25: the owner's art-pack manifest (`public/assets/manifest.json`), parsed and validated
 * (pure; no Phaser, no DOM). Key = file name without extension; `file` is relative to the site root
 * (served from `public/`); `size` is the image size in px; `anchor` is where the image is pinned
 * (`bottom-center` for units: the feet, `center` for portraits). Extra fields (e.g. `source`) are
 * ignored. Future packs add entries in the same format.
 */
export type ArtAnchor = 'bottom-center' | 'center';
export interface ArtEntry {
  readonly key: string;
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly anchor: ArtAnchor;
}
export type ArtManifest = ReadonlyMap<string, ArtEntry>;

export class ArtManifestError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid art manifest: ${problems.join('; ')}`);
    this.name = 'ArtManifestError';
  }
}

const KEY = /^[a-z0-9_]+$/;
const FILE = /^assets\/(?:[a-z0-9_-]+\/)*([a-z0-9_]+)\.(?:webp|png)$/;
const ANCHORS: readonly string[] = ['bottom-center', 'center'];
/** Largest accepted image side (px): keeps a broken entry from asking for a huge texture. */
export const MAX_ART_SIZE = 2048;

/**
 * Top-level object keys that occur more than once in the JSON text. `JSON.parse` silently keeps the
 * last one, so duplicates are detected on the raw text (strings and nesting are tracked).
 */
export function duplicateTopLevelKeys(text: string): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\') {
          s += text[j + 1] ?? '';
          j += 2;
        } else s += text[j++];
      }
      if (depth === 1) {
        let k = j + 1;
        while (k < text.length && /\s/.test(text[k])) k++;
        if (text[k] === ':') {
          if (seen.has(s)) dup.add(s);
          seen.add(s);
        }
      }
      i = j;
    } else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
  }
  return [...dup];
}

/** Parses and validates the manifest text; throws `ArtManifestError` listing every problem. */
export function parseArtManifest(text: string): ArtManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ArtManifestError([`not JSON (${(e as Error).message})`]);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new ArtManifestError(['the manifest must be a JSON object']);
  const problems = duplicateTopLevelKeys(text).map((k) => `duplicate key "${k}"`);
  const out = new Map<string, ArtEntry>();
  const files = new Set<string>();
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const bad = (why: string) => problems.push(`${key}: ${why}`);
    if (!KEY.test(key)) {
      bad('key must be lowercase letters, digits and _');
      continue;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      bad('entry must be an object');
      continue;
    }
    const v = value as Record<string, unknown>;
    const file = typeof v.file === 'string' ? v.file : '';
    const m = FILE.exec(file);
    if (!m) bad(`file "${file}" must be assets/…/<key>.webp or .png`);
    else if (m[1] !== key) bad(`file name "${m[1]}" does not match the key`);
    else if (files.has(file)) bad(`file "${file}" is used twice`);
    const size = v.size;
    const okSize =
      Array.isArray(size) &&
      size.length === 2 &&
      size.every((n) => Number.isInteger(n) && n > 0 && n <= MAX_ART_SIZE);
    if (!okSize) bad(`size must be [width, height] in 1–${MAX_ART_SIZE} px`);
    const anchor = typeof v.anchor === 'string' ? v.anchor : '';
    if (!ANCHORS.includes(anchor)) bad(`anchor "${anchor}" must be ${ANCHORS.join(' or ')}`);
    if (!m || m[1] !== key || files.has(file) || !okSize || !ANCHORS.includes(anchor)) continue;
    files.add(file);
    const [width, height] = size as [number, number];
    out.set(key, Object.freeze({ key, file, width, height, anchor: anchor as ArtAnchor }));
  }
  if (problems.length) throw new ArtManifestError(problems);
  return out;
}
