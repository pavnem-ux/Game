import type { CharacterClass } from '../character-stats';
import { SKILL_CATALOG, skillsForClass } from './catalog';
import { SKILL_RULES } from './config';
import {
  bonusCards,
  cardKey,
  eligiblePools,
  pickSkills,
  replacementCard,
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
  /** Task 14: banishes left, skills removed from the run pool, offers skipped. */
  private banishesLeft: number = SKILL_RULES.banishesPerRun;
  private readonly banished = new Set<string>();
  private skipped = 0;
  private pending = 0;
  private offer: LevelUpOffer | null = null;
  private offerSequence = 0;
  private gold = 0;
  private readonly bonuses: Record<BonusRewardId, number> = { recovery: 0, barrier: 0, gold: 0 };
  /** Task 09.1 C1: extra automatic slots (Mage superpower) and the enhanced 5th-slot skill. */
  private extraAuto = 0;
  private enhanced: string | null = null;
  private enhancedChoice: readonly string[] | null = null;
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
  /** Automatic-slot maximum for this run (4, or 5 with the Mage superpower). */
  get autoSlots(): number {
    return SKILL_RULES.autoSlots + this.extraAuto;
  }
  get enhancedSkillId(): string | null {
    return this.enhanced;
  }
  /** The five actives to choose the enhanced skill from (null = no choice pending). */
  get pendingEnhancedChoice(): readonly string[] | null {
    return this.enhancedChoice;
  }
  /**
   * Task 09.1 C1: one extra real automatic slot (total 5) from the existing pool. Set once at
   * run start, before any skill is acquired.
   */
  enableExtraAutoSlot(): void {
    if (this.ranks.size > 0) throw new Error('Slots are fixed once the run has skills.');
    this.extraAuto = 1;
  }
  /** C1 variant B: the one-time choice of which of the five actives is enhanced. */
  chooseEnhanced(skillId: string): SkillEvent[] {
    const choice = this.enhancedChoice;
    if (!choice) throw new Error('No enhanced-skill choice is pending.');
    if (!choice.includes(skillId)) throw new Error('Not one of the five active skills.');
    this.enhanced = skillId;
    this.enhancedChoice = null;
    return [Object.freeze({ type: 'enhanced-skill', skillId, reason: 'chosen' })];
  }
  /** The 5th distinct active fills the extra slot: it is enhanced by default, choice offered. */
  private acquired(d: SkillDefinition): SkillEvent[] {
    if (d.kind !== 'auto' || this.extraAuto === 0 || this.enhanced !== null) return [];
    const autos = [...this.ranks.keys()].filter((id) => this.definition(id).kind === 'auto');
    if (autos.length !== this.autoSlots) return [];
    this.enhanced = d.id;
    this.enhancedChoice = Object.freeze(autos);
    return [Object.freeze({ type: 'enhanced-skill', skillId: d.id, reason: 'default' })];
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
  /**
   * Task 14: why a card cannot be banished now (null = it can): no offer / not a skill card,
   * no banishes left, or it is an owned skill's upgrade and the last eligible card.
   */
  banishBlockReason(key: string): 'no-offer' | 'not-skill' | 'none-left' | 'last-upgrade' | null {
    const offer = this.offer;
    if (!offer || offer.mode !== 'skills') return 'no-offer';
    const card = offer.cards.find((c) => cardKey(c) === key);
    if (!card || card.kind !== 'skill') return 'not-skill';
    if (this.banishesLeft <= 0) return 'none-left';
    const pools = this.pools();
    if (!card.isNew && pools.fresh.length + pools.upgrades.length <= 1) return 'last-upgrade';
    return null;
  }
  /**
   * Task 14 «Изгнать»: removes the card's skill from the pool for the rest of the run and replaces
   * only that card (seeded, reroll preference for its slot). The offer id stays the same.
   */
  banish(key: string): SkillEvent[] {
    const reason = this.banishBlockReason(key);
    if (reason) throw new Error(`Cannot banish: ${reason}.`);
    const offer = this.offer!;
    const card = offer.cards.find((c) => cardKey(c) === key)! as Extract<
      OfferCard,
      { kind: 'skill' }
    >;
    this.banishesLeft--;
    this.banished.add(card.skillId);
    const keep = new Set(offer.cards.map(cardKey).filter((k) => k !== key));
    const pools = this.pools();
    const replacement = replacementCard(pools, keep, card.isNew, this.random);
    const cards = offer.cards.flatMap((c) =>
      cardKey(c) !== key
        ? [c]
        : replacement
          ? [skillCard(replacement, this.rank(replacement.id))]
          : [],
    );
    if (cards.length === 0) {
      // Nothing eligible is left: the offer becomes the bonus fallback (as at pool exhaustion).
      this.offer = null;
      return [
        Object.freeze({
          type: 'skill-banished',
          offerId: offer.id,
          skillId: card.skillId,
          replacement: null,
        }),
        ...this.generate(false, new Set()),
      ];
    }
    this.offer = Object.freeze({
      ...offer,
      cards: Object.freeze(cards),
      rerollAvailable: this.rerolls > 0 && rerollIsMeaningful(pools),
    });
    return [
      Object.freeze({
        type: 'skill-banished',
        offerId: offer.id,
        skillId: card.skillId,
        replacement: replacement?.id ?? null,
      }),
    ];
  }
  /** Task 14 «Пропустить»: closes the current offer without a card (unlimited). */
  skip(): SkillEvent[] {
    const offer = this.offer;
    if (!offer) throw new Error('No level-up offer to skip.');
    this.skipped++;
    this.pending--;
    this.offer = null;
    const events: SkillEvent[] = [
      Object.freeze({ type: 'skill-offer-skipped', offerId: offer.id }),
    ];
    if (this.pending > 0) events.push(...this.generate(false, new Set()));
    return events;
  }
  /** DEV/QA: extra rerolls / banishes for this run. */
  grantChoiceControls(rerolls: number, banishes: number): void {
    for (const n of [rerolls, banishes])
      if (!Number.isSafeInteger(n) || n < 0 || n > 99) throw new RangeError('Invalid grant.');
    this.rerolls += rerolls;
    this.banishesLeft += banishes;
    if (this.offer && this.offer.mode === 'skills')
      this.offer = Object.freeze({
        ...this.offer,
        rerollAvailable: this.rerolls > 0 && rerollIsMeaningful(this.pools()),
      });
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
          d.kind === 'auto' ? used.auto >= this.autoSlots : used.passive >= SKILL_RULES.passiveSlots
        )
          throw new Error('No free slot for this skill.');
      }
      this.ranks.set(d.id, current + 1);
      result = { type: 'skill', skillId: d.id, rank: current + 1 };
      events.push(Object.freeze({ type: 'skill-chosen', skillId: d.id, rank: current + 1 }));
      if (current === 0) events.push(...this.acquired(d));
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
    return this.grantWithEvents(skillId, rank).result;
  }
  /** `grantForTesting` plus the acquisition events (enhanced-slot assignment). */
  grantWithEvents(skillId: string, rank: number): { result: ChoiceResult; events: SkillEvent[] } {
    const d = this.definition(skillId);
    if (!Number.isInteger(rank) || rank < 1 || rank > SKILL_RULES.maxRank)
      throw new RangeError('Rank must be 1–5.');
    if (rank < this.rank(skillId)) throw new Error('Skill ranks never decrease during a run.');
    if (this.rank(skillId) === 0) {
      const used = this.slotUsage();
      if (
        d.kind === 'auto' ? used.auto >= this.autoSlots : used.passive >= SKILL_RULES.passiveSlots
      )
        throw new Error('No free slot for this skill.');
    }
    const fresh = this.rank(skillId) === 0;
    this.ranks.set(skillId, rank);
    const events = fresh ? this.acquired(d) : [];
    if (this.offer) this.offer = null;
    if (this.pending > 0) this.generate(false, new Set());
    return { result: Object.freeze({ type: 'skill', skillId, rank }), events };
  }
  addGold(amount: number): void {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Invalid gold amount.');
    this.gold += amount;
  }
  /** Run end: drop any unresolved choices; nothing carries into a new run. */
  clearPending(): void {
    this.pending = 0;
    this.offer = null;
    this.enhancedChoice = null;
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
        auto: Object.freeze({ used: used.auto, max: this.autoSlots }),
        passive: Object.freeze({ used: used.passive, max: SKILL_RULES.passiveSlots }),
      }),
      rerolls: this.rerolls,
      banishes: this.banishesLeft,
      banished: Object.freeze([...this.banished]),
      skips: this.skipped,
      banishBlocked: Object.freeze(
        Object.fromEntries(
          (this.offer?.cards ?? []).map((c) => [cardKey(c), this.banishBlockReason(cardKey(c))]),
        ),
      ),
      pendingChoices: this.pending,
      offer: this.offer,
      gold: this.gold,
      bonusesClaimed: Object.freeze({ ...this.bonuses }),
      enhancedSkillId: this.enhanced,
      enhancedChoice: this.enhancedChoice,
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
    const pool = this.banished.size ? this.pool.filter((d) => !this.banished.has(d.id)) : this.pool;
    return eligiblePools(pool, {
      ranks: this.ranks,
      autoUsed: used.auto,
      passiveUsed: used.passive,
      autoMax: this.autoSlots,
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
        used.auto === this.autoSlots &&
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
