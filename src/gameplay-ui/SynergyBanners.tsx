import { useEffect, useRef, useState } from 'react';
import type { WorldEvent } from '../gameplay';
import { LEVEL_ROMAN, SYNERGY_LEVEL_TEXT, SYNERGY_RULES } from '../skills';
import type { SynergyId } from '../skills';

/**
 * Task 15 feedback: banners for a synergy unlock (I) and level-ups (II, III «Пробуждение» in gold).
 * Presentation only: reads the bridge's event history; a UI timer (not simulation time) hides them.
 */
interface Banner {
  readonly key: number;
  readonly level: 1 | 2 | 3;
  readonly title: string;
  readonly detail: string;
}
const SHOW_MS = 3200;
const VISIBLE = 3;
const QUEUE_LIMIT = 24;
const nameOf = (id: string) => SYNERGY_RULES.find((r) => r.id === id)?.name ?? id;
export function bannerFor(entry: WorldEvent): Banner | null {
  const e = entry.event;
  if (entry.channel !== 'skill') return null;
  if (e.type === 'synergy-unlocked')
    return {
      key: entry.sequence,
      level: 1,
      title: `✦ Синергия открыта: ${nameOf(e.synergyId)} · I`,
      detail: 'Сработает в бою, когда выполнится условие.',
    };
  if (e.type === 'synergy-level-up') {
    const text = SYNERGY_LEVEL_TEXT[e.synergyId as SynergyId];
    return e.level === 3
      ? {
          key: entry.sequence,
          level: 3,
          title: `✦ Пробуждение: ${nameOf(e.synergyId)} · III`,
          detail: `«${text.awakened}»: ${text.awakenedEffect}.`,
        }
      : {
          key: entry.sequence,
          level: 2,
          title: `▲ ${nameOf(e.synergyId)} · уровень ${LEVEL_ROMAN[e.level]}`,
          detail: `${text.levelTwo[0].toUpperCase()}${text.levelTwo.slice(1)}.`,
        };
  }
  return null;
}
export function SynergyBanners({
  events,
  runId,
  active,
}: {
  events: readonly WorldEvent[];
  runId: number;
  /** Shown and counted down only during play: queued banners wait behind pause/offer dialogs. */
  active: boolean;
}) {
  const [banners, setBanners] = useState<readonly Banner[]>([]);
  // Start after what already exists at mount, so a remount never replays old banners.
  const seen = useRef({ run: runId, sequence: events.at(-1)?.sequence ?? 0 });
  useEffect(() => {
    if (seen.current.run !== runId) {
      seen.current = { run: runId, sequence: 0 };
      setBanners([]);
    }
    const fresh: Banner[] = [];
    for (const entry of events) {
      if (entry.sequence <= seen.current.sequence) continue;
      const banner = bannerFor(entry);
      if (banner) fresh.push(banner);
    }
    const last = events.at(-1)?.sequence;
    if (last !== undefined) seen.current.sequence = Math.max(seen.current.sequence, last);
    if (fresh.length === 0) return;
    // Queue (bounded): nothing is dropped when many level-ups arrive at once; 3 show at a time.
    setBanners((list) => [...list, ...fresh].slice(-QUEUE_LIMIT));
  }, [events, runId]);
  useEffect(() => {
    if (!active || banners.length === 0) return;
    const timer = setTimeout(() => setBanners((list) => list.slice(1)), SHOW_MS);
    return () => clearTimeout(timer);
  }, [banners, active]);
  if (!active || banners.length === 0) return null;
  return (
    <div className="synergy-banners" role="status" aria-live="polite" data-testid="synergy-banners">
      {banners.slice(0, VISIBLE).map((b) => (
        <div key={b.key} className={`synergy-banner level-${b.level}`} data-level={b.level}>
          <strong>{b.title}</strong>
          <span>{b.detail}</span>
        </div>
      ))}
    </div>
  );
}
