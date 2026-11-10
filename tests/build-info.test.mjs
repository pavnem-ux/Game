import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDefines, buildInfo } from '../config/build-info.mjs';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;

test('build label uses the package version and the Workers Builds commit', () => {
  const info = buildInfo({ WORKERS_CI_COMMIT_SHA: 'ABCDEF1234567890' }, () => 'zzz');
  assert.deepEqual(info, { version, commit: 'abcdef1' });
});
test('falls back to GITHUB_SHA, then local git, then "unknown"; ignores junk values', () => {
  assert.equal(buildInfo({ GITHUB_SHA: '1234567890abcdef' }, () => null).commit, '1234567');
  assert.equal(
    buildInfo({ WORKERS_CI_COMMIT_SHA: 'not a sha' }, () => 'fedcba9').commit,
    'fedcba9',
  );
  assert.equal(buildInfo({}, () => null).commit, 'unknown');
});
test('defines are JSON string literals for Vite', () => {
  const d = buildDefines({ WORKERS_CI_COMMIT_SHA: 'a1b2c3d4' });
  assert.equal(JSON.parse(d.__APP_VERSION__), version);
  assert.equal(JSON.parse(d.__APP_COMMIT__), 'a1b2c3d');
});
