import type { SoundCue } from './cues';
import { MIX_RULES } from './cues';
import type { AudioSink, MusicTrack, PlayParams } from './director';

/**
 * Task 14 Web Audio engine (browser only, presentation only). Every sound is synthesized here from
 * oscillators, filtered noise and envelopes — no audio files. The context is created lazily by
 * `unlock()` (called on the first user gesture); without Web Audio (Node tests) or under automation
 * (`navigator.webdriver`, headless e2e) it stays silent and only reports the audio clock.
 * All tones/levels are PROVISIONAL.
 */
type Wave = OscillatorType;
interface ToneSpec {
  wave: Wave;
  freq: number;
  /** Frequency at the end of the sound (exponential glide). */
  to?: number;
  at?: number;
  attack?: number;
  decay: number;
  gain: number;
  /** Low-pass cut-off (Hz). */
  lowpass?: number;
}
interface NoiseSpec {
  at?: number;
  decay: number;
  gain: number;
  /** Band-pass centre (Hz) and Q. */
  band: number;
  q?: number;
  to?: number;
}
type Recipe = { tones?: ToneSpec[]; noise?: NoiseSpec[] };
const T = (wave: Wave, freq: number, decay: number, gain: number, o: Partial<ToneSpec> = {}) => ({
  wave,
  freq,
  decay,
  gain,
  ...o,
});
const N = (band: number, decay: number, gain: number, o: Partial<NoiseSpec> = {}) => ({
  band,
  decay,
  gain,
  ...o,
});
const arp = (wave: Wave, notes: number[], step: number, decay: number, gain: number) =>
  notes.map((f, i) => T(wave, f, decay, gain, { at: i * step }));
