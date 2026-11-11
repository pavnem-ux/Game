import { describe, expect, it, vi } from 'vitest';
import {
  AudioDirector,
  CUES,
  CueLimiter,
  MIX_RULES,
  SOUND_CUES,
  busGains,
  cuesForEvent,
  musicFor,
  seriesPitch,
} from '../../src/audio';
import type { AudioSink, CueContext, MusicTrack, PlayParams, SoundCue } from '../../src/audio';
import { RECIPES, TRACKS, WebAudioEngine } from '../../src/audio/engine';
import { GameplayWorld } from '../../src/gameplay';
import { cardKey } from '../../src/skills';
import type { WorldEvent } from '../../src/gameplay';
import {
  DEFAULT_UI_SETTINGS,
  UI_SETTINGS_KEY,
  createUiSettings,
  parseUiSettings,
} from '../../src/gameplay-ui/ui-settings';

const ctx: CueContext = { playerId: 'player', eliteIds: new Set(['e7']), bossId: 'boss' };
const ev = (event: object, channel = 'combat'): WorldEvent =>
  ({ sequence: 1, time: 0, channel, event }) as unknown as WorldEvent;
const cues = (event: object, channel?: string) => cuesForEvent(ev(event, channel), ctx);

class FakeSink implements AudioSink {
  t = 0;
  live = false;
  played: { cue: SoundCue; params: PlayParams }[] = [];
  stopped: number[] = [];
  tracks: { track: MusicTrack | null; ducked: boolean }[] = [];
  gains: { sfx: number; music: number }[] = [];
  play(cue: SoundCue, params: PlayParams) {
    this.played.push({ cue, params });
  }
  stop(voice: number) {
    this.stopped.push(voice);
  }
  music(track: MusicTrack | null, ducked: boolean) {
    this.tracks.push({ track, ducked });
  }
  volumes(g: { sfx: number; music: number }) {
    this.gains.push(g);
  }
  now() {
    return this.t;
  }
}
const mid = () => 0.5; // jitter-free random

