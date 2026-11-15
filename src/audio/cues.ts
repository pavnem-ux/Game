/**
 * Task 14 — sound cues (presentation only). Every sound is synthesized in code (`synth.ts`); this
 * table only names the cues and their mixing class. All numbers PROVISIONAL.
 */
export type SoundCue =
  | 'ui-hover'
  | 'ui-click'
  | 'ui-confirm'
  | 'ui-buy'
  | 'ui-error'
  | 'player-hit'
  | 'enemy-hit-physical'
  | 'enemy-hit-magical'
  | 'enemy-hit-dot'
  | 'crit'
  | 'enemy-death'
  | 'elite-death'
  | 'boss-death'
  | 'pickup-xp'
  | 'pickup-coin'
  | 'level-up'
  | 'card-pick'
  | 'reroll'
  | 'banish'
  | 'synergy'
  | 'synergy-fire'
  | 'synergy-ice'
  | 'synergy-impact'
  | 'synergy-poison'
  | 'synergy-blood'
  | 'synergy-awaken'
  | 'synergy-level'
  | 'synergy-awakening'
  | 'elite-alarm'
  | 'boss-horn'
  | 'telegraph'
  | 'chest-spawn'
  | 'chest-open'
  | 'activity-spawn'
  | 'activity-complete'
  | 'activity-fail'
  | 'buff-gain'
  | 'buff-expire'
  | 'dash'
  | 'heartbeat'
  | 'revive'
  | 'victory'
  | 'defeat';

/** Rate-limit classes: at most `max` sounds of a class per `window` seconds. */
export type CueClass = 'hit' | 'pickup' | 'ui' | 'event';
export const MIX_RULES = Object.freeze({
  /** Simultaneous voices (oscillator/noise groups) across all sounds. */
  voiceCap: 24,
  limits: Object.freeze({
    hit: Object.freeze({ max: 8, window: 0.1 }),
    pickup: Object.freeze({ max: 6, window: 0.1 }),
    ui: Object.freeze({ max: 4, window: 0.1 }),
    event: Object.freeze({ max: 4, window: 0.1 }),
  }) as Readonly<Record<CueClass, Readonly<{ max: number; window: number }>>>,
  /** Pickup pitch climbs one step per pickup in a quick series and resets after this pause (s). */
  pickupSeriesReset: 0.5,
  pickupMaxSteps: 12,
  /** Light randomization (±) of pitch (fraction) and volume (fraction). */
  pitchJitter: 0.03,
  gainJitter: 0.1,
  /** Low-HP heartbeat below this share of Max HP, every `heartbeatEvery` seconds. */
  heartbeatBelow: 0.25,
  heartbeatEvery: 1.1,
  /** Music crossfade (s) and the pause duck (music × this while paused). */
  crossfade: 1,
  pauseDuck: 0.5,
});
export interface CueSpec {
  readonly class: CueClass;
  /** Base loudness 0–1 before the bus volumes. */
  readonly gain: number;
  /** Higher priority keeps its voice when the cap is reached (0 = droppable first). */
  readonly priority: number;
  /** Approximate length (s): voice bookkeeping. */
  readonly length: number;
}
const S = (cls: CueClass, gain: number, priority: number, length: number): CueSpec =>
  Object.freeze({ class: cls, gain, priority, length });
export const CUES: Readonly<Record<SoundCue, CueSpec>> = Object.freeze({
  'ui-hover': S('ui', 0.12, 0, 0.05),
  'ui-click': S('ui', 0.25, 1, 0.08),
  'ui-confirm': S('ui', 0.3, 2, 0.25),
  'ui-buy': S('ui', 0.32, 2, 0.35),
  'ui-error': S('ui', 0.28, 2, 0.2),
  'player-hit': S('hit', 0.42, 3, 0.2),
  'enemy-hit-physical': S('hit', 0.2, 0, 0.06),
  'enemy-hit-magical': S('hit', 0.18, 0, 0.1),
  'enemy-hit-dot': S('hit', 0.1, 0, 0.06),
  crit: S('hit', 0.26, 1, 0.12),
  'enemy-death': S('hit', 0.18, 0, 0.14),
  'elite-death': S('event', 0.45, 3, 0.6),
  'boss-death': S('event', 0.6, 4, 1.8),
  'pickup-xp': S('pickup', 0.16, 0, 0.07),
  'pickup-coin': S('pickup', 0.2, 0, 0.09),
  'level-up': S('event', 0.4, 3, 0.6),
  'card-pick': S('ui', 0.32, 2, 0.25),
  reroll: S('ui', 0.28, 2, 0.25),
  banish: S('ui', 0.32, 2, 0.35),
  synergy: S('event', 0.38, 3, 0.8),
  // Task 15: synergy triggers by element family (+ a stronger layer when awakened) and level-ups.
  'synergy-fire': S('hit', 0.22, 1, 0.22),
  'synergy-ice': S('hit', 0.2, 1, 0.22),
  'synergy-impact': S('hit', 0.24, 1, 0.2),
  'synergy-poison': S('hit', 0.2, 1, 0.24),
  'synergy-blood': S('hit', 0.22, 1, 0.22),
  'synergy-awaken': S('event', 0.34, 3, 0.5),
  'synergy-level': S('event', 0.38, 3, 0.7),
  'synergy-awakening': S('event', 0.46, 4, 1.4),
  'elite-alarm': S('event', 0.38, 4, 0.6),
  'boss-horn': S('event', 0.5, 4, 2),
  telegraph: S('event', 0.24, 3, 0.5),
  'chest-spawn': S('event', 0.24, 2, 0.4),
  'chest-open': S('event', 0.36, 3, 0.45),
  // Task 24: map activities appear / succeed / fail.
  'activity-spawn': S('event', 0.3, 3, 0.6),
  'activity-complete': S('event', 0.4, 4, 0.8),
  'activity-fail': S('event', 0.3, 3, 0.6),
  'buff-gain': S('event', 0.32, 3, 0.35),
  'buff-expire': S('event', 0.24, 2, 0.35),
  dash: S('event', 0.3, 3, 0.18),
  heartbeat: S('event', 0.4, 4, 0.4),
  revive: S('event', 0.45, 4, 1.2),
  victory: S('event', 0.5, 5, 2.4),
  defeat: S('event', 0.5, 5, 2.4),
});
export const SOUND_CUES = Object.freeze(Object.keys(CUES) as SoundCue[]);
