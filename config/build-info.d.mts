export interface BuildInfo {
  readonly version: string;
  readonly commit: string;
}
export function buildInfo(
  env?: Record<string, string | undefined>,
  readGit?: () => string | null,
): BuildInfo;
export function buildDefines(
  env?: Record<string, string | undefined>,
): Record<'__APP_VERSION__' | '__APP_COMMIT__', string>;