describe('Task 14 Phase 3 — event → sound mapping', () => {
  it('maps combat, pickups, offers, campaign, chests, dash and outcomes to cues', () => {
    const dmg = { type: 'damage', targetId: 'm1', appliedDamage: 5, critical: false };
    expect(cues({ ...dmg, damageType: 'physical' })).toEqual(['enemy-hit-physical']);
    expect(cues({ ...dmg, damageType: 'magical', critical: true })).toEqual([
      'enemy-hit-magical',
      'crit',
    ]);
    expect(cues({ ...dmg, appliedDamage: 0, damageType: 'physical' })).toEqual([]);
    expect(cues({ ...dmg, targetId: 'player', damageType: 'physical' })).toEqual(['player-hit']);
    expect(cues({ type: 'periodic-damage', targetId: 'm1', appliedDamage: 2 })).toEqual([
      'enemy-hit-dot',
    ]);
    expect(cues({ type: 'death', entityId: 'm1' })).toEqual(['enemy-death']);
    expect(cues({ type: 'death', entityId: 'e7' })).toEqual(['elite-death']);
    expect(cues({ type: 'death', entityId: 'boss' })).toEqual(['boss-death']);
    expect(cues({ type: 'death', entityId: 'player' })).toEqual([]);
    expect(cues({ type: 'xp-collected' })).toEqual(['pickup-xp']);
    expect(cues({ type: 'coins-collected' })).toEqual(['pickup-coin']);
    expect(cues({ type: 'run-level-up' })).toEqual(['level-up']);
    expect(cues({ type: 'skill-chosen' }, 'skill')).toEqual(['card-pick']);
    expect(cues({ type: 'skill-offer', reroll: true }, 'skill')).toEqual(['reroll']);
    expect(cues({ type: 'skill-offer', reroll: false }, 'skill')).toEqual([]);
    expect(cues({ type: 'skill-banished' }, 'skill')).toEqual(['banish']);
    expect(cues({ type: 'synergy-unlocked' }, 'skill')).toEqual(['synergy']);
    expect(cues({ type: 'elite-spawned' }, 'campaign')).toEqual(['elite-alarm']);
    expect(cues({ type: 'boss-spawned' }, 'campaign')).toEqual(['boss-horn']);
    expect(cues({ type: 'boss-cast-started', telegraph: {} })).toEqual(['telegraph']);
    expect(cues({ type: 'artillery-marked' }, 'enemy')).toEqual(['telegraph']);
    expect(cues({ type: 'chest-spawned' })).toEqual(['chest-spawn']);
    expect(cues({ type: 'chest-opened', content: 'gold' })).toEqual(['chest-open']);
    expect(cues({ type: 'buff-started' })).toEqual(['buff-gain']);
    expect(cues({ type: 'buff-ended', reason: 'expired' })).toEqual(['buff-expire']);
    expect(cues({ type: 'buff-ended', reason: 'run-ended' })).toEqual([]);
    expect(cues({ type: 'dash-started' }, 'movement')).toEqual(['dash']);
    expect(cues({ type: 'player-revived' }, 'survival')).toEqual(['revive']);
    expect(cues({ type: 'run-resolved', outcome: 'victory' })).toEqual(['victory']);
    expect(cues({ type: 'run-resolved', outcome: 'defeat' })).toEqual(['defeat']);
    expect(cues({ type: 'run-resolved', outcome: 'abandoned' })).toEqual([]);
    expect(cues({ type: 'attack-started' })).toEqual([]);
  });
  it('every cue has a synthesis recipe; every music track has a style', () => {
    for (const cue of SOUND_CUES) {
      const r = RECIPES[cue];
      expect((r.tones?.length ?? 0) + (r.noise?.length ?? 0)).toBeGreaterThan(0);
      expect(CUES[cue].gain).toBeLessThanOrEqual(1);
    }
    expect(Object.keys(TRACKS).sort()).toEqual(
      ['act-1', 'act-2', 'act-3', 'act-4', 'boss', 'menu'].sort(),
    );
  });
});

describe('Task 14 Phase 3 — rate limits and voice cap', () => {
  it('hits ≤ 8 and pickups ≤ 6 per 100 ms; the window slides', () => {
    expect(MIX_RULES.limits.hit).toEqual({ max: 8, window: 0.1 });
    expect(MIX_RULES.limits.pickup).toEqual({ max: 6, window: 0.1 });
    const l = new CueLimiter();
    const hits = Array.from({ length: 12 }, (_, i) => l.admit('enemy-hit-physical', i * 0.005));
    expect(hits.filter((h) => h.admitted)).toHaveLength(8);
    expect(hits[8].reason).toBe('rate-limit');
    expect(l.admit('enemy-hit-physical', 0.101).admitted).toBe(true);
    const picks = Array.from({ length: 10 }, () => l.admit('pickup-xp', 1));
    expect(picks.filter((p) => p.admitted)).toHaveLength(6);
  });
  it('voice cap 24: a higher-priority cue steals the lowest voice, an equal one is dropped', () => {
    expect(MIX_RULES.voiceCap).toBe(24);
    const l = new CueLimiter({
      ...MIX_RULES,
      limits: {
        ...MIX_RULES.limits,
        event: { max: 99, window: 0.1 },
        hit: { max: 99, window: 0.1 },
      },
    });
    for (let i = 0; i < 24; i++) expect(l.admit('enemy-hit-physical', 0).admitted).toBe(true);
    expect(l.activeVoices).toBe(24);
    expect(l.admit('enemy-hit-physical', 0)).toMatchObject({
      admitted: false,
      reason: 'voice-cap',
    });
    const boss = l.admit('boss-horn', 0);
    expect(boss.admitted).toBe(true);
    expect(boss.steal).toBeGreaterThan(0);
    expect(l.activeVoices).toBe(24);
    // Voices free up once their length has passed.
    expect(l.admit('enemy-hit-physical', 1).admitted).toBe(true);
    expect(l.activeVoices).toBe(2); // the horn (2 s) and the new hit
  });
  it('pickup pitch climbs in a quick series and resets after 0.5 s of quiet', () => {
    const l = new CueLimiter();
    const steps = [0, 0.15, 0.3, 0.45].map((t) => l.admit('pickup-xp', t).step);
    expect(steps).toEqual([0, 1, 2, 3]);
    expect(l.admit('pickup-xp', 0.96).step).toBe(0);
    expect(seriesPitch(12)).toBeCloseTo(2, 9);
    const d = new AudioDirector(new FakeSink(), mid);
    const sink = (d as unknown as { sink: FakeSink }).sink;
    d.cue('pickup-coin');
    sink.t = 0.2;
    d.cue('pickup-coin');
    expect(sink.played.map((p) => p.params.pitch)).toEqual([1, seriesPitch(1)]);
  });
});

