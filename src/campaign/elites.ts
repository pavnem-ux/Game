import type { EnemyConfig } from '../enemy-ai';
import { CAMPAIGN_BALANCE } from './config';
import type { EliteProfileId } from './config';

/** Task 08 elite profiles: derived from the existing enemy profiles, so the same AI is reused. */
export interface EliteProfile {
  readonly id: EliteProfileId;
  readonly name: string;
  readonly extraXp: number;
}
export function eliteProfile(id: EliteProfileId): EliteProfile {
  const d = CAMPAIGN_BALANCE.elite.definitions[id];
  return Object.freeze({ id, name: d.name, extraXp: d.extraXp });
}
/** Elite enemy config: bigger, and per profile faster/harder hitting or longer-ranged. */
export function eliteEnemyConfig(base: EnemyConfig, id: EliteProfileId): EnemyConfig {
  const d = CAMPAIGN_BALANCE.elite.definitions[id];
  if (base.behavior !== id) throw new TypeError('Elite profile must match the base behaviour.');
  const config: EnemyConfig = {
    ...base,
    radius: base.radius * d.radiusScale,
    movementSpeed: base.movementSpeed * d.movementScale,
    attackInterval: base.attackInterval * d.attackIntervalScale,
    ...(base.behavior === 'ranged' && base.attackRange !== undefined
      ? { attackRange: base.attackRange * d.attackRangeScale }
      : {}),
  };
  return Object.freeze(config);
}
