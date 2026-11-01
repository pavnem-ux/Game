import type { EnemySnapshot } from '../enemy-ai';

const STUN_BADGE = Object.freeze({
  text: 'СТАН',
  color: '#ffec9a',
  background: '#30230d',
  offsetY: -55,
});
/** Pure presentation of authoritative control state; no extra timer, particles or gameplay state. */
export function stunIndicator(enemy: Pick<EnemySnapshot, 'alive' | 'control'>) {
  return enemy.alive && enemy.control?.stunned ? STUN_BADGE : null;
}
