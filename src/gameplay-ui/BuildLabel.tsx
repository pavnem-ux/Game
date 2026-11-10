import { BUILD_LABEL } from './build-label';
import { RU } from './strings-ru';

export function BuildLabel({ className = '' }: { className?: string }) {
  return (
    <p className={`build-label ${className}`} aria-label={`${RU.build.label}: ${BUILD_LABEL}`}>
      {BUILD_LABEL}
    </p>
  );
}
