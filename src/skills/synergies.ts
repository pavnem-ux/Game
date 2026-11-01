import type { CharacterClass } from '../character-stats';
import { sameInstant } from '../simulation-boundary';
import type { EffectType } from '../status-effects';
import type { Point } from '../weapon-attacks';
import { getSkill } from './catalog';
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
/** Two distinct skill IDs; order is presentation only (the workbook's «Навык 1» / «Навык 2»). */
export type SynergyPair = readonly [string, string];
const pairs = (list: readonly (readonly [string, string])[]): readonly SynergyPair[] =>
  Object.freeze(list.map((pair) => Object.freeze([pair[0], pair[1]] as const)));
export interface SynergyRule {
  readonly id: SynergyId;
  readonly name: string;
  readonly characterClass: CharacterClass;
  readonly trigger: 'hit' | 'kill';
  /**
   * Task 07.2 v2 unlock: an OR of explicit two-skill pairs. A pair counts once both distinct skill
   * IDs are acquired in this run (rank I+). Source: workbook sheet «Пары синергий» (40 rows).
   */
  readonly unlockPairs: readonly SynergyPair[];
  readonly description: string;
  /** Player-facing combat condition (display only; the resolver below is authoritative). */
  readonly condition: string;
  /** Player-facing outcome (display only). */
  readonly effect: string;
}
/** Display/catalogue data. Conditions are evaluated from tags, statuses and events below. */
export const SYNERGY_RULES: readonly SynergyRule[] = Object.freeze([
  {
    id: 'thermal_shock',
    unlockPairs: pairs([
      ['fireball', 'frost_nova'],
      ['fireball', 'ice_shards'],
      ['flame_burst', 'blizzard'],
      ['inferno', 'frost_nova'],
    ]),
    name: 'Термошок',
    characterClass: 'mage',
    trigger: 'hit',
    condition: 'Прямой ледяной удар по врагу, который горит (Burn).',
    effect: 'Дополнительный магический взрыв по цели.',
    description: 'Прямой удар льдом по цели с Burn — магический взрыв.',
  },
  {
    id: 'wildfire',
    unlockPairs: pairs([
      ['fireball', 'flame_burst'],
      ['fireball', 'inferno'],
      ['flame_burst', 'inferno'],
      ['inferno', 'elemental_mastery'],
    ]),
    name: 'Лесной пожар',
    characterClass: 'mage',
    trigger: 'kill',
    condition: 'Враг погибает, пока на нём горит Burn.',
    effect: 'Burn переходит на ближайших врагов.',
    description: 'Смерть цели с Burn распространяет Burn на соседей.',
  },
  {
    id: 'shattered_ice',
    unlockPairs: pairs([
      ['frost_nova', 'ice_shards'],
      ['frost_nova', 'blizzard'],
      ['ice_shards', 'blizzard'],
      ['blizzard', 'elemental_mastery'],
    ]),
    name: 'Расколотый лёд',
    characterClass: 'mage',
    trigger: 'hit',
    condition: 'Прямой ледяной удар по замедленному врагу (Slow).',
    effect: 'Бонусный ледяной урон по цели.',
    description: 'Прямой удар льдом по замедленной цели — бонусный ледяной урон.',
  },
  {
    id: 'skull_crusher',
    unlockPairs: pairs([
      ['shield_bash', 'cleave'],
      ['shield_bash', 'whirlwind'],
      ['ground_slam', 'cleave'],
    ]),
    name: 'Сокрушитель черепов',
    characterClass: 'warrior',
    trigger: 'hit',
    condition: 'Физический удар ближнего боя по оглушённому врагу (Stun).',
    effect: 'Дополнительный физический урон.',
    description: 'Физический удар ближнего боя по оглушённой цели — доп. урон.',
  },
  {
    id: 'battle_momentum',
    unlockPairs: pairs([
      ['whirlwind', 'battle_fury'],
      ['cleave', 'battle_fury'],
      ['ground_slam', 'battle_fury'],
      ['war_cry', 'battle_fury'],
    ]),
    name: 'Боевой напор',
    characterClass: 'warrior',
    trigger: 'kill',
    condition: 'Убийство врага ударом ближнего боя.',
    effect: 'Кратковременный бонус к скорости атаки.',
    description: 'Убийство в ближнем бою — краткий бонус скорости атаки.',
  },
  {
    id: 'seismic_impact',
    unlockPairs: pairs([
      ['ground_slam', 'earthquake'],
      ['shield_bash', 'earthquake'],
      ['ground_slam', 'shield_bash'],
    ]),
    name: 'Сейсмический удар',
    characterClass: 'warrior',
    trigger: 'hit',
    condition: 'Тяжёлый удар ближнего боя по уже оглушённому врагу.',
    effect: 'Ударная волна вокруг цели.',
    description: 'Тяжёлый удар по оглушённой цели — ударная волна.',
  },
  {
    id: 'toxic_barrage',
    unlockPairs: pairs([
      ['toxic_volley', 'multishot'],
      ['toxic_volley', 'split_shot'],
      ['poison_trap', 'split_shot'],
    ]),
    name: 'Токсичный шквал',
    characterClass: 'archer',
    trigger: 'hit',
    condition:
      'Несколько разных снарядов попадают в отравленного врага (Poison) за короткое время.',
    effect: 'Ядовитый взрыв и дополнительный Poison.',
    description:
      'Несколько разных снарядов по отравленной цели за короткое время — ядовитый взрыв.',
  },
  {
    id: 'plague_chain',
    unlockPairs: pairs([
      ['toxic_volley', 'poison_trap'],
      ['toxic_volley', 'split_shot'],
      ['poison_trap', 'arrow_rain'],
    ]),
    name: 'Цепь чумы',
    characterClass: 'archer',
    trigger: 'kill',
    condition: 'Враг погибает, будучи отравленным (Poison).',
    effect: 'Poison переходит на ближайших врагов.',
    description: 'Смерть отравленной цели распространяет Poison.',
  },
  {
    id: 'deadly_precision',
    unlockPairs: pairs([
      ['piercing_arrow', 'hunters_mark'],
      ['split_shot', 'hunters_mark'],
      ['toxic_volley', 'hunters_mark'],
    ]),
    name: 'Смертельная точность',
    characterClass: 'archer',
    trigger: 'hit',
    condition: 'Серия прямых попаданий подряд по одному отравленному врагу.',
    effect: 'Временный бонус урона по этой цели.',
    description: 'Серия прямых попаданий по одной отравленной цели — бонус урона по ней.',
  },
  {
    id: 'blood_frenzy',
    unlockPairs: pairs([
      ['lacerate', 'blade_flurry'],
      ['blood_blades', 'blade_flurry'],
      ['fan_of_knives', 'serrated_blades'],
    ]),
    name: 'Кровавое безумие',
    characterClass: 'rogue',
    trigger: 'hit',
    condition: 'Удар кинжалом по кровоточащему врагу (Bleed).',
    effect: 'Кратковременный бонус к скорости атаки.',
    description: 'Удар кинжалом по кровоточащей цели — бонус скорости атаки.',
  },
  {
    id: 'deep_wounds',
    unlockPairs: pairs([
      ['blood_blades', 'serrated_blades'],
      ['lacerate', 'serrated_blades'],
      ['blood_blades', 'blade_flurry'],
    ]),
    name: 'Глубокие раны',
    characterClass: 'rogue',
    trigger: 'hit',
    condition: 'Критический удар по кровоточащему врагу.',
    effect: 'Дополнительный стак Bleed.',
    description: 'Крит по кровоточащей цели — дополнительный стак Bleed.',
  },
  {
    id: 'final_cut',
    unlockPairs: pairs([
      ['lacerate', 'death_mark'],
      ['blood_blades', 'death_mark'],
      ['blade_flurry', 'death_mark'],
    ]),
    name: 'Последний разрез',
    characterClass: 'rogue',
    trigger: 'hit',
    condition: 'Удар по кровоточащему врагу с низким запасом здоровья.',
    effect: 'Добивающий урон.',
    description: 'Удар по кровоточащей цели с низким HP — добивающий урон.',
  },
] satisfies SynergyRule[]);

