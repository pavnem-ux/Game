import type { CharacterClass } from '../character-stats';
import { SKILL_CATALOG, skillsForClass } from './catalog';
import { SKILL_RULES } from './config';
import {
  bonusCards,
  cardKey,
  eligiblePools,
  pickSkills,
  rerollIsMeaningful,
  rerollSkills,
  skillCard,
} from './offers';
import type { Random } from './offers';
import type {
  BonusRewardId,
  ChoiceResult,
  LevelUpOffer,
  OfferCard,
  RunSkillsSnapshot,
  SkillDefinition,
  SkillEvent,
} from './types';

/**
 * Run-local skill ownership and the level-up queue. Framework-independent; no timers, no rendering.
 * Owned skills are permanent for the run: there is no removal, replacement or respec operation.
 */
export class RunSkills {
  private readonly pool: readonly SkillDefinition[];
  private readonly ranks = new Map<string, number>();
  private rerolls: number = SKILL_RULES.rerollsPerRun;
  private pending = 0;
  private offer: LevelUpOffer | null = null;
  private offerSequence = 0;
  private gold = 0;
  private readonly bonuses: Record<BonusRewardId, number> = { recovery: 0, barrier: 0, gold: 0 };
  constructor(
    readonly characterClass: CharacterClass,
    private readonly random: Random,
    catalog: readonly SkillDefinition[] = SKILL_CATALOG,
  ) {
    if (typeof random !== 'function') throw new TypeError('random must be a function.');
    this.pool = Object.freeze(skillsForClass(characterClass, catalog));
  }
  rank(skillId: string): number {
    return this.ranks.get(skillId) ?? 0;
  }
  /** Owned skill IDs in acquisition order. */
  ownedIds(): readonly string[] {
    return Object.freeze([...this.ranks.keys()]);
  }
  definition(skillId: string): SkillDefinition {
    const d = this.pool.find((s) => s.id === skillId);
    if (!d) throw new Error(`Skill ${skillId} is not available to ${this.characterClass}.`);
    return d;
  }
  get pendingChoices() {
    return this.pending;
  }
  get currentOffer() {
    return this.offer;
  }
  /** Queue one choice per gained level; the first offer is generated immediately. */
  queueLevelUps(levels: number): SkillEvent[] {
    if (!Number.isSafeInteger(levels) || levels < 0) throw new RangeError('Invalid level count.');
    if (levels === 0) return [];
    this.pending += levels;
    return this.offer ? [] : this.generate(false, new Set());
  }
  reroll(): SkillEvent[] {
    const offer = this.offer;
    if (!offer) throw new Error('No level-up offer to reroll.');
    if (!offer.rerollAvailable) throw new Error('Reroll is not available for this offer.');
    this.rerolls--;
    return this.generate(true, new Set(offer.cards.map(cardKey)));
  }
  /** Choose exactly one card of the current offer. */
  choose(key: string): { result: ChoiceResult; events: SkillEvent[] } {
    const offer = this.offer;
    if (!offer) throw new Error('No level-up offer is pending.');
    const card = offer.cards.find((c) => cardKey(c) === key);
    if (!card) throw new Error('Card is not part of the current offer.');
    let result: ChoiceResult;
    const events: SkillEvent[] = [];
    if (card.kind === 'skill') {
      const d = this.definition(card.skillId);
      const current = this.rank(d.id);
      // Re-validate: an offer card must still be legal at the moment of choice.
      if (current !== card.currentRank || current >= SKILL_RULES.maxRank)
        throw new Error('Stale skill card.');
      if (current === 0) {
        const used = this.slotUsage();
        if (
          d.kind === 'auto'
            ? used.auto >= SKILL_RULES.autoSlots
            : used.passive >= SKILL_RULES.passiveSlots
        )
          throw new Error('No free slot for this skill.');
      }
      this.ranks.set(d.id, current + 1);
      result = { type: 'skill', skillId: d.id, rank: current + 1 };
      events.push(Object.freeze({ type: 'skill-chosen', skillId: d.id, rank: current + 1 }));
    } else {
      this.bonuses[card.bonusId]++;
      result = { type: 'bonus', bonusId: card.bonusId };
    }
    this.pending--;
    this.offer = null;
    if (this.pending > 0) events.push(...this.generate(false, new Set()));
    return { result: Object.freeze(result), events };
  }
  /** DEV/tests only: set a skill rank directly while still enforcing class, slot and rank limits. */
  grantForTesting(skillId: string, rank: number): ChoiceResult {
    const d = this.definition(skillId);
    if (!Number.isInteger(rank) || rank < 1 || rank > SKILL_RULES.maxRank)
      throw new RangeError('Rank must be 1–5.');
    if (rank < this.rank(skillId)) throw new Error('Skill ranks never decrease during a run.');
    if (this.rank(skillId) === 0) {
      const used = this.slotUsage();
      if (
        d.kind === 'auto'
          ? used.auto >= SKILL_RULES.autoSlots
          : used.passive >= SKILL_RULES.passiveSlots
      )
        throw new Error('No free slot for this skill.');
    }
    this.ranks.set(skillId, rank);
    if (this.offer) this.offer = null;
    if (this.pending > 0) this.generate(false, new Set());
    return Object.freeze({ type: 'skill', skillId, rank });
  }
  addGold(amount: number): void {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Invalid gold amount.');
    this.gold += amount;
  }
  /** Run end: drop any unresolved choices; nothing carries into a new run. */
  clearPending(): void {
    this.pending = 0;
    this.offer = null;
  }
  getState(): RunSkillsSnapshot {
    const used = this.slotUsage();
    return Object.freeze({
      owned: Object.freeze(
        [...this.ranks].map(([skillId, rank]) => {
          const d = this.definition(skillId);
          return Object.freeze({ skillId, name: d.name, icon: d.icon, kind: d.kind, rank });
        }),
      ),
      slots: Object.freeze({
        auto: Object.freeze({ used: used.auto, max: SKILL_RULES.autoSlots }),
        passive: Object.freeze({ used: used.passive, max: SKILL_RULES.passiveSlots }),
      }),
      rerolls: this.rerolls,
      pendingChoices: this.pending,
      offer: this.offer,
      gold: this.gold,
      bonusesClaimed: Object.freeze({ ...this.bonuses }),
    });
  }
  private slotUsage() {
    let auto = 0,
      passive = 0;
    for (const id of this.ranks.keys())
      if (this.definition(id).kind === 'auto') auto++;
      else passive++;
    return { auto, passive };
  }
  private pools() {
    const used = this.slotUsage();
    return eligiblePools(this.pool, {
      ranks: this.ranks,
      autoUsed: used.auto,
      passiveUsed: used.passive,
    });
  }
  private generate(reroll: boolean, rejected: ReadonlySet<string>): SkillEvent[] {
    const pools = this.pools();
    const events: SkillEvent[] = [];
    let cards: OfferCard[];
    let mode: LevelUpOffer['mode'] = 'skills';
    if (pools.fresh.length + pools.upgrades.length === 0) {
      mode = 'bonus';
      cards = [...bonusCards()];
      const used = this.slotUsage();
      const exhausted =
        used.auto === SKILL_RULES.autoSlots &&
        used.passive === SKILL_RULES.passiveSlots &&
        [...this.ranks.values()].every((r) => r === SKILL_RULES.maxRank);
      if (!exhausted)
        events.push(
          Object.freeze({
            type: 'skill-pool-warning',
            message: 'No eligible skills before pool exhaustion; showing fallback rewards.',
          }),
        );
    } else {
      const picked = reroll
        ? rerollSkills(pools, rejected, this.random)
        : pickSkills(pools, this.random);
      cards = picked.map((d) => skillCard(d, this.rank(d.id)));
    }
    this.offer = Object.freeze({
      id: ++this.offerSequence,
      mode,
      cards: Object.freeze(cards),
      rerollAvailable: mode === 'skills' && this.rerolls > 0 && rerollIsMeaningful(pools),
    });
    events.push(
      Object.freeze({
        type: 'skill-offer',
        offerId: this.offer.id,
        mode,
        cardIds: Object.freeze(cards.map(cardKey)),
        reroll,
      }),
    );
    return events;
  }
}
