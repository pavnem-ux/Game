import { RU } from './strings-ru';

/** Task 08.5 §3.1: `v<package version> · <short commit>`, injected at build time. */
export const BUILD_LABEL = `v${__APP_VERSION__} · ${__APP_COMMIT__}`;

export function BuildLabel({ className = '' }: { className?: string }) {
  return (
    <p className={`build-label ${className}`} aria-label={`${RU.build.label}: ${BUILD_LABEL}`}>
      {BUILD_LABEL}
    </p>
  );
}
