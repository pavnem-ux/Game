import type { WorldEvent } from '../gameplay';
import type { SoundCue } from './cues';

/** Task 15: each synergy's trigger sound family (its element). */
export const SYNERGY_FAMILY: Readonly<Record<string, SoundCue>> = Object.freeze({
  thermal_shock: 'synergy-fire',
  wildfire: 'synergy-fire',
  shattered_ice: 'synergy-ice',
  skull_crusher: 'synergy-impact',
  battle_momentum: 'synergy-impact',
  seismic_impact: 'synergy-impact',
  toxic_barrage: 'synergy-poison',
  plague_chain: 'synergy-poison',
  deadly_precision: 'synergy-poison',
  blood_frenzy: 'synergy-blood',
  deep_wounds: 'synergy-blood',
  final_cut: 'synergy-blood',
});

/**
 * Task 14: world event → sound cue mapping (pure; read-only). The director passes each frame's new
 * world events; nothing here can affect the simulation.
 */
export interface CueContext {
  readonly playerId: string;
  /** Enemy ids that are elites / the boss in the current run (from the latest snapshot). */
  readonly eliteIds: ReadonlySet<string>;
  readonly bossId: string | null;
}
export function cuesForEvent(entry: WorldEvent, ctx: CueContext): readonly SoundCue[] {
  const e = entry.event;
  switch (e.type) {
    case 'damage':
      if (e.targetId === ctx.playerId) return e.appliedDamage > 0 ? ['player-hit'] : [];
      if (e.appliedDamage <= 0) return [];
      return [
        e.damageType === 'magical' ? 'enemy-hit-magical' : 'enemy-hit-physical',
        ...(e.critical ? (['crit'] as const) : []),
      ];
    case 'periodic-damage':
      return e.targetId !== ctx.playerId && e.appliedDamage > 0 ? ['enemy-hit-dot'] : [];
    case 'death':
      if (e.entityId === ctx.playerId) return [];
      if (e.entityId === ctx.bossId) return ['boss-death'];
      return ctx.eliteIds.has(e.entityId) ? ['elite-death'] : ['enemy-death'];
    case 'xp-collected':
      return ['pickup-xp'];
    case 'coins-collected':
    case 'coins-granted':
      return ['pickup-coin'];
    case 'run-level-up':
      return ['level-up'];
    case 'skill-chosen':
      return entry.channel === 'skill' ? ['card-pick'] : [];
    case 'skill-offer':
      return e.reroll ? ['reroll'] : [];
    case 'skill-banished':
      return ['banish'];
    case 'skill-offer-skipped':
      return ['ui-confirm'];
    case 'synergy-unlocked':
      return ['synergy'];
    case 'synergy-level-up':
      return [e.level === 3 ? 'synergy-awakening' : 'synergy-level'];
    case 'synergy-triggered': {
      const family = SYNERGY_FAMILY[e.synergyId];
      if (!family) return [];
      return e.awakened ? [family, 'synergy-awaken'] : [family];
    }
    case 'elite-spawned':
      return ['elite-alarm'];
    case 'boss-spawned':
      return ['boss-horn'];
    case 'boss-cast-started':
      return e.telegraph ? ['telegraph'] : [];
    case 'artillery-marked':
      return ['telegraph'];
    case 'chest-spawned':
      return ['chest-spawn'];
    case 'chest-opened':
      return ['chest-open'];
    // Task 24: map activities.
    case 'activity-spawned':
      return ['activity-spawn'];
    case 'activity-completed':
      return ['activity-complete'];
    case 'activity-failed':
    case 'activity-faded':
      return ['activity-fail'];
    case 'buff-started':
      return ['buff-gain'];
    case 'buff-ended':
      return e.reason === 'expired' ? ['buff-expire'] : [];
    case 'dash-started':
      return ['dash'];
    case 'player-revived':
      return ['revive'];
    case 'run-resolved':
      return e.outcome === 'victory' ? ['victory'] : e.outcome === 'defeat' ? ['defeat'] : [];
    case 'run-ended':
      return ['defeat'];
    default:
      return [];
  }
}
