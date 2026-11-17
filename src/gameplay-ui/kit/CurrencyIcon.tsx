import { useState, useSyncExternalStore } from 'react';
import { artManifestStore, artUrl } from '../../engine/visuals/art-pack';
import { CURRENCY_ART } from '../../engine/visuals/art-registry';

/**
 * Task 26: the Gold / Ore icon from the owner's art pack (`coin`, `ore`), sized 1em like the
 * original inline SVGs it replaces, which stay the fallback (manifest still loading, no image for
 * the key, or a failed image). Decorative by default; pass `label` where the icon itself carries
 * meaning (e.g. inside a «Buy · <icon> 80» button).
 */
export function CurrencyIcon({ kind, label }: { kind: 'gold' | 'ore'; label?: string }) {
  const manifest = useSyncExternalStore(
    artManifestStore.subscribe,
    artManifestStore.getSnapshot,
    artManifestStore.getServerSnapshot,
  );
  const [failed, setFailed] = useState(false);
  const entry = manifest?.get(CURRENCY_ART[kind]);
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const };
  if (entry && !failed)
    return (
      <img
        className={`currency-icon currency-icon-${kind}`}
        src={artUrl(entry.file)}
        alt={label ?? ''}
        {...(label ? {} : { 'aria-hidden': true })}
        width={16}
        height={16}
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  return kind === 'gold' ? (
    <svg viewBox="0 0 20 20" width="1em" height="1em" className="currency-icon" {...a11y}>
      <circle cx="10" cy="10" r="8.5" className="coin-outer" />
      <circle cx="10" cy="10" r="5.5" className="coin-inner" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" width="1em" height="1em" className="currency-icon" {...a11y}>
      <path d="M10 1.5 L17 7 L14.5 17.5 L5.5 17.5 L3 7 Z" className="ore-outer" />
      <path d="M10 1.5 L10 17.5 M3 7 L10 10 L17 7" className="ore-facet" />
    </svg>
  );
}