describe('Task 14 Phase 3 — director: mute, jingles, music, heartbeat', () => {
  it('muted plays nothing; victory/defeat play once per run; bus gains follow settings', () => {
    const sink = new FakeSink();
    const d = new AudioDirector(sink, mid);
    d.setMuted(true);
    expect(d.cue('level-up')).toBe('muted');
    d.setMuted(false);
    d.state({ screen: 'playing', runId: 1, act: 1, bossAlive: false, hpShare: 1 });
    expect(d.cue('defeat')).toBe('silent'); // no live context in tests
    sink.t = 5;
    expect(d.cue('defeat')).toBe('rate-limit');
    d.state({ screen: 'playing', runId: 2, act: 1, bossAlive: false, hpShare: 1 });
    expect(d.cue('victory')).toBe('silent');
    expect(sink.played.map((p) => p.cue)).toEqual(['defeat', 'victory']);
    expect(d.getLog().at(-1)).toMatchObject({ cue: 'victory', result: 'silent' });
    const gains = busGains({ ...DEFAULT_UI_SETTINGS });
    expect(gains.sfx).toBeCloseTo(0.64, 9);
    expect(gains.music).toBeCloseTo(0.4, 9);
    expect(busGains({ ...DEFAULT_UI_SETTINGS, muted: true })).toEqual({ sfx: 0, music: 0 });
  });
  it('music: menu theme, act tracks, boss variant, pause duck, silence on results', () => {
    const base = { runId: 1, act: 3, bossAlive: false, hpShare: 1 };
    expect(musicFor({ ...base, screen: 'menu' })).toEqual({ track: 'menu', ducked: false });
    expect(musicFor({ ...base, screen: 'playing' })).toEqual({ track: 'act-3', ducked: false });
    expect(musicFor({ ...base, act: null, screen: 'playing' }).track).toBe('act-1');
    expect(musicFor({ ...base, bossAlive: true, screen: 'playing' }).track).toBe('boss');
    expect(musicFor({ ...base, screen: 'paused' })).toEqual({ track: 'act-3', ducked: true });
    expect(musicFor({ ...base, screen: 'level-up' }).ducked).toBe(true);
    expect(musicFor({ ...base, screen: 'results' }).track).toBeNull();
    expect(MIX_RULES).toMatchObject({ crossfade: 1, pauseDuck: 0.5 });
    const sink = new FakeSink();
    const d = new AudioDirector(sink, mid);
    d.state({ ...base, screen: 'menu' });
    d.state({ ...base, screen: 'menu' });
    d.state({ ...base, screen: 'playing' });
    d.state({ ...base, screen: 'paused' });
    expect(sink.tracks).toEqual([
      { track: 'menu', ducked: false },
      { track: 'act-3', ducked: false },
      { track: 'act-3', ducked: true },
    ]);
  });
  it('low-HP heartbeat below 25% while playing, paced by the audio clock', () => {
    const sink = new FakeSink();
    const d = new AudioDirector(sink, mid);
    const at = (hpShare: number, screen = 'playing') =>
      d.state({ screen, runId: 1, act: 1, bossAlive: false, hpShare });
    at(0.3);
    d.frame();
    expect(sink.played).toHaveLength(0);
    at(0.2);
    for (let t = 0; t <= 3; t += 1 / 60) {
      sink.t = t;
      d.frame();
    }
    expect(sink.played.filter((p) => p.cue === 'heartbeat')).toHaveLength(3); // 0, 1.1, 2.2
    at(0.2, 'paused');
    sink.t = 10;
    d.frame();
    expect(sink.played).toHaveLength(3);
  });
});

