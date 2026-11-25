import { COMMANDER } from '../../data/commander.ts';
import { TUTORIAL_RULES } from '../../data/tutorial.ts';
import { UNITS } from '../../data/units.ts';
import { pathToFreeSide, stepHarvest, yieldIfMineralBusy } from './harvest.ts';
import { canGather, goIdle, isTouching, unitTile, type ResourceNode, type Unit } from '../entities.ts';
import { pathToward, walkableFrom } from '../navigation.ts';
import { isWalkable, removeNode, type World } from '../world.ts';
import { markBerryEmptied } from './berries.ts';
import { stepBuild, stepRepair } from './construction.ts';
import { stepAttackMove, stepAttackOrder, stepIdleGuard } from './combat.ts';
import { isStarving } from './hunger.ts';

/** 유닛 하나의 이동 속도 (칸/초) */
function speedOf(world: World, unit: Unit): number {
  if (unit.kind !== 'commander') return UNITS[unit.kind].speed;
  return isStarving(world) ? COMMANDER.speed * COMMANDER.starvingSpeedFactor : COMMANDER.speed;
}

/**
 * 다음 칸이 그사이 막혔으면(건물이 지어지는 등) 뚫고 가지 않는다.
 * 이동 명령이면 목적지까지 길을 다시 찾고, 못 찾으면 멈춘다.
 * 채집 명령이면 길만 비운다 (채집 처리가 다음에 다시 찾음).
 */
function handleBlockedPath(world: World, unit: Unit): void {
  unit.path = [];
  if (unit.order.type !== 'move') return; // 공격하며 이동은 다음 틱에 전투 처리가 다시 찾음
  const repath = pathToward(world, unitTile(unit), unit.order.target);
  if (repath === null || repath.length === 0) goIdle(unit);
  else unit.path = repath;
}

/** 경로를 따라 distance 만큼 걷는다 */
function walk(world: World, unit: Unit, distance: number): void {
  let left = distance;
  while (left > 0 && unit.path.length > 0) {
    const next = unit.path[0]!;
    // 건물 자리 안에 갇혀 있으면(자기 자리에 건물을 놓은 경우) 막힌 칸을 지나 걸어 나오게 둔다
    const here = unitTile(unit);
    const escaping = !isWalkable(world, here.x, here.y);
    const canStep = escaping ? walkableFrom(world, here)(next.x, next.y) : isWalkable(world, next.x, next.y);
    if (!canStep) {
      handleBlockedPath(world, unit);
      if (unit.path.length === 0 || !isWalkable(world, unit.path[0]!.x, unit.path[0]!.y)) return;
      continue;
    }
    const dx = next.x - unit.x;
    const dy = next.y - unit.y;
    const gap = Math.hypot(dx, dy);
    if (gap <= left) {
      unit.x = next.x;
      unit.y = next.y;
      unit.path.shift();
      left -= gap;
    } else {
      unit.x += (dx / gap) * left;
      unit.y += (dy / gap) * left;
      left = 0;
    }
  }
}

/** 한 번 일을 마쳤을 때 얻는 것. 끝났으면(더 할 게 없으면) true */
function finishWork(world: World, node: ResourceNode, nowSeconds: number): boolean {
  switch (node.kind) {
    case 'mineral':
      world.stock.mineral += COMMANDER.mineralPerTrip;
      world.stats.mineralMined += COMMANDER.mineralPerTrip;
      return false;
    case 'debris':
      world.stock.mineral += node.amount;
      world.stats.debrisLooted += 1;
      removeNode(world, node);
      return true;
    case 'meat': {
      // 고기: 열매처럼 조금씩 먹을거리로 넣는다. 다 주우면 사라짐
      const room = Math.max(0, Math.floor(world.foodCap - world.stock.food));
      const picked = Math.min(COMMANDER.berryPerPick, node.amount, room);
      node.amount -= picked;
      world.stock.food += picked;
      if (node.amount <= 0) {
        removeNode(world, node);
        return true;
      }
      return pocketIsFull(world);
    }
    case 'berry': {
      // 주머니에 안 들어가는 만큼은 따지 않고 덤불에 남겨 둔다
      const room = Math.max(0, Math.floor(world.foodCap - world.stock.food));
      const picked = Math.min(COMMANDER.berryPerPick, node.amount, room);
      node.amount -= picked;
      world.stock.food += picked;
      world.stats.berriesPicked += 1;
      if (node.amount <= 0) {
        markBerryEmptied(node, nowSeconds);
        return true;
      }
      return pocketIsFull(world);
    }
  }
}

