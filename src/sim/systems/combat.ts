import { BUILDINGS } from '../../data/buildings.ts';
import { UNITS } from '../../data/units.ts';
import { START } from '../../data/commander.ts';
import { AUTO_ACQUIRE_EXTRA, BUILDING_ATTACK, LEASH_EXTRA, RANGE_SLACK, UNIT_ATTACK, type AttackSpec } from '../../data/combat.ts';
import { createNode, goIdle, isMonster, unitTile, type Building, type Creature, type Unit } from '../entities.ts';
import { tileIndex, type Point } from '../grid.ts';
import { pathToward } from '../navigation.ts';
import { findCreature, isWalkable, removeBuilding, type World } from '../world.ts';

/**
 * 전투 (기획.md 3·5·6장 수치, data/combat.ts).
 * - 내 유닛: 공격 명령 / 공격하며 이동 / 가만히 있다가 사거리 안 괴물을 알아채고 싸움 (일꾼은 알아서 싸우지 않음)
 * - 포탑: 사거리 안 가장 가까운 괴물을 쏨
 * - 죽음: 유닛·건물·괴물을 치우고, 사냥감은 고기를 남긴다. 지휘관이 죽으면 패배
 */

/** 점에서 건물 사각형까지 거리 (칸) */
export function distanceToBuilding(b: Building, x: number, y: number): number {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.width - 1));
  const dy = Math.max(b.y - y, 0, y - (b.y + b.height - 1));
  return Math.hypot(dx, dy);
}

export function withinRange(spec: AttackSpec, distance: number): boolean {
  return distance <= spec.range + RANGE_SLACK;
}

/** 공격 한 번: 피해를 주고 화면 효과를 남긴다 */
export function strike(world: World, from: Point, target: Unit | Building | Creature, spec: AttackSpec, isBuilding: boolean): void {
  const factor = isBuilding ? (spec.buildingFactor ?? 1) : 1;
  target.hp -= spec.damage * factor;
  const to = 'width' in target ? { x: target.x + (target.width - 1) / 2, y: target.y + (target.height - 1) / 2 } : target;
  world.shots.push({ fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, tick: world.tick, melee: spec.range <= 1 });
}

/** 살아 있는 괴물 (사냥감 빼고) */
function liveMonsters(world: World): Creature[] {
  return world.creatures.filter((c) => c.hp > 0 && isMonster(c) && !c.retreating);
}

/** 길이 없던 상대를 다시 노려 보기까지 (초) */
const UNREACHABLE_SECONDS = 3;

