import { calculateSuccessfulDamage } from '../combat-core';
import type { CombatCore, CombatEvent, PeriodicDamageRequest, RandomSource } from '../combat-core';
import { EFFECT_TYPES, STATUS_RULES } from './config';
import type { StatusGroup } from './groups';
import { snapshot } from './groups';
import type {
  ApplicationResult,
  EffectApplication,
  EffectType,
  StatusEffectsOptions,
  StatusEvent,
  StatusGroupSnapshot,
  StatusRemovedEvent,
  StatusStack,
  StatusUpdateOptions,
} from './types';
import {
  booleanResult,
  effectType,
  finite,
  id,
  nonNegative,
  roll,
  sameTime,
  validateApplication,
} from './validation';
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
interface DueEvent {
  group: StatusGroup;
  at: number;
  kind: 'tick' | 'expire';
}
export class StatusEffects {
  private readonly groups = new Map<string, Map<EffectType, StatusGroup>>();
  private readonly random: RandomSource;
  private readonly options: StatusEffectsOptions;
  private clock = 0;
  private sequence = 0;
  private groupSequence = 0;
  constructor(
    private readonly core: CombatCore,
    options: StatusEffectsOptions = {},
  ) {
    if (!options || typeof options !== 'object')
      throw new TypeError('Status options must be an object.');
    for (const key of ['random', 'canApply', 'canDamage'] as const)
      if (options[key] !== undefined && typeof options[key] !== 'function')
        throw new TypeError(`${key} must be a function.`);
    this.random = options.random ?? Math.random;
    this.options = Object.freeze({ ...options });
  }
  get time() {
    return this.clock;
  }
  isAlive(entityId: string): boolean {
    return this.core.getEntity(entityId).alive;
  }

  /** A batch is all-or-nothing for status state; injected functions must be pure. */
  applyBatch(inputs: readonly EffectApplication[]): readonly ApplicationResult[] {
    if (!Array.isArray(inputs)) throw new TypeError('applications must be an array.');
    const applications = inputs.map(validateApplication);
    for (const application of applications) {
      this.core.getEntity(application.sourceId);
      this.core.getEntity(application.targetId);
    }
    const targets = new Set(applications.map((application) => application.targetId));
    const saved = new Map(
      [...targets].map((target) => [
        target,
        this.groups.has(target) ? new Map(this.groups.get(target)!) : null,
      ]),
    );
    const sequence = this.sequence,
      groupSequence = this.groupSequence;
    try {
      return Object.freeze(applications.map((application) => this.apply(application)));
    } catch (error) {
      for (const [target, groups] of saved) {
        if (groups) this.groups.set(target, groups);
        else this.groups.delete(target);
      }
      this.sequence = sequence;
      this.groupSequence = groupSequence;
      throw error;
    }
  }