/** Synthesis recipes per cue (frequencies in Hz, times in s). */
export const RECIPES: Readonly<Record<SoundCue, Recipe>> = {
  'ui-hover': { tones: [T('sine', 1320, 0.04, 0.5)] },
  'ui-click': { tones: [T('triangle', 880, 0.06, 0.7, { to: 660 })] },
  'ui-confirm': { tones: arp('triangle', [660, 990], 0.07, 0.16, 0.6) },
  'ui-buy': {
    tones: arp('square', [988, 1319, 1568], 0.06, 0.12, 0.25),
    noise: [N(6000, 0.08, 0.2)],
  },
  'ui-error': { tones: [T('square', 220, 0.18, 0.35, { to: 160, lowpass: 1200 })] },
  'player-hit': {
    tones: [T('sawtooth', 180, 0.18, 0.5, { to: 70, lowpass: 900 })],
    noise: [N(900, 0.12, 0.6)],
  },
  'enemy-hit-physical': { noise: [N(1800, 0.05, 0.8, { q: 1.5 })] },
  'enemy-hit-magical': { tones: [T('sine', 1200, 0.09, 0.5, { to: 1800 })] },
  'enemy-hit-dot': { noise: [N(3200, 0.05, 0.5, { q: 4 })] },
  crit: {
    tones: [T('triangle', 1760, 0.1, 0.5, { to: 2400 })],
    noise: [N(5000, 0.06, 0.4)],
  },
  'enemy-death': { noise: [N(700, 0.13, 0.7, { to: 300 })] },
  'elite-death': {
    tones: [T('sawtooth', 220, 0.5, 0.4, { to: 55, lowpass: 1400 })],
    noise: [N(500, 0.45, 0.6, { to: 150 })],
  },
  'boss-death': {
    tones: [
      T('sawtooth', 110, 1.6, 0.45, { to: 30, lowpass: 900 }),
      ...arp('triangle', [392, 523, 659, 784], 0.25, 0.8, 0.3),
    ],
    noise: [N(300, 1.2, 0.6, { to: 80 })],
  },
  'pickup-xp': { tones: [T('sine', 1046, 0.07, 0.6, { to: 1318 })] },
  'pickup-coin': { tones: arp('square', [1318, 1975], 0.035, 0.07, 0.22) },
  'level-up': { tones: arp('triangle', [523, 659, 784, 1046], 0.08, 0.3, 0.45) },
  'card-pick': { tones: arp('triangle', [784, 1175], 0.06, 0.2, 0.5) },
  reroll: {
    tones: [T('triangle', 500, 0.22, 0.45, { to: 1000 })],
    noise: [N(2500, 0.18, 0.25, { to: 5000 })],
  },
  banish: {
    tones: [T('sawtooth', 600, 0.3, 0.35, { to: 120, lowpass: 1600 })],
    noise: [N(1500, 0.3, 0.35, { to: 300 })],
  },
  synergy: {
    tones: [...arp('sine', [659, 831, 988, 1319], 0.09, 0.5, 0.4), T('triangle', 1976, 0.6, 0.15)],
  },
  'synergy-fire': {
    tones: [T('sawtooth', 330, 0.2, 0.3, { to: 660, lowpass: 1800 })],
    noise: [N(2400, 0.16, 0.35, { to: 800 })],
  },
  'synergy-ice': {
    tones: [T('sine', 1568, 0.2, 0.4, { to: 2093 }), T('triangle', 2637, 0.12, 0.2, { at: 0.04 })],
  },
  'synergy-impact': {
    tones: [T('square', 140, 0.18, 0.4, { to: 70, lowpass: 600 })],
    noise: [N(500, 0.14, 0.6)],
  },
  'synergy-poison': {
    tones: [T('triangle', 392, 0.22, 0.35, { to: 294 })],
    noise: [N(1200, 0.2, 0.3, { q: 6 })],
  },
  'synergy-blood': {
    tones: [T('sawtooth', 247, 0.2, 0.3, { to: 165, lowpass: 1200 })],
    noise: [N(900, 0.16, 0.4, { q: 3 })],
  },
  'synergy-awaken': {
    tones: [T('triangle', 880, 0.45, 0.35, { to: 1320 }), T('sine', 1760, 0.4, 0.2, { at: 0.06 })],
    noise: [N(5000, 0.35, 0.2)],
  },
  'synergy-level': { tones: arp('triangle', [587, 740, 880], 0.08, 0.4, 0.4) },
  'synergy-awakening': {
    tones: [
      ...arp('triangle', [523, 659, 784, 1046, 1318], 0.09, 0.9, 0.38),
      T('sine', 2093, 1.1, 0.16, { at: 0.4 }),
    ],
    noise: [N(6000, 1, 0.12)],
  },
  'elite-alarm': {
    tones: [
      T('square', 440, 0.18, 0.3, { lowpass: 1800 }),
      T('square', 349, 0.22, 0.3, { at: 0.22, lowpass: 1800 }),
    ],
  },
  'boss-horn': {
    tones: [
      T('sawtooth', 98, 1.8, 0.5, { attack: 0.25, lowpass: 700 }),
      T('sawtooth', 147, 1.8, 0.35, { attack: 0.3, lowpass: 700 }),
    ],
  },
  telegraph: { tones: [T('sine', 880, 0.45, 0.4, { to: 440, attack: 0.05 })] },
  'chest-spawn': { tones: arp('sine', [784, 988], 0.1, 0.3, 0.4) },
  'chest-open': {
    tones: arp('triangle', [523, 784, 1046], 0.06, 0.35, 0.4),
    noise: [N(4000, 0.2, 0.2)],
  },
  'buff-gain': { tones: [T('triangle', 440, 0.3, 0.5, { to: 880 })] },
  'buff-expire': { tones: [T('triangle', 660, 0.3, 0.4, { to: 330 })] },
  dash: { noise: [N(1200, 0.16, 0.8, { to: 4000, q: 0.8 })] },
  heartbeat: {
    tones: [
      T('sine', 60, 0.12, 0.9, { lowpass: 200 }),
      T('sine', 55, 0.14, 0.7, { at: 0.18, lowpass: 200 }),
    ],
  },
  revive: {
    tones: [...arp('sine', [392, 523, 659, 784, 1046], 0.12, 0.7, 0.35)],
    noise: [N(6000, 0.9, 0.12)],
  },
  victory: { tones: arp('triangle', [523, 659, 784, 1046, 784, 1046], 0.16, 0.7, 0.4) },
  defeat: { tones: arp('triangle', [392, 349, 311, 262], 0.3, 0.9, 0.4) },
};

