import type { WorldEvent } from '../gameplay';
import { CUES, MIX_RULES } from './cues';
import type { SoundCue } from './cues';
import { CueLimiter, jitter, seriesPitch } from './limits';
import { cuesForEvent } from './mapping';
import type { CueContext } from './mapping';

/**
 * Task 14 audio director (presentation only). Receives world events (read-only) and the throttled
 * UI state, decides which cues play (rate limits, voice cap, pickup series, jitter) and which music
 * track runs, and forwards that to a sink: the Web Audio engine in the browser, a recorder in tests.
 * It never calls into the simulation.
 */
export type MusicTrack = 'menu' | 'act-1' | 'act-2' | 'act-3' | 'act-4' | 'boss';
export interface PlayParams {
  readonly voice: number;
  /** Playback-rate multiplier (pickup series × jitter). */
  readonly pitch: number;
  /** Cue gain × jitter (0–1, before the bus volumes). */
  readonly gain: number;
}
export interface AudioSink {
  play(cue: SoundCue, params: PlayParams): void;
  stop(voice: number): void;
  music(track: MusicTrack | null, ducked: boolean): void;
  /** Bus gains 0–1 (master × bus; muted → 0). */
  volumes(gains: { sfx: number; music: number }): void;
  /** Current audio clock (s). */
  now(): number;
  /** True once a real AudioContext runs (false in tests/headless). */
  readonly live: boolean;
}
export interface AudioLogEntry {
  readonly at: number;
  readonly cue: SoundCue | `music:${MusicTrack | 'none'}`;
  readonly result: 'played' | 'silent' | 'rate-limit' | 'voice-cap' | 'muted';
}
export interface MusicContext {
  readonly screen: string;
  readonly runId: number;
  /** Campaign act (1–4) of the current map; null for sandbox / menu. */
  readonly act: number | null;
  readonly bossAlive: boolean;
  /** Player HP share 0–1 (null outside a run). */
  readonly hpShare: number | null;
}
const DUCKED_SCREENS = new Set(['paused', 'level-up', 'enhanced-skill', 'revival']);
export function musicFor(ctx: MusicContext): { track: MusicTrack | null; ducked: boolean } {
  if (ctx.screen === 'menu') return { track: 'menu', ducked: false };
  if (ctx.screen === 'results' || ctx.screen === 'ended') return { track: null, ducked: false };
  const track: MusicTrack = ctx.bossAlive
    ? 'boss'
    : (`act-${Math.min(4, Math.max(1, ctx.act ?? 1))}` as MusicTrack);
  return { track, ducked: DUCKED_SCREENS.has(ctx.screen) };
}
const LOG_SIZE = 40;
export class AudioDirector {
  private readonly limiter: CueLimiter;
  private readonly log: AudioLogEntry[] = [];
  private muted = false;
  private musicState: { track: MusicTrack | null; ducked: boolean } | null = null;
  private heartbeatAt = -Infinity;
  private heartbeat = false;
  private jingleRun = -1;
  private runId = -1;
  constructor(
    private readonly sink: AudioSink,
    private readonly random: () => number = Math.random,
    private readonly rules = MIX_RULES,
  ) {
    this.limiter = new CueLimiter(rules);
  }
  setMuted(muted: boolean) {
    this.muted = muted;
  }
  /** Debug overlay: latest decisions, newest last. */
  getLog(): readonly AudioLogEntry[] {
    return this.log.slice();
  }
  get activeVoices() {
    return this.limiter.activeVoices;
  }
  /** Plays one cue through the limits; returns the decision. */
  cue(cue: SoundCue): AudioLogEntry['result'] {
    const now = this.sink.now();
    if (this.muted) return this.record(now, cue, 'muted');
    if ((cue === 'victory' || cue === 'defeat') && this.jingleRun === this.runId)
      return 'rate-limit'; // one jingle per run (campaign runs report both run-resolved and run-ended)
    const admit = this.limiter.admit(cue, now);
    if (admit.reason !== 'ok') return this.record(now, cue, admit.reason);
    if (cue === 'victory' || cue === 'defeat') this.jingleRun = this.runId;
    if (admit.steal) this.sink.stop(admit.steal);
    const spec = CUES[cue];
    this.sink.play(cue, {
      voice: admit.voice,
      pitch: seriesPitch(admit.step) * jitter(this.rules.pitchJitter, this.random),
      gain: Math.min(1, spec.gain * jitter(this.rules.gainJitter, this.random)),
    });
    return this.record(now, cue, this.sink.live ? 'played' : 'silent');
  }
  /** World events of one frame (the scene's `getEvents(last)`), in order. */
  worldEvents(events: readonly WorldEvent[], ctx: CueContext) {
    for (const entry of events) for (const cue of cuesForEvent(entry, ctx)) this.cue(cue);
  }
  /** Throttled UI state: music track, pause duck, heartbeat arming. */
  state(ctx: MusicContext) {
    if (ctx.runId !== this.runId) {
      this.runId = ctx.runId;
      this.heartbeatAt = -Infinity;
    }
    const next = musicFor(ctx);
    if (
      !this.musicState ||
      this.musicState.track !== next.track ||
      this.musicState.ducked !== next.ducked
    ) {
      if (this.musicState?.track !== next.track)
        this.record(
          this.sink.now(),
          `music:${next.track ?? 'none'}`,
          this.sink.live ? 'played' : 'silent',
        );
      this.musicState = next;
      this.sink.music(next.track, next.ducked);
    }
    this.heartbeat =
      ctx.screen === 'playing' &&
      ctx.hpShare !== null &&
      ctx.hpShare > 0 &&
      ctx.hpShare < this.rules.heartbeatBelow;
  }
  /** Per animation frame: the low-HP heartbeat (audio clock, not simulation time). */
  frame() {
    if (!this.heartbeat) return;
    const now = this.sink.now();
    if (now - this.heartbeatAt < this.rules.heartbeatEvery) return;
    this.heartbeatAt = now;
    this.cue('heartbeat');
  }
  volumes(gains: { sfx: number; music: number }) {
    this.sink.volumes(gains);
  }
  private record(at: number, cue: AudioLogEntry['cue'], result: AudioLogEntry['result']) {
    this.log.push(Object.freeze({ at, cue, result }));
    if (this.log.length > LOG_SIZE) this.log.shift();
    return result;
  }
}
