/** QA-only subclasses: this module is reachable only through the gated testing import. */
import { CombatCore } from '../combat-core';
import type { CombatEntity, RandomSource } from '../combat-core';
import { WeaponStatusAdapter } from '../status-effects';
import type { OnHitEffectMapping, StatusEffects } from '../status-effects';
import type { WeaponImpactEvent } from '../weapon-attacks';
import { SYNERGY_RULES, completedPairs } from '../skills';
import type { SynergyId, SynergyPair } from '../skills';
import { GameplayWorld } from './GameplayWorld';
import type { GameplayOptions, WorldEvent } from './types';

export interface QaSynergyDiagnostic {
  readonly id: SynergyId;
  readonly name: string;
  /** All allowed unlock pairs (skill IDs) and the ones currently completed by acquired skills. */
  readonly unlockPairs: readonly SynergyPair[];
  readonly completedPairs: readonly SynergyPair[];
  readonly unlocked: boolean;
  readonly count: number;
  readonly lastTime: number | null;
  readonly lastTargetId: string | null;
}
export interface QaSnapshot {
  readonly godMode: boolean;
  /** Task 12: debug auto-collect of all XP/coins every second (pacing measurement). */
  readonly autoCollect: boolean;
  readonly synergies: readonly QaSynergyDiagnostic[];
}

class QaCombatCore extends CombatCore {
  godMode = false;
  constructor(random: RandomSource) {
    super(random);
  }
  protected override hpAfterDamage(target: CombatEntity, damage: number): number {
    return this.godMode && target.id === 'player'
      ? target.currentHp
      : super.hpAfterDamage(target, damage);
  }
}

/** Preserve successful enemy on-hit effects while God Mode prevents only the final HP loss. */
class QaStatusAdapter extends WeaponStatusAdapter {
  constructor(
    statuses: StatusEffects,
    mapping: OnHitEffectMapping,
    private readonly core: QaCombatCore,
  ) {
    super(statuses, mapping);
  }
  protected override hasHpLoss(impact: WeaponImpactEvent): boolean {
    return (
      super.hasHpLoss(impact) ||
      (this.core.godMode && impact.targetId === 'player' && impact.result.damage > 0)
    );
  }
}

export class QaGameplayWorld extends GameplayWorld {
  private readonly counters = new Map<
    SynergyId,
    { count: number; time: number; targetId: string }
  >();
  constructor(options: GameplayOptions) {
    super(options, (random) => new QaCombatCore(random));
  }
  private get qaCore() {
    return this.core as QaCombatCore;
  }
  protected override createStatusAdapter(mapping: OnHitEffectMapping): WeaponStatusAdapter {
    return new QaStatusAdapter(this.statuses, mapping, this.qaCore);
  }
  protected override record(
    channel: WorldEvent['channel'],
    events: readonly WorldEvent['event'][],
  ) {
    super.record(channel, events);
    // Base construction can emit spawn events before subclass fields initialize; no skills are owned then.
    if (channel !== 'skill' || !this.counters) return;
    for (const event of events)
      if (event.type === 'synergy-triggered') {
        const rule = SYNERGY_RULES.find(
          (r) => r.id === event.synergyId && r.characterClass === this.character.characterClass,
        );
        if (!rule) continue;
        const previous = this.counters.get(rule.id);
        this.counters.set(rule.id, {
          count: (previous?.count ?? 0) + 1,
          time: this.time,
          targetId: event.targetId,
        });
      }
  }
  setGodMode(enabled: boolean): void {
    if (typeof enabled !== 'boolean') throw new TypeError('God Mode must be boolean.');
    this.qaCore.godMode = enabled;
  }
  resetSynergyCounters(): void {
    this.counters.clear();
  }
  qaSnapshot(): QaSnapshot {
    return Object.freeze({
      godMode: this.qaCore.godMode,
      autoCollect: this.debugAutoCollect,
      synergies: Object.freeze(
        SYNERGY_RULES.filter((rule) => rule.characterClass === this.character.characterClass).map(
          (rule) => {
            const counter = this.counters.get(rule.id);
            return Object.freeze({
              id: rule.id,
              name: rule.name,
              unlockPairs: rule.unlockPairs,
              completedPairs: Object.freeze(completedPairs(rule, this.run.ownedIds())),
              unlocked: this.skills.synergies.isEligible(rule.id),
              count: counter?.count ?? 0,
              lastTime: counter?.time ?? null,
              lastTargetId: counter?.targetId ?? null,
            });
          },
        ),
      ),
    });
  }
  /** Explicit QA HP/death commands retain their meaning; this never advances the simulation. */
  setQaHp(hp: number): void {
    const enabled = this.qaCore.godMode;
    try {
      this.qaCore.godMode = false;
      this.setPlayerHp(hp);
    } finally {
      this.qaCore.godMode = enabled;
    }
  }
}
