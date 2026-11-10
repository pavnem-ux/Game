import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Task 08.5 §3.1 build version, injected at build time (`__APP_VERSION__`, `__APP_COMMIT__`).
 * Commit: Workers Builds `WORKERS_CI_COMMIT_SHA`, then GitHub `GITHUB_SHA`, then local git;
 * `unknown` when none is available (a build never fails because of the label).
 */
export function buildInfo(env = process.env, readGit = localCommit) {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const sha = [env.WORKERS_CI_COMMIT_SHA, env.GITHUB_SHA]
    .map((v) => v?.trim())
    .find((v) => v && /^[0-9a-f]{7,40}$/i.test(v));
  const commit = (sha ?? readGit() ?? 'unknown').slice(0, 7).toLowerCase();
  return { version: String(pkg.version), commit };
}
function localCommit() {
  try {
    const out = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^[0-9a-f]{7,40}$/i.test(out) ? out : null;
  } catch {
    return null;
  }
}
/** Vite `define` entries for the build label. */
export function buildDefines(env = process.env) {
  const info = buildInfo(env);
  return {
    __APP_VERSION__: JSON.stringify(info.version),
    __APP_COMMIT__: JSON.stringify(info.commit),
  };
}
