import type { Point } from './grid.ts';
import { findPath, findPathNextTo, findPathNextToRect, inRect, type Walkable } from './path.ts';
import { buildingAt, isWalkable, type World } from './world.ts';

/**
 * from 칸에서 출발하는 유닛이 밟을 수 있는 칸.
 * 건물 자리 안에 서 있으면(자기 자리에 건물을 놓은 경우) 그 건물 칸은 걸어 나갈 수 있게 열어 준다.
 */
export function walkableFrom(world: World, from: Point): Walkable {
  const trappedIn = isWalkable(world, from.x, from.y) ? undefined : buildingAt(world, from.x, from.y);
  if (!trappedIn) return (x, y) => isWalkable(world, x, y);
  return (x, y) => isWalkable(world, x, y) || inRect(trappedIn, x, y);
}

/**
 * from 에서 target 쪽으로 가는 길.
 * target 이 밟을 수 있으면 그 칸까지, 막혀 있으면(자원·건물) 그 옆 칸까지. 갈 수 없으면 null.
 */
export function pathToward(world: World, from: Point, target: Point): Point[] | null {
  const walkable = walkableFrom(world, from);
  if (isWalkable(world, target.x, target.y)) return findPath(walkable, from, target);
  // 건물을 찍었으면 그 건물 둘레까지 (가운데 칸 옆은 전부 건물이라 길이 없음)
  const building = buildingAt(world, target.x, target.y);
  if (building) return findPathNextToRect(walkable, from, building);
  return findPathNextTo(walkable, from, target);
}
