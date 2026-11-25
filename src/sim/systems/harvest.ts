import { TUTORIAL_RULES } from '../../data/tutorial.ts';
import { WORKER } from '../../data/units.ts';
import { goIdle, isTouching, unitTile, type Building, type ResourceNode, type Unit } from '../entities.ts';
import type { Point } from '../grid.ts';
import { walkableFrom } from '../navigation.ts';
import { findPath, findPathNextTo, findPathNextToRect, rectDistance } from '../path.ts';
import { ENEMY } from '../../data/enemy.ts';
import { COMMANDER } from '../../data/commander.ts';
import { stockOf, type World } from '../world.ts';
import { markBerryEmptied } from './berries.ts';

/**
 * 일꾼 미네랄 채집: 덩어리 옆에서 캐서(8) 들고, 가까운 사령부에 내려놓고, 다시 돌아온다.
 * **한 덩어리는 한 번에 한 명만 캔다** (사용자 확정 2026-11-24, 지휘관 포함).
 * 누가 캐고 있으면 근처(6칸)의 빈 덩어리로 옮기고, 빈 덩어리가 없으면 옆에서 기다린다.
 * 지휘관은 반납 없이 바로 들어온다 (units.ts). 한 명씩 규칙과 둘레 칸 나누기는 같이 쓴다.
 */

/** 다른 유닛이 지금 이 덩어리를 캐는 중인지 (옆에 붙어 일하는 중, 빈손) */
function busyByOther(world: World, me: Unit, node: ResourceNode): boolean {
  return world.units.some(
    (u) =>
      u.id !== me.id &&
      u.hp > 0 &&
      u.order.type === 'gather' &&
      u.order.nodeId === node.id &&
      u.workSeconds > 0 &&
      u.carry === 0,
  );
}

/** 이 덩어리로 가고 있는(빈손) 다른 유닛 수 */
function headingTo(world: World, me: Unit, node: ResourceNode): number {
  return world.units.filter(
    (u) => u.id !== me.id && u.hp > 0 && u.order.type === 'gather' && u.order.nodeId === node.id && u.carry === 0,
  ).length;
}

/** 근처(6칸)의 다른 미네랄 중 아무도 안 캐고, 가는 유닛도 가장 적은 것 */
function freeMineralNear(world: World, me: Unit, node: ResourceNode): ResourceNode | undefined {
  const here = unitTile(me);
  return world.nodes
    .filter((n) => n.kind === 'mineral' && n.id !== node.id && Math.max(Math.abs(n.x - node.x), Math.abs(n.y - node.y)) <= 6)
    .filter((n) => !busyByOther(world, me, n))
    .sort(
      (a, b) =>
        headingTo(world, me, a) - headingTo(world, me, b) ||
        Math.hypot(a.x - here.x, a.y - here.y) - Math.hypot(b.x - here.x, b.y - here.y),
    )[0];
}

/**
 * 막 캐기 시작하려는데(옆에 붙음, 일 시작 전) 다른 유닛이 캐는 중이면 true.
 * 근처 빈 덩어리가 있으면 그쪽으로 명령을 바꾸고, 없으면 그 자리에서 기다린다.
 */
export function yieldIfMineralBusy(world: World, unit: Unit, node: ResourceNode): boolean {
  if (node.kind !== 'mineral' || unit.workSeconds > 0 || !busyByOther(world, unit, node)) return false;
  const other = freeMineralNear(world, unit, node);
  if (other) unit.order = { type: 'gather', nodeId: other.id };
  return true;
}

/** 같은 덩어리를 캐러 온 다른 유닛이 서 있거나 가고 있는 칸 */
function takenSides(world: World, me: Unit, node: ResourceNode): Set<string> {
  const taken = new Set<string>();
  for (const u of world.units) {
    if (u.id === me.id || u.hp <= 0 || u.order.type !== 'gather' || u.order.nodeId !== node.id || u.carry > 0) continue;
    const end = u.path.at(-1) ?? unitTile(u);
    taken.add(`${end.x},${end.y}`);
  }
  return taken;
}

/**
 * 덩어리 옆으로 가는 길. 다른 유닛이 차지하지 않은 둘레 칸 중 가까운 곳으로.
 * 빈 칸이 없으면 아무 옆 칸으로.
 */
