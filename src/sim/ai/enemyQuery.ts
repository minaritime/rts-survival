import type { Building, Unit } from '../entities.ts';
import type { World } from '../world.ts';

/** 적 머리 여러 파일이 같이 쓰는 찾기 */

export function enemyBuildings(world: World): Building[] {
  return world.buildings.filter((b) => b.owner === 'enemy');
}

export function enemyUnits(world: World, kind: Unit['kind']): Unit[] {
  return world.units.filter((u) => u.owner === 'enemy' && u.kind === kind && u.hp > 0);
}

export function allUnitIds(world: World): number[] {
  return world.units.map((u) => u.id);
}
