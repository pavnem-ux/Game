import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Task 23: the game is English only — no Cyrillic anywhere in `src/` or `index.html`. */
const ROOT = join(__dirname, '..', '..');
const CYRILLIC = /[Ѐ-ӿ]/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe('Task 23 — no Russian text in the game sources', () => {
  it('src/ and index.html contain no Cyrillic characters (code, strings or comments)', () => {
    const offenders: string[] = [];
    for (const path of [...files(join(ROOT, 'src')), join(ROOT, 'index.html')]) {
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (CYRILLIC.test(line))
            offenders.push(`${relative(ROOT, path)}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
  it('index.html declares English and the English title', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toMatch(/<title>The Last Light<\/title>/);
  });
});