  /** Timestamped on-hit integrations must deliver events at this same simulation instant. */
  assertTime(time: number): void {
    nonNegative(time, 'event.time');
    if (!sameTime(time, this.clock))
      throw new RangeError(
        'Impact time must match StatusEffects.time; deliver hits chronologically at their simulation instant.',
      );
  }
  getGroup(targetId: string, type: EffectType): StatusGroupSnapshot | null {
    id(targetId, 'targetId');
    effectType(type);
    this.core.getEntity(targetId);
    const group = this.groups.get(targetId)?.get(type);
    return group ? snapshot(group) : null;
  }
  getGroups(targetId?: string): readonly StatusGroupSnapshot[] {
    if (targetId !== undefined) {
      id(targetId, 'targetId');
      this.core.getEntity(targetId);
    }
    return Object.freeze(
      this.orderedGroups()
        .filter((g) => targetId === undefined || g.targetId === targetId)
        .map(snapshot),
    );
  }
  apply(input: EffectApplication): ApplicationResult {
    const application = validateApplication(input);
    const target = this.core.getEntity(application.targetId);
    this.core.getEntity(application.sourceId);
    const expiresAt = this.clock + application.duration;
    finite(expiresAt, 'expiration time');
    if (expiresAt <= this.clock)
      throw new RangeError('Application duration is not representable at this time.');
    const firstTick = this.clock + STATUS_RULES.tickInterval;
    if (!Number.isFinite(firstTick) || firstTick <= this.clock)
      throw new RangeError('Tick time is not representable.');
    const group = this.groups.get(target.id)?.get(application.effectType);
    if (!target.alive) return this.result('inactive', null, null, this.removeTarget(target.id));
    const prospective =
      group?.stacks.slice(group.stacks.length >= STATUS_RULES.maxStacks ? 1 : 0) ?? [];
    const aggregate = prospective.reduce(
      (sum, stack) => sum + stack.rawDamagePerTick,
      application.rawDamagePerTick,
    );
    nonNegative(aggregate, 'aggregate raw damage');
    calculateSuccessfulDamage(aggregate, target.resistance);
    if (!Number.isSafeInteger(this.sequence + 1) || !Number.isSafeInteger(this.groupSequence + 1))
      throw new RangeError('Status sequence exhausted.');
    if (
      this.options.canApply &&
      !booleanResult(
        this.options.canApply(Object.freeze({ application, time: this.clock })),
        'canApply',
      )
    )
      return this.result('blocked', null, group ? snapshot(group) : null, []);
    if (!roll(application.probabilityPercent, this.random))
      return this.result('failed-roll', null, group ? snapshot(group) : null, []);
    const sequence = this.sequence + 1;
    const stack: StatusStack = Object.freeze({
      id: `status-stack-${sequence}`,
      effectType: application.effectType,
      sourceId: application.sourceId,
      ...(application.originId === undefined ? {} : { originId: application.originId }),
      rawDamagePerTick: application.rawDamagePerTick,
      sequence,
    });
    const replacedStackId =
      group && group.stacks.length >= STATUS_RULES.maxStacks ? group.stacks[0].id : undefined;
    const next: StatusGroup = group
      ? {
          ...group,
          expiresAt: Math.max(group.expiresAt, expiresAt),
          stacks: [...prospective, stack],
        }
      : {
          id: `status-group-${this.groupSequence + 1}`,
          targetId: target.id,
          effectType: application.effectType,
          createdAt: this.clock,
          expiresAt,
          nextTickAt: firstTick,
          tickIndex: 1,
          stacks: [stack],
        };
    let owned = this.groups.get(target.id);
    if (!owned) {
      owned = new Map();
      this.groups.set(target.id, owned);
    }
    owned.set(application.effectType, next);
    this.sequence = sequence;
    if (!group) this.groupSequence++;
    const view = snapshot(next);
    return this.result('applied', stack, view, [
      {
        type: 'status-applied',
        time: this.clock,
        group: view,
        stack,
        ...(replacedStackId === undefined ? {} : { replacedStackId }),
      },
    ]);
  }
  /** Forward direct or periodic Core deaths; validate the whole batch before cleanup. */
  validateCombatEvents(input: readonly CombatEvent[]): readonly string[] {
    if (!Array.isArray(input)) throw new TypeError('combat events must be an array.');
    const deaths = new Set<string>();
    for (const event of input) {
      if (
        !event ||
        typeof event !== 'object' ||
        !['damage', 'dodge', 'death', 'healing', 'max-hp-changed', 'periodic-damage'].includes(
          event.type,
        )
      )
        throw new TypeError('Invalid CombatEvent.');
      if (event.type === 'death') {
        id(event.entityId, 'death.entityId');
        if (this.core.getEntity(event.entityId).alive)
          throw new Error('Death event must refer to an authoritatively dead entity.');
        deaths.add(event.entityId);
      }
    }
    return Object.freeze([...deaths].sort(compare));
  }
  consumeCombatEvents(input: readonly CombatEvent[]): readonly StatusRemovedEvent[] {
    const deaths = this.validateCombatEvents(input);
    const output = deaths.flatMap((targetId) => this.removeTarget(targetId));
    this.pruneDead(output);
    return Object.freeze(output);
  }
  update(deltaSeconds: number, options: StatusUpdateOptions = {}): readonly StatusEvent[] {
    nonNegative(deltaSeconds, 'deltaSeconds');
    if (
      !options ||
      typeof options !== 'object' ||
      (options.paused !== undefined && typeof options.paused !== 'boolean')
    )
      throw new TypeError('paused must be boolean.');
    const end = options.paused ? this.clock : this.clock + deltaSeconds;
    finite(end, 'simulation time');
    const output: StatusEvent[] = [];
    this.pruneDead(output);
    if (options.paused) return Object.freeze(output);
    for (;;) {
      const event = this.nextEvent(end);
      if (!event) {
        this.clock = end;
        break;
      }
      const group = event.group;
      // Recheck authoritative liveness even if nobody forwarded a direct death event.
      if (!this.core.getEntity(group.targetId).alive) {
        output.push(...this.removeTarget(group.targetId));
        continue;
      }
      if (event.kind === 'expire') {
        this.clock = event.at;
        output.push(this.removeGroup(group, 'expired'));
        continue;
      }
      const rawDamage = group.stacks.reduce((sum, stack) => sum + stack.rawDamagePerTick, 0);
      const view = snapshot(group);
      const allowed = this.options.canDamage
        ? booleanResult(
            this.options.canDamage(Object.freeze({ group: view, rawDamage, time: event.at })),
            'canDamage',
          )
        : true;
      const request = this.periodicRequest(group, rawDamage);
      // Core validates/calculates before HP mutation; do not advance our schedule on failure.
      const result = allowed ? this.core.applyPeriodicDamage(request) : null;
      this.clock = event.at;
      group.tickIndex++;
      group.nextTickAt = group.createdAt + group.tickIndex * STATUS_RULES.tickInterval;
      output.push(
        Object.freeze({
          type: 'status-tick',
          time: this.clock,
          group: view,
          rawDamage,
          outcome: allowed ? 'resolved' : 'blocked',
          result,
        }),
      );
      if (result) output.push(...this.consumeCombatEvents(result.events));
    }
    return Object.freeze(output);
  }
  advanceTo(time: number, options: StatusUpdateOptions = {}): readonly StatusEvent[] {
    nonNegative(time, 'simulation time');
    if (time < this.clock && !sameTime(time, this.clock))
      throw new RangeError('Cannot move simulation time backwards.');
    return this.update(Math.max(0, time - this.clock), options);
  }
  private periodicRequest(group: StatusGroup, rawDamage: number): PeriodicDamageRequest {
    return {
      operationId: `${group.id}:tick-${group.tickIndex}`,
      targetId: group.targetId,
      effectId: group.effectType,
      rawDamage,
      sources: group.stacks.map((stack) => ({
        applicationId: stack.id,
        sourceId: stack.sourceId,
        ...(stack.originId === undefined ? {} : { originId: stack.originId }),
        rawDamage: stack.rawDamagePerTick,
      })),
    };
  }
  private result(
    status: ApplicationResult['status'],
    stack: StatusStack | null,
    group: StatusGroupSnapshot | null,
    events: StatusEvent[],
  ): ApplicationResult {
    return Object.freeze({
      status,
      stack,
      group,
      events: Object.freeze(events.map((event) => Object.freeze(event))),
    });
  }
  private orderedGroups(): StatusGroup[] {
    return [...this.groups.entries()]
      .sort(([a], [b]) => compare(a, b))
      .flatMap(([, owned]) =>
        EFFECT_TYPES.flatMap((type) => {
          const g = owned.get(type);
          return g ? [g] : [];
        }),
      );
  }
  private nextEvent(end: number): DueEvent | null {
    let next: DueEvent | null = null;
    for (const group of this.orderedGroups()) {
      const tick =
        group.nextTickAt < group.expiresAt || sameTime(group.nextTickAt, group.expiresAt);
      const at = tick ? group.nextTickAt : group.expiresAt;
      if (at > end && !sameTime(at, end)) continue;
      const candidate: DueEvent = {
        group,
        at: Math.max(this.clock, Math.min(at, end)),
        kind: tick ? 'tick' : 'expire',
      };
      // orderedGroups already provides stable target/effect ties; ticks precede all expirations.
      if (
        !next ||
        candidate.at < next.at ||
        (candidate.at === next.at && candidate.kind === 'tick' && next.kind === 'expire')
      )
        next = candidate;
    }
    return next;
  }
  private removeGroup(
    group: StatusGroup,
    reason: StatusRemovedEvent['reason'],
  ): StatusRemovedEvent {
    const event: StatusRemovedEvent = Object.freeze({
      type: 'status-removed',
      time: this.clock,
      group: snapshot(group),
      reason,
    });
    const owned = this.groups.get(group.targetId);
    owned?.delete(group.effectType);
    if (owned?.size === 0) this.groups.delete(group.targetId);
    return event;
  }
  private removeTarget(targetId: string): StatusRemovedEvent[] {
    const owned = this.groups.get(targetId);
    return owned
      ? EFFECT_TYPES.flatMap((type) => {
          const group = owned.get(type);
          return group ? [this.removeGroup(group, 'target-dead')] : [];
        })
      : [];
  }
  private pruneDead(output: StatusEvent[]) {
    for (const targetId of [...this.groups.keys()].sort(compare))
      if (!this.core.getEntity(targetId).alive) output.push(...this.removeTarget(targetId));
  }
}