/** 이 거리 안에서 가장 가까운 괴물 (skipId 는 뺌) */
function nearestMonster(world: World, x: number, y: number, within: number, skipId: number | null = null): Creature | undefined {
  let best: Creature | undefined;
  let bestD = within;
  for (const c of liveMonsters(world)) {
    if (c.id === skipId) continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d <= bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/**
 * 상대에게 다가가 사거리 안이면 쏜다.
 * 쫓아갈 길이 없으면 false (상대를 놓아 줌).
 */
function engage(world: World, unit: Unit, target: Creature): boolean {
  const spec = UNIT_ATTACK[unit.kind];
  const d = Math.hypot(target.x - unit.x, target.y - unit.y);
  if (withinRange(spec, d)) {
    // 걷던 칸 한가운데까지는 마저 간다 (칸 사이에 멈추지 않게)
    if (unit.path.length > 1) unit.path = unit.path.slice(0, 1);
    if (unit.cooldown <= 0) {
      strike(world, unit, target, spec, false);
      unit.cooldown = spec.cooldown;
    }
    return true;
  }
  const goal = { x: Math.round(target.x), y: Math.round(target.y) };
  const end = unit.path.at(-1);
  if (end && Math.hypot(end.x - goal.x, end.y - goal.y) <= 1.5) return true; // 길이 아직 쓸 만함
  const path = pathToward(world, unitTile(unit), goal);
  if (path === null) {
    // 벽 너머 등 갈 수 없는 상대: 잠시 잊는다 (안 그러면 다음 틱에 또 알아채서 길찾기를 되풀이)
    unit.unreachableId = target.id;
    unit.unreachableUntil = world.tick + UNREACHABLE_SECONDS * 20;
    return false;
  }
  unit.path = path;
  return true;
}

/** 공격 명령: 정한 상대가 죽거나 사라지면 선다 */
export function stepAttackOrder(world: World, unit: Unit, targetId: number): void {
  const target = findCreature(world, targetId);
  if (target) {
    if (target.hp <= 0 || !engage(world, unit, target)) goIdle(unit);
    return;
  }
  // 강제 공격: 내 건물 (스타처럼 A 다음 내 건물을 누르면 부순다. 길을 트거나 자리를 비울 때)
  const building = world.buildings.find((b) => b.id === targetId);
  if (!building || building.hp <= 0 || !engageBuilding(world, unit, building)) goIdle(unit);
}

/** 건물 곁(사거리 안)으로 가서 친다. 갈 길이 없으면 false */
function engageBuilding(world: World, unit: Unit, b: Building): boolean {
  const spec = UNIT_ATTACK[unit.kind];
  if (withinRange(spec, distanceToBuilding(b, unit.x, unit.y))) {
    if (unit.path.length > 1) unit.path = unit.path.slice(0, 1);
    if (unit.cooldown <= 0) {
      strike(world, unit, b, spec, true);
      unit.cooldown = spec.cooldown;
    }
    return true;
  }
  if (unit.path.length > 0) return true;
  const path = pathToward(world, unitTile(unit), { x: b.x, y: b.y });
  if (path === null || path.length === 0) return false;
  unit.path = path;
  return true;
}

/** 스스로 붙은 싸움: 상대가 사라졌거나 너무 멀어지면 놓아 준다. 계속 싸우면 true */
function keepEngaged(world: World, unit: Unit): boolean {
  if (unit.engageId === null) return false;
  const target = findCreature(world, unit.engageId);
  const spec = UNIT_ATTACK[unit.kind];
  const tooFar = target ? Math.hypot(target.x - unit.x, target.y - unit.y) > spec.range + LEASH_EXTRA : true;
  if (!target || target.hp <= 0 || target.retreating || tooFar || !engage(world, unit, target)) {
    unit.engageId = null;
    unit.path = [];
    return false;
  }
  return true;
}

/** 사거리 + 2 안의 괴물을 알아챈다 */
function acquire(world: World, unit: Unit): boolean {
  const spec = UNIT_ATTACK[unit.kind];
  const skip = world.tick < unit.unreachableUntil ? unit.unreachableId : null;
  const found = nearestMonster(world, unit.x, unit.y, spec.range + AUTO_ACQUIRE_EXTRA, skip);
  if (!found) return false;
  unit.engageId = found.id;
  return keepEngaged(world, unit);
}

/** 가만히 있는 유닛: 가까이 온 괴물과 싸운다 (일꾼은 일하는 유닛이라 알아서 싸우지 않음) */
export function stepIdleGuard(world: World, unit: Unit): void {
  if (unit.kind === 'worker') return;
  if (!keepEngaged(world, unit)) acquire(world, unit);
}

/** 공격하며 이동: 괴물을 만나면 싸우고, 다 잡으면 다시 목적지로. 도착하면 선다 */
export function stepAttackMove(world: World, unit: Unit, target: Point): void {
  if (keepEngaged(world, unit) || acquire(world, unit)) return;
  if (unit.path.length > 0) return;
  const here = unitTile(unit);
  if (here.x === target.x && here.y === target.y) {
    goIdle(unit);
    return;
  }
  const path = pathToward(world, here, target);
  if (path === null || path.length === 0) goIdle(unit);
  else unit.path = path;
}

/** 포탑: 사거리 안 가장 가까운 괴물을 쏜다 */
export function stepTurrets(world: World, dt: number): void {
  for (const b of world.buildings) {
    const spec = BUILDING_ATTACK[b.kind];
    if (!spec || !b.complete) continue;
    b.cooldown = Math.max(0, b.cooldown - dt);
    if (b.cooldown > 0) continue;
    let best: Creature | undefined;
    let bestD = Infinity;
    for (const c of liveMonsters(world)) {
      const d = distanceToBuilding(b, c.x, c.y);
      if (withinRange(spec, d) && d < bestD) {
        best = c;
        bestD = d;
      }
    }
    if (!best) continue;
    strike(world, { x: b.x + (b.width - 1) / 2, y: b.y + (b.height - 1) / 2 }, best, spec, false);
    b.cooldown = spec.cooldown;
  }
}

/** 식량 한도 다시 셈: 사령부 전 주머니 30, 다 지은 건물이 주는 한도 중 가장 큰 것 */
export function recomputeFoodCap(world: World): void {
  const caps = world.buildings.filter((b) => b.complete).map((b) => BUILDINGS[b.kind].foodCap ?? 0);
  world.foodCap = Math.max(START.pocketFoodCap, ...caps);
  world.stock.food = Math.min(world.stock.food, world.foodCap);
}

/** 사냥감이 죽은 자리(막혔으면 가까운 빈 칸)에 고기를 남긴다 */
function dropMeat(world: World, at: Point): void {
  for (let r = 0; r <= 2; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = at.x + dx;
        const y = at.y + dy;
        if (!isWalkable(world, x, y)) continue;
        if (world.units.some((u) => Math.round(u.x) === x && Math.round(u.y) === y)) continue;
        const meat = createNode(world.nextId++, 'meat', { x, y });
        world.nodes.push(meat);
        world.occupied.add(tileIndex(world.map.grid, x, y));
        return;
      }
    }
  }
}

/** 체력이 0 이 된 것을 치운다. 지휘관이면 패배 */
export function removeDead(world: World): void {
  for (let i = world.units.length - 1; i >= 0; i--) {
    const u = world.units[i]!;
    if (u.hp > 0) continue;
    if (u.id === world.commanderId) {
      u.hp = 0;
      world.outcome = 'defeat';
      continue;
    }
    world.units.splice(i, 1);
    world.stats.unitsLost += 1;
  }
  let lostBuilding = false;
  for (const b of [...world.buildings]) {
    if (b.hp > 0) continue;
    for (const kind of b.trainQueue) world.stock.mineral += UNITS[kind].mineral;
    removeBuilding(world, b);
    world.stats.buildingsLost += 1;
    lostBuilding = true;
  }
  if (lostBuilding) recomputeFoodCap(world);
  for (let i = world.creatures.length - 1; i >= 0; i--) {
    const c = world.creatures[i]!;
    if (c.hp > 0) continue;
    world.creatures.splice(i, 1);
    if (isMonster(c)) world.stats.monstersKilled += 1;
    else {
      world.stats.grazersHunted += 1;
      dropMeat(world, { x: Math.round(c.x), y: Math.round(c.y) });
    }
  }
}
