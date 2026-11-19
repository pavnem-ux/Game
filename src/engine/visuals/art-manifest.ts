/**
 * Task 25: the owner's art-pack manifest (`public/assets/manifest.json`), parsed and validated
 * (pure; no Phaser, no DOM). Key = file name without extension; `file` is relative to the site root
 * (served from `public/`); `size` is the image size in px; `anchor` is where the image is pinned
 * (`bottom-center` for units: the feet, `center` for portraits and pickups, `tile` for seamless
 * ground textures — Task 26). `kind` (optional, Task 26 packs) says what the image is for. Extra
 * fields (e.g. `source`) are ignored. Future packs add entries in the same format.
 * Task 27 (pack 3): `kind: "skill-icon"` entries are keyed `skill_<skill id>` (file `<skill id>`)
 * and may repeat the id in a `skillId` field, which must then match the file name.
 * Task 28 (pack 4): `synergy-icon` entries are keyed `synergy_<synergy id>` (optional `synergyId`
 * = file name, like `skillId`); `talent-branch-icon` entries are keyed `talent_branch_<file name>`
 * and must name their `characterClass` and `branch` (positive integer; one emblem per pair).
 */
import { CHARACTER_CLASSES } from '../../character-stats';
import type { CharacterClass } from '../../character-stats';

export type ArtAnchor = 'bottom-center' | 'center' | 'tile';
export type ArtKind =
  | 'unit'
  | 'portrait'
  | 'ground'
  | 'pickup'
  | 'skill-icon'
  | 'synergy-icon'
  | 'talent-branch-icon';
/** Task 28: the talent branch a `talent-branch-icon` belongs to. */
export interface ArtTalentBranch {
  readonly characterClass: CharacterClass;
  readonly branch: number;
}
export interface ArtEntry {
  readonly key: string;
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly anchor: ArtAnchor;
  /** The pack's declared kind, or null when the entry has none (pack 1). */
  readonly kind: ArtKind | null;
  /** Task 28: present only on `talent-branch-icon` entries. */
  readonly talentBranch?: ArtTalentBranch;
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
const ANCHORS: readonly string[] = ['bottom-center', 'center', 'tile'];
const KINDS: readonly string[] = [
  'unit',
  'portrait',
  'ground',
  'pickup',
  'skill-icon',
  'synergy-icon',
  'talent-branch-icon',
];
/** Key prefix of skill icons (Task 27): key `skill_<id>`, file `…/<id>.webp`. */
export const SKILL_ICON_KEY_PREFIX = 'skill_';
/** Task 28: key prefix of synergy icons (`synergy_<id>`) and talent branch emblems. */
export const SYNERGY_ICON_KEY_PREFIX = 'synergy_';
export const TALENT_BRANCH_KEY_PREFIX = 'talent_branch_';
/** Kinds whose key is `<prefix><file name>` (all others: key = file name). */
const KEY_PREFIX: Readonly<Record<string, string>> = {
  'skill-icon': SKILL_ICON_KEY_PREFIX,
  'synergy-icon': SYNERGY_ICON_KEY_PREFIX,
  'talent-branch-icon': TALENT_BRANCH_KEY_PREFIX,
};
/** Optional id field that, when present, must equal the file name. */
const ID_FIELD: Readonly<Record<string, string>> = {
  'skill-icon': 'skillId',
  'synergy-icon': 'synergyId',
};
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
  /** Talent `class#branch` pairs already given an emblem. */
  const branches = new Set<string>();
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
    // Icons are named after what they show (`<id>.webp`) and keyed `<prefix><id>`.
    const prefix = typeof v.kind === 'string' ? KEY_PREFIX[v.kind] : undefined;
    const stem = prefix !== undefined ? `${prefix}${m?.[1] ?? ''}` : m?.[1];
    if (!m) bad(`file "${file}" must be assets/…/<key>.webp or .png`);
    else if (stem !== key)
      bad(
        prefix !== undefined
          ? `${String(v.kind)} key must be "${stem}" for file "${m[1]}"`
          : `file name "${m[1]}" does not match the key`,
      );
    else if (files.has(file)) bad(`file "${file}" is used twice`);
    const idField = typeof v.kind === 'string' ? ID_FIELD[v.kind] : undefined;
    const okSkillId =
      idField === undefined || v[idField] === undefined || (!!m && v[idField] === m[1]);
    if (!okSkillId) bad(`${idField} "${String(v[idField!])}" does not match the file name`);
    // Talent branch emblems (Task 28) name the class and branch they belong to.
    let talentBranch: ArtTalentBranch | undefined;
    let okBranch = true;
    if (v.kind === 'talent-branch-icon') {
      const c = v.characterClass;
      const b = v.branch;
      const okClass = typeof c === 'string' && (CHARACTER_CLASSES as readonly string[]).includes(c);
      const okNumber = Number.isInteger(b) && (b as number) >= 1;
      if (!okClass) bad(`characterClass "${String(c)}" must be ${CHARACTER_CLASSES.join(', ')}`);
      if (!okNumber) bad(`branch "${String(b)}" must be a positive integer`);
      const pair = `${String(c)}#${String(b)}`;
      if (okClass && okNumber && branches.has(pair)) bad(`second emblem for ${c} branch ${b}`);
      okBranch = okClass && okNumber && !branches.has(pair);
      if (okBranch) {
        branches.add(pair);
        talentBranch = Object.freeze({ characterClass: c as CharacterClass, branch: b as number });
      }
    }
    const size = v.size;
    const okSize =
      Array.isArray(size) &&
      size.length === 2 &&
      size.every((n) => Number.isInteger(n) && n > 0 && n <= MAX_ART_SIZE);
    if (!okSize) bad(`size must be [width, height] in 1–${MAX_ART_SIZE} px`);
    const anchor = typeof v.anchor === 'string' ? v.anchor : '';
    if (!ANCHORS.includes(anchor)) bad(`anchor "${anchor}" must be ${ANCHORS.join(' or ')}`);
    const kind = v.kind === undefined ? null : v.kind;
    const okKind = kind === null || (typeof kind === 'string' && KINDS.includes(kind));
    if (!okKind) bad(`kind "${String(kind)}" must be ${KINDS.join(', ')}`);
    // A tiling ground texture and a pinned sprite are not interchangeable.
    const okPair = !(kind === 'ground') === !(anchor === 'tile');
    if (okKind && ANCHORS.includes(anchor) && !okPair) bad('anchor "tile" goes with kind "ground"');
    if (
      !m ||
      stem !== key ||
      !okSkillId ||
      !okBranch ||
      files.has(file) ||
      !okSize ||
      !ANCHORS.includes(anchor) ||
      !okKind ||
      !okPair
    )
      continue;
    files.add(file);
    const [width, height] = size as [number, number];
    out.set(
      key,
      Object.freeze({
        key,
        file,
        width,
        height,
        anchor: anchor as ArtAnchor,
        kind: kind as ArtKind | null,
        ...(talentBranch ? { talentBranch } : {}),
      }),
    );
  }
  if (problems.length) throw new ArtManifestError(problems);
  return out;
}
