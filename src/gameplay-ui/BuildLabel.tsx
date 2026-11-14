import { BUILD_LABEL } from './build-label';
import { EN } from './strings-en';

export function BuildLabel({ className = '' }: { className?: string }) {
  return (
    <p className={`build-label ${className}`} aria-label={`${EN.build.label}: ${BUILD_LABEL}`}>
      {BUILD_LABEL}
    </p>
  );
}
