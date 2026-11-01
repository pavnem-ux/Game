import type { GameplayWorld, GameplayOptions } from './index';
import { QaGameplayWorld } from './qa';
import type { QaSnapshot } from './qa';
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
        w.spawnEnemy(a.kind as 'melee' | 'ranged', a.distance as number);
        break;
      case 'group':
        w.spawnGroup(a.count as number, a.distance as number);
        break;
      case 'clear-enemies':
        w.clearEnemies();
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
