import { TICKS_PER_SECOND } from '../src/data/constants.ts';
import { MAP1_ROWS } from '../src/maps/map1.ts';
import { parseMap } from '../src/sim/mapLoader.ts';
import { commanderOf, createWorld, nodeAt, stepWorld, type World } from '../src/sim/world.ts';
import type { ResourceNode, Unit } from '../src/sim/entities.ts';

export function newWorld(): World {
  return createWorld(parseMap(MAP1_ROWS));
}

/** seconds 만큼 틱을 돌린다 */
export function run(world: World, seconds: number): void {
  const ticks = Math.round(seconds * TICKS_PER_SECOND);
  for (let i = 0; i < ticks; i++) stepWorld(world);
}

/** 조건이 맞을 때까지 돌리고 걸린 초를 돌려준다. limit 초를 넘으면 실패 */
export function runUntil(world: World, done: () => boolean, limitSeconds: number): number {
  const startTick = world.tick;
  const limitTicks = limitSeconds * TICKS_PER_SECOND;
  while (!done()) {
    if (world.tick - startTick > limitTicks) throw new Error(`${limitSeconds}초 안에 끝나지 않음`);
    stepWorld(world);
  }
  return (world.tick - startTick) / TICKS_PER_SECOND;
}

export function commander(world: World): Unit {
  const c = commanderOf(world);
  if (!c) throw new Error('지휘관 없음');
  return c;
}

export function node(world: World, x: number, y: number): ResourceNode {
  const n = nodeAt(world, x, y);
  if (!n) throw new Error(`(${x}, ${y})에 자원 없음`);
  return n;
}
