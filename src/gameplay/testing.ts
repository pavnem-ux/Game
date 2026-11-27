import type { GameplayWorld, GameplayOptions } from './index';
import { QaGameplayWorld } from './qa';
import type { QaSnapshot } from './qa';
import type { EnemyKind } from './enemy-types';
import type { BuffId, ChestContent, ChestType } from './chests';
import type { ActivityType } from './activities';
import type { SynergyId, SynergyLevel } from '../skills';
import type { PetId } from '../pets';
import type { Rarity } from '../equipment';
export const createTestingWorld = (options: GameplayOptions): GameplayWorld =>
  new QaGameplayWorld(options);
export interface TestingController {
  (input: unknown): void;
  snapshot(): QaSnapshot | null;
}
/** Imported only inside DEV or explicit QA-build branches; no testing controller in production. */
export function createTestingController(
  getWorld: () => GameplayWorld | null,
  restart: (options: GameplayOptions) => void,
): TestingController {
  const command = (input: unknown) => {
    if (!input || typeof input !== 'object' || !('type' in input))
      throw new TypeError('Invalid test action.');
    const a = input as Record<string, unknown>;
    const w = getWorld();
    if (a.type === 'restart') {
      const options = a.options as GameplayOptions;
      // Construct/validate before replacing the current world; restart callback does that atomically.
      restart(options);
      return;
    }
    if (!w) throw new Error('Start a run first.');
    switch (a.type) {
      case 'spawn':
        w.spawnEnemy(a.kind as EnemyKind, a.distance as number);
        break;
      // Task 25: a movement input for scripted runs (the next real frame replaces it with the
      // keyboard / joystick input; tests pause the page clock so `advance` alone drives the world).
      case 'move':
        w.setMovement(a.x as number, a.y as number);
        break;
      // Task 12 §1.5: N enemies of a given kind, a chest of a given type/content, any buff,
      // auto-collect (pacing measurement).
      case 'spawn-n': {
        const count = a.count as number;
        if (!Number.isInteger(count) || count < 1 || count > 24)
          throw new RangeError('Count must be 1–24.');
        for (let i = 0; i < count; i++)
          w.spawnEnemy(a.kind as EnemyKind, a.distance as number, (i * Math.PI * 2) / count);
        break;
      }
      case 'chest':
        if (!w.debugSpawnChest(a.chestType as ChestType, a.content as ChestContent | undefined))
          throw new Error('No chest: campaign run only, at most 3 on the map.');
        break;
      // Task 24 §1.7: spawn any activity next to the player; complete / fail one.
      case 'activity':
        if (!w.debugSpawnActivity(a.activityType as ActivityType))
          throw new Error('No activity: campaign run only (thief/nest need a free enemy slot).');
        break;
      case 'activity-resolve':
        if (!w.debugResolveActivity(a.id as string, a.outcome as 'complete' | 'fail'))
          throw new Error('Unknown activity.');
        break;
      // Task 42: force the boss item's rarity (null = the table); an elite item drop at the player.
      case 'boss-drop-rarity':
        w.debugForceBossDropRarity(a.rarity as Rarity | null);
        break;
      case 'elite-drop':
        if (!w.debugSpawnEliteDrop(a.rarity as Rarity))
          throw new Error('Item drops: active campaign run only.');
        break;
      case 'buff':
        if (!w.debugGrantBuff(a.buff as BuffId)) throw new Error('Buffs: campaign run only.');
        break;
      // Task 20 §1.5: spawn / replace (or remove, with id null) the pet in the current run.
      case 'pet':
        w.spawnPet(a.id === null ? null : { id: a.id as PetId, level: (a.level as number) ?? 1 });
        break;
      case 'dash':
        if (!w.requestDash()) throw new Error(`Dash unavailable: ${w.dashBlockReason()}.`);
        break;
      case 'dash-cooldown':
        w.setDebugDashCooldown(a.seconds as number | null);
        break;
      case 'synergy-level':
        // Task 15: force a synergy level (0–3) or return to the rank level (null).
        w.setTestSynergyLevel(a.id as SynergyId, a.level as SynergyLevel | null);
        break;
      case 'grant-choices':
        w.debugGrantChoiceControls(a.rerolls as number, a.banishes as number);
        break;
      case 'auto-collect':
        w.setDebugAutoCollect(a.enabled as boolean);
        break;
      case 'group':
        w.spawnGroup(a.count as number, a.distance as number);
        break;
      case 'clear-enemies':
        w.clearEnemies();
        break;
      case 'kill-in-view':
        w.debugKillInView(
          a.view as { x: number; y: number; width: number; height: number } | undefined,
        );
        break;
      case 'grant-xp':
        w.grantTestXp(a.amount as number);
        break;
      case 'xp-crystal':
        w.dropTestCrystal(a.value as number, a.distance as number);
        break;
      case 'spawning':
        w.setSpawning(a.settings as Parameters<GameplayWorld['setSpawning']>[0]);
        break;
      case 'heal':
        w.healPlayer();
        break;
      case 'hp':
        if (w instanceof QaGameplayWorld) w.setQaHp(a.value as number);
        else w.setPlayerHp(a.value as number);
        break;
      case 'death':
        if (w instanceof QaGameplayWorld) w.setQaHp(0);
        else w.setPlayerHp(0);
        break;
      case 'campaign-skip': {
        // Accelerate to the next scheduled campaign event with the normal simulation.
        const next = w.getSnapshot().campaign?.nextEvent;
        if (!next) throw new Error('No pending campaign event.');
        w.update(Math.max(0, next.time - w.time));
        break;
      }
      case 'campaign-boss-now':
        if (!w.debugFireCampaignEvent('boss')) throw new Error('The boss is already spawned.');
        break;
      case 'campaign-boss-hp':
        if (!w.debugSetBossHpFraction(a.fraction as number)) throw new Error('No living boss.');
        break;
      case 'campaign-force':
        w.debugForceOutcome(a.outcome as 'victory' | 'defeat');
        break;
      case 'protection':
        w.setTestProtection(a.enabled as boolean);
        break;
      case 'cleanse':
        w.cleanse(a.targetId as string);
        break;
      case 'effect':
        w.applyEffect(
          {
            sourceId: w.playerId,
            targetId: a.targetId as string,
            effectType: a.effectType as 'poison' | 'burn' | 'bleed',
            rawDamagePerTick: a.damage as number,
            duration: a.duration as number,
            probabilityPercent: 100,
          },
          a.stacks as number,
        );
        break;
      case 'on-hit':
        w.setOnHit([
          {
            effectType: a.effectType as 'poison' | 'burn' | 'bleed',
            rawDamagePerTick: a.damage as number,
            duration: a.duration as number,
            probabilityPercent: a.chance as number,
          },
        ]);
        break;
      case 'choose-skill':
        w.chooseSkill(a.card as string);
        break;
      case 'reroll-skills':
        w.rerollSkillOffer();
        break;
      case 'grant-skill':
        w.grantTestSkill(a.skillId as string, a.rank as number | undefined);
        break;
      case 'god-mode':
        if (!(w instanceof QaGameplayWorld)) throw new Error('God Mode requires a QA world.');
        w.setGodMode(a.enabled as boolean);
        break;
      case 'reset-synergy-counters':
        if (!(w instanceof QaGameplayWorld))
          throw new Error('Synergy diagnostics require a QA world.');
        w.resetSynergyCounters();
        break;
      default:
        throw new Error('Unknown test action.');
    }
  };
  return Object.assign(command, {
    snapshot: () => {
      const w = getWorld();
      return w instanceof QaGameplayWorld ? w.qaSnapshot() : null;
    },
  });
}