const RULES_BY_ID = new Map(SYNERGY_RULES.map((rule) => [rule.id, rule]));

/** True once both skills of the pair are acquired (any rank ≥ I; upgrades never remove ownership). */
export function pairComplete(pair: SynergyPair, owned: ReadonlySet<string>): boolean {
  return owned.has(pair[0]) && owned.has(pair[1]);
}
/** Completed unlock pairs of a rule for the acquired skill IDs, in workbook order. */
export function completedPairs(
  rule: Pick<SynergyRule, 'unlockPairs'>,
  ownedIds: Iterable<string>,
): readonly SynergyPair[] {
  const owned = ownedIds instanceof Set ? (ownedIds as ReadonlySet<string>) : new Set(ownedIds);
  return rule.unlockPairs.filter((pair) => pairComplete(pair, owned));
}
/**
 * The single unlock check, shared by combat (SynergyResolver), the Skills overview, level-up card
 * hints and QA diagnostics: at least one allowed pair is fully acquired.
 */
export function synergyUnlocked(
  rule: Pick<SynergyRule, 'unlockPairs'>,
  ownedIds: Iterable<string>,
): boolean {
  return completedPairs(rule, ownedIds).length > 0;
}

/**
 * Startup validation of the pair configuration: exactly 12 rules, 3 per class; every pair has two
 * distinct existing skills legal for that class (class skill or universal), at least one active;
 * no duplicate order-insensitive pair inside a rule; every rule has a pair. Throws on violation.
 */