/** Generative music: key, scale, tempo and pad timbre per track (PROVISIONAL). */
export interface TrackStyle {
  readonly root: number;
  readonly scale: readonly number[];
  /** Beats per minute; one melody note per beat at most. */
  readonly bpm: number;
  readonly chords: readonly (readonly number[])[];
  readonly pad: Wave;
  readonly lead: Wave;
  /** Chance per beat that the melody plays a note. */
  readonly density: number;
}
export const TRACKS: Readonly<Record<MusicTrack, TrackStyle>> = {
  menu: {
    root: 220,
    scale: [0, 2, 3, 5, 7, 8, 10],
    bpm: 60,
    chords: [
      [0, 3, 7],
      [8, 12, 15],
      [5, 8, 12],
      [7, 10, 14],
    ],
    pad: 'sine',
    lead: 'triangle',
    density: 0.4,
  },
  'act-1': {
    root: 196,
    scale: [0, 2, 4, 7, 9],
    bpm: 72,
    chords: [
      [0, 4, 7],
      [9, 12, 16],
      [5, 9, 12],
      [7, 11, 14],
    ],
    pad: 'triangle',
    lead: 'sine',
    density: 0.5,
  },
  'act-2': {
    root: 174.6,
    scale: [0, 2, 3, 5, 7, 9, 10],
    bpm: 80,
    chords: [
      [0, 3, 7],
      [10, 14, 17],
      [5, 9, 12],
      [3, 7, 10],
    ],
    pad: 'triangle',
    lead: 'triangle',
    density: 0.5,
  },
  'act-3': {
    root: 164.8,
    scale: [0, 1, 3, 5, 7, 8, 10],
    bpm: 88,
    chords: [
      [0, 3, 7],
      [1, 5, 8],
      [8, 12, 15],
      [7, 10, 13],
    ],
    pad: 'sawtooth',
    lead: 'triangle',
    density: 0.55,
  },
  'act-4': {
    root: 146.8,
    scale: [0, 2, 3, 6, 7, 8, 11],
    bpm: 96,
    chords: [
      [0, 3, 7],
      [8, 11, 15],
      [6, 10, 13],
      [7, 11, 14],
    ],
    pad: 'sawtooth',
    lead: 'square',
    density: 0.6,
  },
  boss: {
    root: 110,
    scale: [0, 1, 3, 5, 6, 8, 10],
    bpm: 120,
    chords: [
      [0, 3, 6],
      [1, 5, 8],
      [0, 3, 6],
      [10, 13, 17],
    ],
    pad: 'sawtooth',
    lead: 'square',
    density: 0.75,
  },
};
const semis = (root: number, n: number) => root * Math.pow(2, n / 12);

