import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qaBuildEnabled } from '../config/qa-build.mjs';
const build = { command: 'build', mode: 'qa' };

test('ordinary production builds never enable QA, even with QA-looking environment variables', () => {
  for (const env of [
    {},
    { GAME_LOCAL_QA: '1' },
    { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'feature/qa', VITE_ENABLE_QA: 'true' },
  ])
    assert.equal(qaBuildEnabled({ command: 'build', mode: 'production' }, env), false);
});
test('QA requires an explicit build mode plus a non-main Workers Builds branch', () => {
  assert.equal(
    qaBuildEnabled(build, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'claude/stoic-carson-76vdrx' }),
    true,
  );
  assert.equal(qaBuildEnabled({ command: 'serve', mode: 'qa' }, {}), false);
});
test('main is rejected even when local opt-in or contradictory branch signals are set', () => {
  for (const branch of [
    { WORKERS_CI_BRANCH: 'main' },
    { WORKERS_CI_BRANCH: ' main ' },
    { WORKERS_CI_BRANCH: 'refs/heads/main' },
    { GITHUB_REF: 'refs/heads/main' },
    { GITHUB_REF_NAME: 'main' },
    { GITHUB_HEAD_REF: 'main' },
  ])
    assert.throws(
      () =>
        qaBuildEnabled(build, {
          WORKERS_CI: '1',
          WORKERS_CI_BRANCH: 'feature/test',
          GAME_LOCAL_QA: '1',
          ...branch,
        }),
      /forbidden/,
    );
});
test('missing or empty branch metadata fails closed on CI', () => {
  for (const env of [
    {},
    { WORKERS_CI: '1' },
    { WORKERS_CI: '1', WORKERS_CI_BRANCH: ' ' },
    { CI: 'true', GAME_LOCAL_QA: '1' },
  ])
    assert.throws(() => qaBuildEnabled(build, env), /require/);
});
test('a local QA build requires explicit opt-in outside CI', () => {
  assert.equal(qaBuildEnabled(build, { GAME_LOCAL_QA: '1' }), true);
  assert.throws(() => qaBuildEnabled(build, { WORKERS_CI_BRANCH: 'feature/test' }), /require/);
});
