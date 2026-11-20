import { useEffect, useRef, useState } from 'react';
import type { WorldEvent } from '../gameplay';
import { LEVEL_ROMAN, SKILL_CATALOG, SYNERGY_LEVEL_TEXT, SYNERGY_RULES } from '../skills';
import type { SynergyId } from '../skills';
import { SkillIcon, SynergyIcon } from './kit';

/**
 * Task 15 feedback: banners for a synergy unlock (I) and level-ups (II, III «Awakening» in gold).
 * Task 37: compact one-line toasts — synergy icon, name + level, the pair's two skill icons — at most
 * `VISIBLE` at once, each for `SHOW_MS`, the rest queued; fade in / out. Presentation only: reads the
 * bridge's event history; a UI timer (not simulation time) hides them, and only while playing.
 */
interface Banner {
  readonly key: number;
  /** Task 28: the synergy, for its icon. */
  readonly synergyId: string;
  readonly level: 1 | 2 | 3;
  readonly title: string;
  readonly detail: string;
  /** Task 37: the two skills of the pair that unlocked / raised it (small icons). */
  readonly pair: readonly [string, string] | null;
}
export const SHOW_MS = 2500;
export const FADE_MS = 300;
export const VISIBLE = 2;
const QUEUE_LIMIT = 24;
const nameOf = (id: string) => SYNERGY_RULES.find((r) => r.id === id)?.name ?? id;
const pairOf = (e: { pair?: readonly [string, string] }) =>
  Array.isArray(e.pair) && e.pair.length === 2 ? e.pair : null;
export function bannerFor(entry: WorldEvent): Banner | null {
  const e = entry.event;
  if (entry.channel !== 'skill') return null;
  if (e.type === 'synergy-unlocked')
    return {
      key: entry.sequence,
      synergyId: e.synergyId,
      level: 1,
      title: `✦ Synergy unlocked: ${nameOf(e.synergyId)} · I`,
      detail: 'Triggers in combat when its condition is met.',
      pair: pairOf(e),
    };
  if (e.type === 'synergy-level-up') {
    const text = SYNERGY_LEVEL_TEXT[e.synergyId as SynergyId];
    return e.level === 3
      ? {
          key: entry.sequence,
          synergyId: e.synergyId,
          level: 3,
          title: `✦ Awakening: ${nameOf(e.synergyId)} · III`,
          detail: `“${text.awakened}”: ${text.awakenedEffect}.`,
          pair: pairOf(e),
        }
      : {
          key: entry.sequence,
          synergyId: e.synergyId,
          level: 2,
          title: `▲ ${nameOf(e.synergyId)} · level ${LEVEL_ROMAN[e.level]}`,
          detail: `${text.levelTwo[0].toUpperCase()}${text.levelTwo.slice(1)}.`,
          pair: pairOf(e),
        };
  }
  return null;
}

/**
 * Task 37: the toast queue (pure). `push` adds banners (bounded); `tick(now)` drops shown banners
 * whose time is up and starts the next ones, so at most `VISIBLE` show at once, each for `SHOW_MS`.
 * Times are UI milliseconds; `hold(now)` restarts the clocks of the visible ones (after a pause).
 */
export interface QueuedBanner extends Banner {
  /** When it became visible (UI ms), or null while queued. */
  readonly shownAt: number | null;
}
export function pushBanners(
  queue: readonly QueuedBanner[],
  fresh: readonly Banner[],
): QueuedBanner[] {
  return [...queue, ...fresh.map((b) => ({ ...b, shownAt: null }))].slice(-QUEUE_LIMIT);
}
export function tickBanners(queue: readonly QueuedBanner[], now: number): QueuedBanner[] {
  const kept = queue.filter((b) => b.shownAt === null || now - b.shownAt < SHOW_MS);
  let visible = kept.filter((b) => b.shownAt !== null).length;
  return kept.map((b) => {
    if (b.shownAt !== null || visible >= VISIBLE) return b;
    visible++;
    return { ...b, shownAt: now };
  });
}
export function holdBanners(queue: readonly QueuedBanner[], now: number): QueuedBanner[] {
  return queue.map((b) => (b.shownAt === null ? b : { ...b, shownAt: now }));
}
/** The next moment the toasts change (a fade-out starts or a toast ends), or null. */
function nextChange(queue: readonly QueuedBanner[], now: number): number | null {
  let next: number | null = null;
  for (const b of queue) {
    if (b.shownAt === null) continue;
    for (const t of [b.shownAt + SHOW_MS - FADE_MS, b.shownAt + SHOW_MS])
      if (t > now && (next === null || t < next)) next = t;
  }
  return next;
}
const glyphOf = (skillId: string) => SKILL_CATALOG.find((d) => d.id === skillId)?.icon ?? '✦';

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
  const [queue, setQueue] = useState<readonly QueuedBanner[]>([]);
  const [now, setNow] = useState(() => performance.now());
  // Start after what already exists at mount, so a remount never replays old banners.
  const seen = useRef({ run: runId, sequence: events.at(-1)?.sequence ?? 0 });
  useEffect(() => {
    if (seen.current.run !== runId) {
      seen.current = { run: runId, sequence: 0 };
      setQueue([]);
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
    // Queue (bounded): nothing is dropped when many level-ups arrive at once.
    setQueue((q) => pushBanners(q, fresh));
  }, [events, runId]);
  // Paused / offer / revive: the visible toasts restart their time when play resumes.
  useEffect(() => {
    if (active) setQueue((q) => holdBanners(q, performance.now()));
  }, [active]);
  useEffect(() => {
    if (!active) return;
    const t = performance.now();
    const next = tickBanners(queue, t);
    if (next.some((b, i) => b !== queue[i]) || next.length !== queue.length) {
      setQueue(next);
      setNow(t);
      return;
    }
    const at = nextChange(queue, t);
    if (at === null) return;
    const timer = setTimeout(() => setNow(performance.now()), Math.max(0, at - t) + 5);
    return () => clearTimeout(timer);
  }, [queue, active, now]);
  const visible = queue.filter((b) => b.shownAt !== null);
  if (!active || visible.length === 0) return null;
  return (
    <div className="synergy-banners" role="status" aria-live="polite" data-testid="synergy-banners">
      {visible.map((b) => (
        <div
          key={b.key}
          className={`synergy-banner level-${b.level}${
            now - (b.shownAt ?? now) >= SHOW_MS - FADE_MS ? ' is-leaving' : ''
          }`}
          data-level={b.level}
        >
          {/* Task 28: the synergy's icon (gold ring at III); without art the text stands alone. */}
          <SynergyIcon synergyId={b.synergyId} size="list" level={b.level} />
          <strong className="synergy-banner-title">{b.title}</strong>
          {b.pair && (
            <span className="synergy-banner-pair" aria-hidden="true">
              {b.pair.map((id) => (
                <SkillIcon key={id} skillId={id} glyph={glyphOf(id)} size="pair" />
              ))}
            </span>
          )}
          {/* The effect text stays for screen readers (the toast itself is one line). */}
          <span className="visually-hidden">{b.detail}</span>
        </div>
      ))}
    </div>
  );
}
