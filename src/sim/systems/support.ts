import { BUILDINGS, FEEDER, HEAL_PER_SECOND } from '../../data/buildings.ts';
import { rectDistance } from '../path.ts';
import { commanderOf, type World } from '../world.ts';
import { monsterNear } from './creatures.ts';

/**
 * 식량 배급처 (기획.md 4-2, 생존형 맵): 6칸 안에 다 지은 내 건물이 하나라도 있으면 켜지고,
 * 켜진 배급처마다 분당 10 의 식량이 저장량에 자동으로 들어온다 (한도까지).
 * 4칸 안에 괴물이 있으면 그동안 막혀서 안 나온다.
 */
export function stepFeeders(world: World, dt: number): void {
  let gain = 0;
  for (const feeder of world.feeders) {
    feeder.active = world.buildings.some(
      (b) => b.complete && rectDistance(b, feeder.x, feeder.y) <= FEEDER.activateRadius,
    );
    feeder.blocked = monsterNear(world, feeder, FEEDER.blockRadius);
    if (feeder.active && !feeder.blocked) gain += (FEEDER.foodPerMinute / 60) * dt;
  }
  if (gain > 0) world.stock.food = Math.min(world.foodCap, world.stock.food + gain);
}

/** 모닥불·사령부 곁(healRadius 칸)에 있는 지휘관은 초당 2 회복 (굶주리는 동안은 안 됨) */
export function stepHealing(world: World, dt: number): void {
  const c = commanderOf(world);
  if (!c || c.hp <= 0 || c.hp >= c.maxHp || world.satiety <= 0) return;
  const x = Math.round(c.x);
  const y = Math.round(c.y);
  const near = world.buildings.some((b) => {
    const r = BUILDINGS[b.kind].healRadius;
    return b.complete && r !== undefined && rectDistance(b, x, y) <= r;
  });
  if (near) c.hp = Math.min(c.maxHp, c.hp + HEAL_PER_SECOND * dt);
}
