/** Build policy, never a client-controlled URL flag. Normal builds always exclude QA. */
export function qaBuildEnabled({ command, mode }, env) {
  if (command !== 'build' || mode !== 'qa') return false;
  const branch = env.WORKERS_CI_BRANCH?.trim().replace(/^refs\/heads\//, '');
  if (
    branch === 'main' ||
    env.GITHUB_REF === 'refs/heads/main' ||
    env.GITHUB_REF_NAME === 'main' ||
    env.GITHUB_HEAD_REF === 'main'
  )
    throw new Error('QA builds are forbidden for the production branch main.');
  if (env.WORKERS_CI === '1' && branch) return true;
  // Explicit local smoke-test opt-in, unavailable in a CI environment with missing branch data.
  if (env.GAME_LOCAL_QA === '1' && !env.CI && !env.WORKERS_CI && !branch) return true;
  throw new Error(
    'QA builds require Workers Builds with a non-main WORKERS_CI_BRANCH, or GAME_LOCAL_QA=1 outside CI.',
  );
}
