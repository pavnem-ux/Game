import type { CharacterClass } from '../character-stats';
import { sameInstant } from '../simulation-boundary';
import type { EffectType } from '../status-effects';
import type { Point } from '../weapon-attacks';
import { SYNERGY_TUNING } from './config';
import type { HitInfo, PreHit, SkillEngine } from './SkillEngine';
import type { CombatTag } from './types';

export type SynergyId =
  | 'thermal_shock'
  | 'wildfire'
  | 'shattered_ice'
  | 'skull_crusher'
  | 'battle_momentum'
  | 'seismic_impact'
  | 'toxic_barrage'
  | 'plague_chain'
  | 'deadly_precision'
  | 'blood_frenzy'
  | 'deep_wounds'
  | 'final_cut';
export interface SynergyRule {
  readonly id: SynergyId;
  readonly name: string;
  readonly characterClass: CharacterClass;
  readonly trigger: 'hit' | 'kill';
  /** Any acquired skill with one of these catalogue tags unlocks this rule (rank I+). */
  readonly requiredSkillTags: readonly CombatTag[];
  readonly description: string;
}
/** Display/catalogue data. Conditions are evaluated from tags, statuses and events below. */
export const SYNERGY_RULES: readonly SynergyRule[] = Object.freeze([
  {
    id: 'thermal_shock',
    requiredSkillTags: Object.freeze(['ice']),
    name: 'Термошок',
    characterClass: 'mage',
    trigger: 'hit',
    description: 'Прямой удар льдом по цели с Burn — магический взрыв.',
  },
  {
    id: 'wildfire',
    requiredSkillTags: Object.freeze(['fire']),
    name: 'Лесной пожар',
    characterClass: 'mage',
    trigger: 'kill',
    description: 'Смерть цели с Burn распространяет Burn на соседей.',
  },
  {
    id: 'shattered_ice',
    requiredSkillTags: Object.freeze(['ice']),
    name: 'Расколотый лёд',
    characterClass: 'mage',
    trigger: 'hit',
    description: 'Прямой удар льдом по замедленной цели — бонусный ледяной урон.',
  },
  {
    id: 'skull_crusher',
    requiredSkillTags: Object.freeze(['melee']),
    name: 'Сокрушитель черепов',
    characterClass: 'warrior',
    trigger: 'hit',
    description: 'Физический удар ближнего боя по оглушённой цели — доп. урон.',
  },
  {
    id: 'battle_momentum',
    requiredSkillTags: Object.freeze(['melee']),
    name: 'Боевой напор',
    characterClass: 'warrior',
    trigger: 'kill',
    description: 'Убийство в ближнем бою — краткий бонус скорости атаки.',
  },
  {
    id: 'seismic_impact',
    requiredSkillTags: Object.freeze(['heavy_melee']),
    name: 'Сейсмический удар',
    characterClass: 'warrior',
    trigger: 'hit',
    description: 'Тяжёлый удар по оглушённой цели — ударная волна.',
  },
  {
    id: 'toxic_barrage',
    requiredSkillTags: Object.freeze(['projectile']),
    name: 'Токсичный шквал',
    characterClass: 'archer',
    trigger: 'hit',
    description:
      'Несколько разных снарядов по отравленной цели за короткое время — ядовитый взрыв.',
  },
  {
    id: 'plague_chain',
    requiredSkillTags: Object.freeze(['poison']),
    name: 'Цепь чумы',
    characterClass: 'archer',
    trigger: 'kill',
    description: 'Смерть отравленной цели распространяет Poison.',
  },
  {
    id: 'deadly_precision',
    requiredSkillTags: Object.freeze(['projectile']),
    name: 'Смертельная точность',
    characterClass: 'archer',
    trigger: 'hit',
    description: 'Серия прямых попаданий по одной отравленной цели — бонус урона по ней.',
  },
  {
    id: 'blood_frenzy',
    requiredSkillTags: Object.freeze(['dagger']),
    name: 'Кровавое безумие',
    characterClass: 'rogue',
    trigger: 'hit',
    description: 'Удар кинжалом по кровоточащей цели — бонус скорости атаки.',
  },
  {
    id: 'deep_wounds',
    requiredSkillTags: Object.freeze(['dagger']),
    name: 'Глубокие раны',
    characterClass: 'rogue',
    trigger: 'hit',
    description: 'Крит по кровоточащей цели — дополнительный стак Bleed.',
  },
  {
    id: 'final_cut',
    requiredSkillTags: Object.freeze(['dagger', 'mark']),
    name: 'Последний разрез',
    characterClass: 'rogue',
    trigger: 'hit',
    description: 'Удар по кровоточащей цели с низким HP — добивающий урон.',
  },
] satisfies SynergyRule[]);