export function pathToFreeSide(world: World, me: Unit, node: ResourceNode): Point[] | null {
  const here = unitTile(me);
  const walkable = walkableFrom(world, here);
  const taken = takenSides(world, me, node);
  const sides: Point[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = node.x + dx;
      const y = node.y + dy;
      if ((dx !== 0 || dy !== 0) && walkable(x, y) && !taken.has(`${x},${y}`)) sides.push({ x, y });
    }
  }
  sides.sort((a, b) => Math.hypot(a.x - here.x, a.y - here.y) - Math.hypot(b.x - here.x, b.y - here.y));
  for (const side of sides.slice(0, 3)) {
    if (side.x === here.x && side.y === here.y) return [];
    const path = findPath(walkable, here, side);
    if (path !== null) return path;
  }
  return findPathNextTo(walkable, here, node);
}

/** 미네랄을 내려놓을 곳: 자기 편의 다 지은 사령부 중 가장 가까운 것 */
function nearestDepot(world: World, unit: Unit, from: Point): Building | undefined {
  return world.buildings
    .filter((b) => b.kind === 'commandCenter' && b.complete && b.owner === unit.owner)
    .sort((a, b) => rectDistance(a, from.x, from.y) - rectDistance(b, from.x, from.y))[0];
}

function mineSeconds(world: World): number {
  return WORKER.mineSeconds * (world.tutorialRules ? TUTORIAL_RULES.workTimeFactor : 1);
}

/** 들고 온 것을 사령부에 내려놓는다 */
function deposit(world: World, unit: Unit): void {
  const stock = stockOf(world, unit.owner);
  if (unit.carryKind === 'food') stock.food += unit.carry;
  else {
    stock.mineral += unit.carry;
    if (unit.owner === 'player') world.stats.workerMineral += unit.carry;
  }
  unit.carry = 0;
  unit.carryKind = 'mineral';
}

/**
 * 일꾼 채집: 미네랄은 덩어리 옆에서 캐서 8 을 들고, 열매(적 일꾼만)는 덤불에서 몇 번 따서 들고 사령부로 간다.
 * 들고 있는 동안 덩어리가 사라져도 내려놓으러는 간다.
 */
export function stepHarvest(world: World, unit: Unit, node: ResourceNode, dt: number, nowSeconds = 0): void {
  if (unit.path.length > 0) return; // 가는 중
  const here = unitTile(unit);

  // 들고 있으면 사령부로 (열매는 다 찼거나 덤불이 비었을 때)
  const foodDone = unit.carryKind === 'food' && (unit.carry >= ENEMY.foodPerTrip || node.amount <= 0);
  // 다른 것을 들고 있으면(열매를 들고 미네랄로 보냄 등) 먼저 내려놓는다
  const mismatch = (unit.carryKind === 'food') !== (node.kind === 'berry');
  if (unit.carry > 0 && (unit.carryKind === 'mineral' || foodDone || mismatch)) {
    const depot = nearestDepot(world, unit, here);
    if (!depot) {
      goIdle(unit); // 사령부가 없으면 든 채로 쉰다 (다시 캐라고 하면 그때 나른다)
      return;
    }
    if (rectDistance(depot, here.x, here.y) === 1) {
      deposit(world, unit);
      if (node.amount <= 0) goIdle(unit);
      return;
    }
    const path = findPathNextToRect(walkableFrom(world, here), here, depot);
    if (path && path.length > 0) unit.path = path;
    else goIdle(unit); // 갈 길이 없으면 틱마다 길을 다시 찾지 않게 멈춘다
    return;
  }

  // 빈손이면 덩어리로
  if (!isTouching(here, node)) {
    const path = pathToFreeSide(world, unit, node);
    if (path === null || path.length === 0) goIdle(unit);
    else unit.path = path;
    return;
  }

  if (node.kind === 'berry') {
    pickBerry(unit, node, dt, nowSeconds);
    return;
  }
  if (yieldIfMineralBusy(world, unit, node)) return;

  unit.workSeconds += dt;
  if (unit.workSeconds + 1e-9 < mineSeconds(world)) return;
  unit.workSeconds = 0;
  unit.carry = WORKER.mineralPerTrip;
  unit.carryKind = 'mineral';
}

/** 적 일꾼이 덤불에서 열매를 딴다 (지휘관과 같은 빠르기). 다 비우면 덤불이 다시 차는 시간이 길어진다 */
function pickBerry(unit: Unit, node: ResourceNode, dt: number, nowSeconds: number): void {
  if (node.amount <= 0) return;
  unit.workSeconds += dt;
  if (unit.workSeconds + 1e-9 < COMMANDER.berrySeconds) return;
  unit.workSeconds = 0;
  const picked = Math.min(COMMANDER.berryPerPick, node.amount, ENEMY.foodPerTrip - unit.carry);
  node.amount -= picked;
  unit.carry += picked;
  unit.carryKind = 'food';
  if (node.amount <= 0) markBerryEmptied(node, nowSeconds);
}
