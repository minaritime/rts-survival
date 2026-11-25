import { BUILDINGS, FIRST_COMMAND_CENTER } from '../../data/buildings.ts';
import { REPAIR } from '../../data/combat.ts';
import { TUTORIAL_RULES } from '../../data/tutorial.ts';
import { BUILD_START_HP_RATIO, goIdle, unitTile, type Building, type Unit } from '../entities.ts';
import { walkableFrom } from '../navigation.ts';
import { findPathNextToRect, rectDistance } from '../path.ts';
import { removeBuilding, type World } from '../world.ts';

/** 다 지었을 때: 체력을 채우고, 건물이 주는 것(식량 한도 등)을 준다 */
function complete(world: World, building: Building): void {
  building.progress = 1;
  building.complete = true;
  building.hp = Math.min(building.maxHp, Math.round(building.hp));
  const spec = BUILDINGS[building.kind];
  if (spec.foodCap !== undefined) world.foodCap = Math.max(world.foodCap, spec.foodCap);
  world.stats.buildingsCompleted += 1;
}

/** 줄 세운 다음 건물로. 없으면 선다 */
function nextInQueue(world: World, unit: Unit): void {
  while (unit.buildQueue.length > 0) {
    const nextId = unit.buildQueue.shift()!;
    const next = world.buildings.find((b) => b.id === nextId);
    if (next && !next.complete) {
      unit.order = { type: 'build', buildingId: next.id };
      unit.path = [];
      unit.workSeconds = 0;
      return;
    }
  }
  goIdle(unit);
}

/**
 * 건물 둘레까지 갈 길이 없어졌을 때 (Shift 로 줄 세운 다른 자리들에 둘러싸인 경우 등).
 * 아직 한 번도 안 지었으면 자리를 치우고 미네랄을 돌려준다. 칸만 막고 미네랄이 사라지지 않게.
 * 조금이라도 지었으면 남겨 둔다 (나중에 길이 나면 우클릭으로 이어 짓기).
 */
function giveUp(world: World, building: Building): void {
  if (building.progress > 0) return;
  removeBuilding(world, building);
  world.stock.mineral += BUILDINGS[building.kind].mineral;
}

/**
 * 짓기 명령: 건물 둘레 칸으로 가서, 곁에 붙어 있는 동안 진행률을 올린다.
 * 체력은 10% 에서 진행률만큼 찬다. 다 지으면 줄의 다음 건물로, 줄이 비었으면 선다.
 */
export function stepBuild(world: World, unit: Unit, buildingId: number, dt: number): void {
  const building = world.buildings.find((b) => b.id === buildingId);
  if (!building || building.complete) {
    nextInQueue(world, unit);
    return;
  }
  if (unit.path.length > 0) return; // 아직 가는 중

  const here = unitTile(unit);
  if (rectDistance(building, here.x, here.y) !== 1) {
    const path = findPathNextToRect(walkableFrom(world, here), here, building);
    if (path !== null && path.length > 0) {
      unit.path = path;
      return;
    }
    giveUp(world, building);
    nextInQueue(world, unit);
    return;
  }

  // 혼자 지어지는 건물: 둘레까지 걸어 나왔으면 할 일 끝 (진행은 stepSelfBuild)
  if (building.selfBuild) {
    nextInQueue(world, unit);
    return;
  }
  if (advance(world, building, dt)) nextInQueue(world, unit);
}

function buildSecondsOf(world: World, building: Building): number {
  if (world.tutorialRules) return TUTORIAL_RULES.buildSeconds;
  return building.selfBuild ? FIRST_COMMAND_CENTER.buildSeconds : BUILDINGS[building.kind].buildSeconds;
}

/** 진행률을 dt 만큼 올린다. 다 지었으면 true */
function advance(world: World, building: Building, dt: number): boolean {
  const before = building.progress;
  building.progress = Math.min(1, building.progress + dt / buildSecondsOf(world, building));
  // 짓는 동안 맞은 피해는 남는다 (진행한 만큼만 체력을 더함)
  building.hp = Math.min(building.maxHp, building.hp + building.maxHp * (1 - BUILD_START_HP_RATIO) * (building.progress - before));
  if (building.progress < 1 - 1e-9) return false;
  complete(world, building);
  return true;
}

/** 혼자 지어지는 건물(첫 사령부)은 곁에 아무도 없어도 진행된다 */
export function stepSelfBuild(world: World, dt: number): void {
  for (const b of world.buildings) {
    if (b.selfBuild && !b.complete) advance(world, b, dt);
  }
}

/**
 * 수리 (기획.md 6장): 다 지은 내 건물 곁에서 체력을 채운다. 체력 1 당 미네랄 0.25.
 * 빠르기는 짓는 속도와 같다 (체력 전체 / 짓는 시간). 다 채웠거나 미네랄이 없으면 선다.
 */
export function stepRepair(world: World, unit: Unit, buildingId: number, dt: number): void {
  const building = world.buildings.find((b) => b.id === buildingId);
  if (!building || !building.complete || building.hp >= building.maxHp) {
    goIdle(unit);
    return;
  }
  if (unit.path.length > 0) return;
  const here = unitTile(unit);
  if (rectDistance(building, here.x, here.y) !== 1) {
    const path = findPathNextToRect(walkableFrom(world, here), here, building);
    if (path !== null && path.length > 0) unit.path = path;
    else goIdle(unit);
    return;
  }
  const want = Math.min(building.maxHp - building.hp, (building.maxHp / BUILDINGS[building.kind].buildSeconds) * dt);
  const afford = world.stock.mineral / REPAIR.mineralPerHp;
  const gain = Math.min(want, afford);
  if (gain <= 0) {
    goIdle(unit);
    return;
  }
  building.hp += gain;
  world.stock.mineral -= gain * REPAIR.mineralPerHp;
  if (building.hp >= building.maxHp - 1e-9) {
    building.hp = building.maxHp;
    goIdle(unit);
  }
}