export function validateSynergyRules(
  rules: readonly Pick<SynergyRule, 'id' | 'characterClass' | 'unlockPairs'>[],
  lookup: (skillId: string) => { readonly owner: string; readonly kind: 'auto' | 'passive' },
): void {
  if (rules.length !== 12) throw new Error(`Expected 12 synergies, found ${rules.length}.`);
  const ids = new Set(rules.map((rule) => rule.id));
  if (ids.size !== rules.length) throw new Error('Duplicate synergy ID.');
  const perClass = new Map<string, number>();
  for (const rule of rules) {
    perClass.set(rule.characterClass, (perClass.get(rule.characterClass) ?? 0) + 1);
    if (rule.unlockPairs.length === 0) throw new Error(`Synergy ${rule.id} has no unlock pair.`);
    const seen = new Set<string>();
    for (const pair of rule.unlockPairs) {
      if (pair.length !== 2 || pair[0] === pair[1])
        throw new Error(`Synergy ${rule.id} needs two distinct skills per pair.`);
      const kinds = pair.map((skillId) => {
        const skill = lookup(skillId);
        if (skill.owner !== rule.characterClass && skill.owner !== 'universal')
          throw new Error(`Skill ${skillId} is not available to ${rule.characterClass}.`);
        return skill.kind;
      });
      if (!kinds.includes('auto'))
        throw new Error(`Synergy ${rule.id} pair ${pair.join('+')} has no active skill.`);
      const key = [...pair].sort().join('+');
      if (seen.has(key)) throw new Error(`Synergy ${rule.id} repeats pair ${key}.`);
      seen.add(key);
    }
  }
  for (const [cls, n] of perClass)
    if (n !== 3) throw new Error(`Class ${cls} must have exactly 3 synergies, found ${n}.`);
}
validateSynergyRules(SYNERGY_RULES, getSkill);

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
  private unlockedCache: { version: number; ids: ReadonlySet<SynergyId> } | null = null;
  /**
   * Unlocked rules of the current class. Ownership only grows within a run (choices are permanent),
   * so the owned-skill count is a sufficient cache version.
   */
  unlockedIds(): ReadonlySet<SynergyId> {
    const owned = this.e.run.ownedIds();
    if (this.unlockedCache?.version === owned.length) return this.unlockedCache.ids;
    const set = new Set(owned);
    const ids = new Set(
      SYNERGY_RULES.filter(
        (rule) => rule.characterClass === this.cls && synergyUnlocked(rule, set),
      ).map((rule) => rule.id),
    );
    this.unlockedCache = { version: owned.length, ids };
    return ids;
  }
  /** Pure ownership/class check shared with read-only QA diagnostics. */
  isEligible(id: SynergyId): boolean {
    return this.unlockedIds().has(id);
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
          this.isEligible('thermal_shock') &&
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
          this.isEligible('shattered_ice') &&
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
          this.isEligible('skull_crusher') &&
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
          this.isEligible('seismic_impact') &&
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
          this.isEligible('toxic_barrage') &&
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
        if (this.isEligible('deadly_precision')) {
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
        if (this.isEligible('blood_frenzy') && tags.has('dagger')) {
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
          this.isEligible('deep_wounds') &&
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
        if (this.isEligible('final_cut') && alive()) {
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
    if (this.isEligible('wildfire') && pre.effects.has('burn') && pre.position) {
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
    if (this.isEligible('plague_chain') && pre.effects.has('poison') && pre.position) {
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
    if (this.isEligible('battle_momentum') && cause.direct && cause.tags.has('melee')) {
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