const RULES_BY_ID = new Map(SYNERGY_RULES.map((rule) => [rule.id, rule]));

const SYNERGY_TAGS: ReadonlySet<CombatTag> = new Set(['synergy', 'secondary']);
const T = SYNERGY_TUNING;

/**
 * Event-driven synergy rules. Each rule fires at most once per originating hit/kill; proc damage is
 * tagged `synergy` with procs=false, so it can never trigger another synergy (no cascades).
 */
export class SynergyResolver {
  private readonly cooldowns = new Map<string, number>();
  private readonly barrage = new Map<string, { since: number; keys: Set<string> }>();
  private focus: { targetId: string; since: number; hits: number; bonusUntil: number } | null =
    null;
  constructor(private readonly e: SkillEngine) {}
  private get cls() {
    return this.e.host.characterClass;
  }
  private eligible(id: SynergyId): boolean {
    const rule = RULES_BY_ID.get(id)!;
    return (
      rule.characterClass === this.cls &&
      this.e.run
        .ownedIds()
        .some((skillId) =>
          this.e.run.definition(skillId).tags.some((tag) => rule.requiredSkillTags.includes(tag)),
        )
    );
  }
  private now() {
    return this.e.time;
  }
  private ready(id: SynergyId, targetId: string) {
    const at = this.cooldowns.get(`${id}:${targetId}`);
    return at === undefined || at <= this.now() || sameInstant(at, this.now());
  }
  private cool(id: SynergyId, targetId: string, seconds: number) {
    this.cooldowns.set(`${id}:${targetId}`, this.now() + seconds);
  }
  private announce(id: SynergyId, targetId: string, position: Point | null) {
    this.e.host.recordSkill([
      Object.freeze({
        type: 'synergy-triggered',
        synergyId: id,
        targetId,
        position: Object.freeze({ ...(position ?? this.e.player) }),
      }),
    ]);
  }
  private procDamage(
    id: SynergyId,
    targetId: string,
    coefficient: number,
    damageType: 'physical' | 'magical',
    extra: CombatTag[] = [],
  ) {
    const tags = new Set<CombatTag>([...SYNERGY_TAGS, damageType, ...extra]);
    return this.e.hit(targetId, this.e.attack(new Set(), coefficient, damageType), tags, {
      procs: false,
    });
  }
  private spread(
    id: SynergyId,
    center: Point,
    exclude: string,
    effectType: EffectType,
    damage: number,
    duration: number,
    radius: number,
    max: number,
  ) {
    const ids = this.e
      .inCircle(center, radius)
      .filter((x) => x !== exclude)
      .map((x) => ({
        x,
        d: Math.hypot(this.e.body(x)!.x - center.x, this.e.body(x)!.y - center.y),
      }))
      .sort((a, b) => a.d - b.d || (a.x < b.x ? -1 : 1))
      .slice(0, max);
    // originId marks synergy-applied stacks: kills from them never re-trigger spread rules.
    for (const { x } of ids)
      this.e.applyStatus(
        x,
        { effectType, rawDamagePerTick: damage, duration, probabilityPercent: 100 },
        1,
        `synergy:${id}`,
      );
    return ids.length;
  }
  /** Damage multiplier against the current Deadly Precision focus target. Pure. */
  focusMultiplier(targetId: string): number {
    const f = this.focus;
    if (this.cls !== 'archer' || !f || f.targetId !== targetId) return 1;
    return f.bonusUntil > this.now() || sameInstant(f.bonusUntil, this.now())
      ? 1 + T.deadlyPrecision.bonusPercent / 100
      : 1;
  }
  onHit(hit: HitInfo): void {
    if (!hit.procs || hit.tags.has('synergy')) return;
    const { pre, targetId, tags } = hit;
    const alive = () => this.e.host.core.getEntity(targetId).alive;
    switch (this.cls) {
      case 'mage':
        if (
          this.eligible('thermal_shock') &&
          tags.has('ice') &&
          pre.effects.has('burn') &&
          this.ready('thermal_shock', targetId) &&
          alive()
        ) {
          this.cool('thermal_shock', targetId, T.thermalShock.cooldown);
          this.announce('thermal_shock', targetId, pre.position);
          this.procDamage('thermal_shock', targetId, T.thermalShock.coefficient, 'magical', [
            'fire',
            'ice',
          ]);
        }
        if (
          this.eligible('shattered_ice') &&
          tags.has('ice') &&
          pre.slowed &&
          this.ready('shattered_ice', targetId) &&
          alive()
        ) {
          this.cool('shattered_ice', targetId, T.shatteredIce.cooldown);
          this.announce('shattered_ice', targetId, pre.position);
          this.procDamage('shattered_ice', targetId, T.shatteredIce.coefficient, 'magical', [
            'ice',
          ]);
        }
        break;
      case 'warrior': {
        const physicalMelee = tags.has('physical') && tags.has('melee');
        if (
          this.eligible('skull_crusher') &&
          physicalMelee &&
          pre.stunned &&
          this.ready('skull_crusher', targetId) &&
          alive()
        ) {
          this.cool('skull_crusher', targetId, T.skullCrusher.cooldown);
          this.announce('skull_crusher', targetId, pre.position);
          this.procDamage('skull_crusher', targetId, T.skullCrusher.coefficient, 'physical');
        }
        if (
          this.eligible('seismic_impact') &&
          tags.has('heavy_melee') &&
          pre.stunned &&
          this.ready('seismic_impact', targetId) &&
          pre.position
        ) {
          this.cool('seismic_impact', targetId, T.seismicImpact.cooldown);
          this.announce('seismic_impact', targetId, pre.position);
          const r = this.e.area(T.seismicImpact.radius);
          const attack = this.e.attack(new Set(), T.seismicImpact.coefficient, 'physical');
          const procTags = new Set<CombatTag>([...SYNERGY_TAGS, 'physical', 'area']);
          let n = 0;
          for (const id of this.e.inCircle(pre.position, r))
            if (this.e.hit(id, attack, procTags, { procs: false })) n++;
          this.e.recordArea('seismic_impact', 'circle', pre.position, r, n);
        }
        break;
      }
      case 'archer': {
        if (!pre.effects.has('poison')) {
          if (this.focus?.targetId === targetId) this.focus.hits = 0;
          break;
        }
        // Toxic Barrage: distinct projectiles on one poisoned target inside a short window.
        if (
          this.eligible('toxic_barrage') &&
          tags.has('projectile') &&
          hit.projectileKey &&
          this.ready('toxic_barrage', targetId)
        ) {
          let b = this.barrage.get(targetId);
          if (!b || this.now() - b.since > T.toxicBarrage.window) {
            b = { since: this.now(), keys: new Set() };
            this.barrage.set(targetId, b);
          }
          b.keys.add(hit.projectileKey);
          if (b.keys.size >= T.toxicBarrage.projectiles && alive()) {
            this.barrage.delete(targetId);
            this.cool('toxic_barrage', targetId, T.toxicBarrage.cooldown);
            this.announce('toxic_barrage', targetId, pre.position);
            const proc = this.procDamage(
              'toxic_barrage',
              targetId,
              T.toxicBarrage.coefficient,
              'physical',
            );
            if (proc && alive())
              this.e.applyStatus(
                targetId,
                {
                  effectType: 'poison',
                  rawDamagePerTick: T.toxicBarrage.poisonDamage,
                  duration: T.toxicBarrage.poisonDuration,
                  probabilityPercent: 100,
                },
                1,
                'synergy:toxic_barrage',
              );
          }
        }
        // Deadly Precision: repeated direct hits on the same poisoned target; resets on change/expiry.
        if (this.eligible('deadly_precision')) {
          const f = this.focus;
          if (!f || f.targetId !== targetId || this.now() - f.since > T.deadlyPrecision.window)
            this.focus = {
              targetId,
              since: this.now(),
              hits: 1,
              bonusUntil: f?.targetId === targetId ? f.bonusUntil : 0,
            };
          else f.hits++;
          const focus = this.focus!;
          if (focus.hits >= T.deadlyPrecision.hits) {
            const fresh = !(focus.bonusUntil > this.now());
            focus.bonusUntil = this.now() + T.deadlyPrecision.duration;
            focus.hits = 0;
            focus.since = this.now();
            if (fresh) this.announce('deadly_precision', targetId, pre.position);
          }
        }
        break;
      }
      case 'rogue': {
        if (!pre.effects.has('bleed')) break;
        if (this.eligible('blood_frenzy') && tags.has('dagger')) {
          const current = this.e.buff('blood_frenzy');
          if (!current) this.announce('blood_frenzy', targetId, pre.position);
          // Refresh duration, never stack: the global Attack Speed cap still applies.
          this.e.setBuff(
            'blood_frenzy',
            1,
            T.bloodFrenzy.attackSpeed,
            this.now() + T.bloodFrenzy.duration,
          );
        }
        if (
          this.eligible('deep_wounds') &&
          hit.attack.critical &&
          this.ready('deep_wounds', targetId) &&
          alive()
        ) {
          this.cool('deep_wounds', targetId, T.deepWounds.cooldown);
          this.announce('deep_wounds', targetId, pre.position);
          this.e.applyStatus(
            targetId,
            {
              effectType: 'bleed',
              rawDamagePerTick: T.deepWounds.bleedDamage,
              duration: T.deepWounds.bleedDuration,
              probabilityPercent: 100,
            },
            1,
            'synergy:deep_wounds',
          );
        }
        if (this.eligible('final_cut') && alive()) {
          const target = this.e.host.core.getEntity(targetId);
          if (
            (target.currentHp / target.maxHp) * 100 < T.finalCut.hpThresholdPercent &&
            this.ready('final_cut', targetId)
          ) {
            this.cool('final_cut', targetId, T.finalCut.cooldown);
            this.announce('final_cut', targetId, pre.position);
            this.procDamage('final_cut', targetId, T.finalCut.coefficient, 'physical');
          }
        }
        break;
      }
    }
  }
  onKill(
    targetId: string,
    pre: PreHit,
    cause: { direct: boolean; tags: ReadonlySet<CombatTag>; procs: boolean },
  ): void {
    if (!cause.procs || cause.tags.has('synergy')) return;
    if (this.eligible('wildfire') && pre.effects.has('burn') && pre.position) {
      const n = this.spread(
        'wildfire',
        pre.position,
        targetId,
        'burn',
        T.wildfire.burnDamage,
        T.wildfire.burnDuration,
        this.e.area(T.wildfire.radius),
        T.wildfire.maxTargets,
      );
      if (n) this.announce('wildfire', targetId, pre.position);
    }
    if (this.eligible('plague_chain') && pre.effects.has('poison') && pre.position) {
      const n = this.spread(
        'plague_chain',
        pre.position,
        targetId,
        'poison',
        T.plagueChain.poisonDamage,
        T.plagueChain.poisonDuration,
        this.e.area(T.plagueChain.radius),
        T.plagueChain.maxTargets,
      );
      if (n) this.announce('plague_chain', targetId, pre.position);
    }
    if (this.eligible('battle_momentum') && cause.direct && cause.tags.has('melee')) {
      if (!this.e.buff('battle_momentum')) this.announce('battle_momentum', targetId, pre.position);
      this.e.setBuff(
        'battle_momentum',
        1,
        T.battleMomentum.attackSpeed,
        this.now() + T.battleMomentum.duration,
      );
    }
    if (this.focus?.targetId === targetId) this.focus = null;
  }
  prune(living: ReadonlySet<string>): void {
    for (const key of [...this.cooldowns.keys()]) {
      const target = key.slice(key.indexOf(':') + 1);
      if (!living.has(target) && this.cooldowns.get(key)! < this.now()) this.cooldowns.delete(key);
    }
    for (const id of [...this.barrage.keys()]) if (!living.has(id)) this.barrage.delete(id);
    if (this.focus && !living.has(this.focus.targetId)) this.focus = null;
  }
}