/** 식량이 한도까지 1 도 안 남았으면 가득 찬 것 (배급처가 소수로 채워 49.7 같은 값이 될 수 있음) */
function pocketIsFull(world: World): boolean {
  return world.foodCap - world.stock.food < 1;
}

const WORK_SECONDS = {
  mineral: COMMANDER.mineralSeconds,
  berry: COMMANDER.berrySeconds,
  debris: COMMANDER.debrisSeconds,
  meat: COMMANDER.berrySeconds,
} as const;

/** 한 번 일하는 데 걸리는 시간. 튜토리얼 동안은 짧다 */
export function workSecondsFor(world: World, kind: ResourceNode['kind']): number {
  return WORK_SECONDS[kind] * (world.tutorialRules ? TUTORIAL_RULES.workTimeFactor : 1);
}

/** 채집 명령: 옆에 붙어 있으면 일하고, 아니면 다가간다 */
function stepGather(world: World, unit: Unit, nodeId: number, dt: number, nowSeconds: number): void {
  const node = world.nodes.find((n) => n.id === nodeId);
  // 일꾼은 들고 사령부까지 나른다 (harvest.ts, 적 일꾼의 열매 포함). 덤불이 비어도 든 것은 내려놓으러 간다
  if (unit.kind === 'worker' && node && canGather(unit, node.kind) && (node.amount > 0 || unit.carry > 0)) {
    stepHarvest(world, unit, node, dt, nowSeconds);
    return;
  }
  // 지휘관은 바로 들어온다
  const nothingLeft = !node || node.amount <= 0;
  const pocketFull = (node?.kind === 'berry' || node?.kind === 'meat') && pocketIsFull(world);
  if (nothingLeft || pocketFull || !canGather(unit, node.kind)) {
    goIdle(unit);
    return;
  }
  if (unit.path.length > 0) return; // 아직 가는 중

  if (!isTouching(unitTile(unit), node)) {
    const path = pathToFreeSide(world, unit, node);
    if (path === null || path.length === 0) goIdle(unit);
    else unit.path = path;
    return;
  }
  // 미네랄은 한 명씩 (지휘관도 일꾼이 캐는 덩어리는 기다리거나 옆 덩어리로)
  if (yieldIfMineralBusy(world, unit, node)) return;

  unit.workSeconds += dt;
  if (unit.workSeconds + 1e-9 < workSecondsFor(world, node.kind)) return;
  unit.workSeconds = 0;
  if (finishWork(world, node, nowSeconds)) goIdle(unit);
}

export function stepUnits(world: World, dt: number, nowSeconds: number): void {
  for (const unit of world.units) {
    unit.prevX = unit.x;
    unit.prevY = unit.y;
    unit.cooldown = Math.max(0, unit.cooldown - dt);
    if (unit.hp <= 0) continue;
    walk(world, unit, speedOf(world, unit) * dt);

    const order = unit.order;
    switch (order.type) {
      case 'idle':
        stepIdleGuard(world, unit);
        break;
      case 'move':
        if (unit.path.length === 0) goIdle(unit);
        break;
      case 'gather':
        stepGather(world, unit, order.nodeId, dt, nowSeconds);
        break;
      case 'build':
        stepBuild(world, unit, order.buildingId, dt);
        break;
      case 'repair':
        stepRepair(world, unit, order.buildingId, dt);
        break;
      case 'attack':
        stepAttackOrder(world, unit, order.targetId);
        break;
      case 'attackMove':
        stepAttackMove(world, unit, order.target);
        break;
    }
  }
}