interface MusicVoice {
  readonly track: MusicTrack;
  readonly gain: GainNode;
  timer: ReturnType<typeof setInterval> | null;
  nextBeat: number;
  beat: number;
}
interface ActiveVoice {
  readonly nodes: AudioScheduledSourceNode[];
  readonly gain: GainNode;
}
export class WebAudioEngine implements AudioSink {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private duckNode: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly voices = new Map<number, ActiveVoice>();
  private current: MusicVoice | null = null;
  private wantedTrack: MusicTrack | null = null;
  private ducked = false;
  private gains = { sfx: 0.64, music: 0.4 };
  private readonly started = performance.now();
  get live() {
    return this.ctx !== null && this.ctx.state === 'running';
  }
  /** Creates/resumes the context; call from a user gesture. Returns true when audio can play. */
  unlock(): boolean {
    if (!this.ctx) {
      const Ctor =
        typeof window !== 'undefined'
          ? (window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
          : undefined;
      if (!Ctor || (typeof navigator !== 'undefined' && navigator.webdriver)) return false;
      try {
        this.ctx = new Ctor();
      } catch {
        return false;
      }
      const ctx = this.ctx;
      // Master compressor + limiter-ish settings keep the sum below clipping.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 8;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      const master = ctx.createGain();
      master.gain.value = 0.9;
      comp.connect(master).connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.duckNode = ctx.createGain();
      this.sfxBus.connect(comp);
      this.musicBus.connect(this.duckNode).connect(comp);
      this.applyGains();
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
      if (this.wantedTrack) this.startTrack(this.wantedTrack);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    return true;
  }
  now() {
    return this.ctx ? this.ctx.currentTime : (performance.now() - this.started) / 1000;
  }
  volumes(gains: { sfx: number; music: number }) {
    this.gains = gains;
    this.applyGains();
  }
  private applyGains() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus!.gain.setTargetAtTime(this.gains.sfx, t, 0.03);
    this.musicBus!.gain.setTargetAtTime(this.gains.music, t, 0.03);
    this.duckNode!.gain.setTargetAtTime(this.ducked ? MIX_RULES.pauseDuck : 1, t, 0.15);
  }
  play(cue: SoundCue, params: PlayParams) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const recipe = RECIPES[cue];
    const out = ctx.createGain();
    out.gain.value = params.gain;
    out.connect(this.sfxBus!);
    const t0 = ctx.currentTime + 0.005;
    const nodes: AudioScheduledSourceNode[] = [];
    let end = t0;
    for (const tone of recipe.tones ?? []) {
      const at = t0 + (tone.at ?? 0);
      const osc = ctx.createOscillator();
      osc.type = tone.wave;
      osc.frequency.setValueAtTime(tone.freq * params.pitch, at);
      if (tone.to)
        osc.frequency.exponentialRampToValueAtTime(tone.to * params.pitch, at + tone.decay);
      const env = this.envelope(at, tone.attack ?? 0.005, tone.decay, tone.gain);
      let node: AudioNode = osc;
      if (tone.lowpass) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = tone.lowpass;
        node = osc.connect(f);
      }
      node.connect(env).connect(out);
      osc.start(at);
      osc.stop(at + tone.decay + 0.05);
      nodes.push(osc);
      end = Math.max(end, at + tone.decay + 0.05);
    }
    for (const n of recipe.noise ?? []) {
      const at = t0 + (n.at ?? 0);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.playbackRate.value = params.pitch;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = n.q ?? 1;
      f.frequency.setValueAtTime(n.band, at);
      if (n.to) f.frequency.exponentialRampToValueAtTime(n.to, at + n.decay);
      src
        .connect(f)
        .connect(this.envelope(at, 0.003, n.decay, n.gain))
        .connect(out);
      src.start(at);
      src.stop(at + n.decay + 0.05);
      nodes.push(src);
      end = Math.max(end, at + n.decay + 0.05);
    }
    this.voices.set(params.voice, { nodes, gain: out });
    const cleanup = () => {
      this.voices.delete(params.voice);
      out.disconnect();
    };
    if (nodes.length) nodes[nodes.length - 1].onended = cleanup;
    else cleanup();
    void end;
  }
  stop(voice: number) {
    const v = this.voices.get(voice);
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    v.gain.gain.setTargetAtTime(0, t, 0.01);
    for (const n of v.nodes)
      try {
        n.stop(t + 0.05);
      } catch {
        /* already stopped */
      }
    this.voices.delete(voice);
  }
  private envelope(at: number, attack: number, decay: number, gain: number) {
    const env = this.ctx!.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(attack + 0.01, decay));
    return env;
  }
  music(track: MusicTrack | null, ducked: boolean) {
    if (this.ducked !== ducked) {
      this.ducked = ducked;
      this.applyGains();
    }
    if (track === this.wantedTrack) return;
    this.wantedTrack = track;
    if (!this.ctx) return;
    this.fadeOutCurrent();
    if (track) this.startTrack(track);
  }
  private fadeOutCurrent() {
    const old = this.current;
    if (!old || !this.ctx) return;
    const t = this.ctx.currentTime;
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setValueAtTime(old.gain.gain.value, t);
    old.gain.gain.linearRampToValueAtTime(0, t + MIX_RULES.crossfade);
    if (old.timer) clearInterval(old.timer);
    old.timer = null;
    setTimeout(() => old.gain.disconnect(), (MIX_RULES.crossfade + 2) * 1000);
    this.current = null;
  }
  private startTrack(track: MusicTrack) {
    const ctx = this.ctx!;
    this.fadeOutCurrent();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + MIX_RULES.crossfade);
    gain.connect(this.musicBus!);
    const voice: MusicVoice = {
      track,
      gain,
      timer: null,
      nextBeat: ctx.currentTime + 0.1,
      beat: 0,
    };
    // Look-ahead scheduler (presentation timer; never touches the simulation).
    voice.timer = setInterval(() => this.scheduleMusic(voice), 100);
    this.current = voice;
    this.scheduleMusic(voice);
  }
  private scheduleMusic(v: MusicVoice) {
    const ctx = this.ctx!;
    if (ctx.state !== 'running') return;
    const style = TRACKS[v.track];
    const beat = 60 / style.bpm;
    while (v.nextBeat < ctx.currentTime + 0.4) {
      const at = v.nextBeat;
      const bar = Math.floor(v.beat / 4);
      if (v.beat % 4 === 0) {
        // Pad: the bar's chord, slow attack and release over the whole bar.
        const chord = style.chords[bar % style.chords.length];
        for (const n of chord)
          this.musicNote(v, style.pad, semis(style.root, n), at, beat * 4, 0.05, beat);
        this.musicNote(v, 'sine', semis(style.root, chord[0] - 12), at, beat * 4, 0.07, beat * 0.5);
      }
      if (Math.random() < style.density) {
        const deg = style.scale[Math.floor(Math.random() * style.scale.length)];
        const oct = Math.random() < 0.3 ? 24 : 12;
        this.musicNote(v, style.lead, semis(style.root, deg + oct), at, beat * 0.9, 0.035, 0.02);
      }
      v.nextBeat += beat;
      v.beat++;
    }
  }
  private musicNote(
    v: MusicVoice,
    wave: Wave,
    freq: number,
    at: number,
    length: number,
    gain: number,
    attack: number,
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = wave === 'sine' ? 4000 : 1400;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + attack);
    env.gain.linearRampToValueAtTime(0, at + length);
    osc.connect(f).connect(env).connect(v.gain);
    osc.start(at);
    osc.stop(at + length + 0.05);
    osc.onended = () => env.disconnect();
  }
}
