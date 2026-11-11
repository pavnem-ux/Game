import { CUES, MIX_RULES } from './cues';
import type { CueClass, SoundCue } from './cues';

/**
 * Task 14 mixing bookkeeping (pure; times are AudioContext seconds, never simulation time):
 * per-class rate limits, a global voice cap with priority stealing and the pickup pitch series.
 */
export interface AdmitResult {
  readonly admitted: boolean;
  /** Voice id for the admitted sound (stop handle), or 0 when rejected. */
  readonly voice: number;
  /** Voice id the caller must stop to make room (cap reached, lower priority), or 0. */
  readonly steal: number;
  /** Pickup pitch step in the current quick series (0 for non-pickups). */
  readonly step: number;
  readonly reason: 'ok' | 'rate-limit' | 'voice-cap';
}
interface Voice {
  readonly id: number;
  readonly priority: number;
  readonly end: number;
}
export class CueLimiter {
  private readonly recent: Record<CueClass, number[]> = { hit: [], pickup: [], ui: [], event: [] };
  private voices: Voice[] = [];
  private nextVoice = 1;
  private series: Partial<Record<SoundCue, { last: number; step: number }>> = {};
  constructor(private readonly rules = MIX_RULES) {}
  get activeVoices() {
    return this.voices.length;
  }
  admit(cue: SoundCue, now: number): AdmitResult {
    const spec = CUES[cue];
    const limit = this.rules.limits[spec.class];
    const times = this.recent[spec.class];
    while (times.length && times[0] <= now - limit.window) times.shift();
    if (times.length >= limit.max) return reject('rate-limit');
    this.voices = this.voices.filter((v) => v.end > now);
    let steal = 0;
    if (this.voices.length >= this.rules.voiceCap) {
      // Steal the lowest-priority (then oldest-ending) voice, only if strictly lower than this cue.
      let victim: Voice | null = null;
      for (const v of this.voices)
        if (
          !victim ||
          v.priority < victim.priority ||
          (v.priority === victim.priority && v.end < victim.end)
        )
          victim = v;
      if (!victim || victim.priority >= spec.priority) return reject('voice-cap');
      steal = victim.id;
      this.voices = this.voices.filter((v) => v !== victim);
    }
    times.push(now);
    let step = 0;
    if (spec.class === 'pickup') {
      const s = this.series[cue];
      step =
        s && now - s.last < this.rules.pickupSeriesReset
          ? Math.min(s.step + 1, this.rules.pickupMaxSteps)
          : 0;
      this.series[cue] = { last: now, step };
    }
    const id = this.nextVoice++;
    this.voices.push({ id, priority: spec.priority, end: now + spec.length });
    return Object.freeze({ admitted: true, voice: id, steal, step, reason: 'ok' as const });
  }
  reset() {
    for (const k of Object.keys(this.recent) as CueClass[]) this.recent[k] = [];
    this.voices = [];
    this.series = {};
  }
}
const reject = (reason: 'rate-limit' | 'voice-cap'): AdmitResult =>
  Object.freeze({ admitted: false, voice: 0, steal: 0, step: 0, reason });

/** Pickup pitch: one semitone up per step of the series. */
export const seriesPitch = (step: number) => Math.pow(2, step / 12);
/** Light randomization: multiplier in [1 − amount, 1 + amount]. */
export const jitter = (amount: number, random: () => number) => 1 + (random() * 2 - 1) * amount;
/** Bus gain 0–1 from the 0–100 settings (master × bus), muted → 0. */
export function busGains(s: {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
}) {
  if (s.muted) return { sfx: 0, music: 0 };
  const m = s.masterVolume / 100;
  return { sfx: m * (s.sfxVolume / 100), music: m * (s.musicVolume / 100) };
}