describe('Task 14 Phase 3 — settings persist; no AudioContext in tests; simulation unaffected', () => {
  it('volumes 0–100 (defaults 80/80/50) and mute persist in the settings key', () => {
    expect(DEFAULT_UI_SETTINGS).toMatchObject({
      masterVolume: 80,
      sfxVolume: 80,
      musicVolume: 50,
      muted: false,
    });
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    const s = createUiSettings(storage);
    s.set({ masterVolume: 35, musicVolume: 0, muted: true });
    const again = createUiSettings(storage).get();
    expect(again).toMatchObject({ masterVolume: 35, sfxVolume: 80, musicVolume: 0, muted: true });
    expect(JSON.parse(data.get(UI_SETTINGS_KEY)!)).toMatchObject({ masterVolume: 35 });
    // Out-of-range / invalid values are clamped or fall back.
    expect(
      parseUiSettings('{"masterVolume":250,"sfxVolume":-3,"musicVolume":"x","muted":1}'),
    ).toMatchObject({
      masterVolume: 100,
      sfxVolume: 0,
      musicVolume: 50,
      muted: false,
    });
    s.set({ sfxVolume: 1000 });
    expect(s.get().sfxVolume).toBe(100);
  });
  it('no AudioContext is created in Node or under automation; the engine stays silent', () => {
    expect((globalThis as { AudioContext?: unknown }).AudioContext).toBeUndefined();
    const engine = new WebAudioEngine();
    expect(engine.unlock()).toBe(false);
    expect(engine.live).toBe(false);
    engine.play('level-up', { voice: 1, pitch: 1, gain: 0.5 }); // no-op, no throw
    engine.music('act-1', false);
    // A browser-like global under automation (headless e2e) is never constructed.
    const Ctor = vi.fn();
    vi.stubGlobal('window', { AudioContext: Ctor });
    vi.stubGlobal('navigator', { webdriver: true });
    try {
      expect(new WebAudioEngine().unlock()).toBe(false);
      expect(Ctor).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('same seed: identical world results with the audio director listening or not', () => {
    const run = (withAudio: boolean) => {
      const w = new GameplayWorld({ characterClass: 'warrior', seed: 42, campaign: { mapId: 3 } });
      const sink = new FakeSink();
      const d = new AudioDirector(sink, mid);
      let seq = 0;
      w.setMovement(1, 0.4);
      for (let i = 0; i < 60 * 40; i++) {
        w.update(1 / 60);
        if (w.run.currentOffer) w.chooseSkill(cardKey(w.run.currentOffer.cards[0]));
        const fresh = w.getEvents(seq);
        if (fresh.length) seq = fresh.at(-1)!.sequence;
        if (withAudio) {
          sink.t = i / 60;
          d.worldEvents(fresh, { playerId: 'player', eliteIds: new Set(), bossId: null });
          d.frame();
        }
      }
      return { snapshot: JSON.stringify(w.getSnapshot()), events: seq, played: sink.played.length };
    };
    const on = run(true);
    const off = run(false);
    expect(on.snapshot).toBe(off.snapshot);
    expect(on.events).toBe(off.events);
    expect(on.played).toBeGreaterThan(0);
  });
});
