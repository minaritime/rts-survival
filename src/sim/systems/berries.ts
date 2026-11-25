import { BERRY } from '../../data/resources.ts';
import type { ResourceNode } from '../entities.ts';
import type { World } from '../world.ts';

/** 지금 시각의 덤불 최대 열매. 10분마다 3씩 줄어든다 (기획.md 4-2) */
export function berryMaxAt(nowSeconds: number): number {
  const shrinks = Math.floor(Math.max(0, nowSeconds) / BERRY.shrinkEverySeconds);
  return Math.max(0, BERRY.startFruit - BERRY.shrinkAmount * shrinks);
}

/** 덤불을 다 비웠을 때 부른다. 비울 때마다 다시 차는 시간이 30초씩 늘어난다 */
export function markBerryEmptied(bush: ResourceNode, nowSeconds: number): void {
  bush.amount = 0;
  bush.regrowAt = nowSeconds + BERRY.regrowSeconds + BERRY.regrowPenaltySeconds * bush.timesEmptied;
  bush.timesEmptied += 1;
}

/**
 * 다시 찰 시각이 된 덤불을 채우고, 최대치가 줄었으면 모든 덤불을 그 아래로 깎는다
 * ("10분마다 모든 덤불 최대치 -3", 기획.md 4-2)
 */
export function stepBerries(world: World, nowSeconds: number): void {
  const max = berryMaxAt(nowSeconds);
  for (const node of world.nodes) {
    if (node.kind !== 'berry') continue;
    if (node.regrowAt !== null && nowSeconds >= node.regrowAt) {
      node.amount = max;
      node.regrowAt = null;
    }
    node.amount = Math.min(node.amount, max);
  }
}
