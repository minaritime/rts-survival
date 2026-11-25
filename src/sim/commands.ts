import { BUILDINGS, type BuildingKind } from '../data/buildings.ts';
import { PRODUCTION_QUEUE_MAX, UNITS, type TrainableKind } from '../data/units.ts';
import { canBuild, canGather, createBuilding, unitTile, type Building, type Rally, type Unit } from './entities.ts';
import { canTrain } from './systems/production.ts';
import { inBounds, type Point } from './grid.ts';
import { pathToward, walkableFrom } from './navigation.ts';
import { findPathNextToRect, inRect, type TileRect } from './path.ts';
import { addBuilding, buildingAt, creatureAt, findCreature, findUnit, isWalkable, nodeAt, type World } from './world.ts';

/**
 * 플레이어 명령. 화면은 마우스·키보드를 이 함수들로만 sim 에 전한다.
 * 명령은 다음 틱부터 반영된다.
 */

/**
 * 걷던 중이면 지금 밟아 가는 칸까지는 마저 가야 뒤로 물러나지 않는다.
 * 그 칸을 돌려준다 (서 있으면 undefined).
 */
function stepInProgress(unit: Unit): Point | undefined {
  return unit.path[0];
}

/**
 * 여러 유닛을 한 곳으로 보낼 때 나눠 설 칸들: 목적지에서 가까운 밟을 수 있는 칸부터 count 개 (한 점에 겹치지 않게).
 * 목적지가 막혀 있으면 그 둘레부터.
 */
function spreadTargets(world: World, target: Point, count: number): Point[] {
  const out: Point[] = [];
  const seen = new Set<string>([`${target.x},${target.y}`]);
  const queue: Point[] = [target];
  for (let head = 0; head < queue.length && out.length < count && head < 4000; head++) {
    const p = queue[head]!;
    if (isWalkable(world, p.x, p.y)) out.push(p);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      const n = { x: p.x + dx, y: p.y + dy };
      const k = `${n.x},${n.y}`;
      if (seen.has(k) || !inBounds(world.map.grid, n.x, n.y)) continue;
      seen.add(k);
      // 막힌 칸은 넘어가지 않는다 (벽 너머로 퍼지지 않게). 단 목적지 자체가 막혀 있으면 그 둘레로는 퍼진다
      if (isWalkable(world, n.x, n.y) || !isWalkable(world, p.x, p.y)) queue.push(n);
    }
  }
  return out;
}

/** 땅으로 이동. 막힌 칸을 찍으면 그 옆까지 간다. 여러 기면 목적지 둘레로 나눠 선다. 갈 수 없으면 false */
export function commandMove(world: World, unitIds: readonly number[], target: Point): boolean {
  const units = unitIds.map((id) => findUnit(world, id)).filter((u): u is Unit => u !== undefined && u.hp > 0);
  if (units.length > 1) {
    const spots = spreadTargets(world, target, units.length);
    // 목적지에서 먼 유닛부터 먼 칸으로 (서로 길을 덜 가로지르게)
    const byDistance = [...units].sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y));
    let any = false;
    byDistance.forEach((u, i) => {
      // 나눠 준 칸이 벽 너머라 못 가면 찍은 곳으로
      const spot = spots[i];
      if ((spot && moveOne(world, u, spot)) || moveOne(world, u, target)) any = true;
    });
    return any;
  }
  return units[0] ? moveOne(world, units[0], target) : false;
}

function moveOne(world: World, unit: Unit, target: Point): boolean {
  {
    const current = stepInProgress(unit);
    const rest = pathToward(world, current ?? unitTile(unit), target);
    if (rest === null) return false;
    unit.order = { type: 'move', target };
    unit.path = current ? [current, ...rest] : rest;
    unit.buildQueue = [];
    unit.workSeconds = 0;
    return true;
  }
}

/** 자원 채집. 실제 다가가는 것은 다음 틱의 채집 처리가 한다 */
export function commandGather(world: World, unitIds: readonly number[], nodeId: number): boolean {
  const node = world.nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  let any = false;
  for (const id of unitIds) {
    const unit = findUnit(world, id);
    if (!unit || unit.hp <= 0 || !canGather(unit, node.kind)) continue;
    const current = stepInProgress(unit);
    unit.order = { type: 'gather', nodeId };
    unit.path = current ? [current] : [];
    unit.buildQueue = [];
    unit.workSeconds = 0;
    any = true;
  }
  return any;
}

/** 정지: 하던 일을 멈춘다. 걷던 중이면 지금 밟아 가는 칸까지만 가서 선다 */
export function commandStop(world: World, unitIds: readonly number[]): boolean {
  if (world.outcome !== 'playing') return false;
  let any = false;
  for (const id of unitIds) {
    const unit = findUnit(world, id);
    if (!unit) continue;
    const current = stepInProgress(unit);
    unit.order = current ? { type: 'move', target: current } : { type: 'idle' };
    unit.path = current ? [current] : [];
    unit.buildQueue = [];
    unit.workSeconds = 0;
    unit.engageId = null;
    any = true;
  }
  return any;
}

/** 짓기 조건 중 아직 없는 건물 (다 지은 것만 셈). 다 갖췄으면 null */
export function missingRequirement(world: World, kind: BuildingKind): BuildingKind | null {
  const need = BUILDINGS[kind].requires ?? [];
  return need.find((k) => !world.buildings.some((b) => b.kind === k && b.complete)) ?? null;
}

/**
 * 이 칸이 미네랄에 너무 가까워 그 건물을 놓을 수 없는지 (BuildingSpec.minResourceDistance).
 * 건물 자리 미리보기에서 칸마다 빨갛게 보일 때도 쓴다.
 */
export function tooCloseToResource(world: World, kind: BuildingKind, x: number, y: number): boolean {
  const min = BUILDINGS[kind].minResourceDistance;
  if (min === undefined) return false;
  return world.nodes.some((n) => n.kind === 'mineral' && Math.max(Math.abs(n.x - x), Math.abs(n.y - y)) < min);
}

/**
 * 이 자리(왼쪽 위 칸)에 건물을 놓을 수 있는지.
 * 모든 칸이 밟을 수 있는 땅이어야 하고, builderIds 가 아닌 유닛이 그 안에 서 있으면 안 된다.
 */
export function canPlace(world: World, kind: BuildingKind, at: Point, builderIds: readonly number[] = []): boolean {
  const spec = BUILDINGS[kind];
  const rect = { x: at.x, y: at.y, width: spec.width, height: spec.height };
  for (let y = at.y; y < at.y + spec.height; y++) {
    for (let x = at.x; x < at.x + spec.width; x++) {
      if (!isWalkable(world, x, y) || tooCloseToResource(world, kind, x, y)) return false;
    }
  }
  if (world.creatures.some((c) => c.hp > 0 && inRect(rect, Math.round(c.x), Math.round(c.y)))) return false;
  return !world.units.some(
    (u) => u.hp > 0 && !builderIds.includes(u.id) && inRect(rect, Math.round(u.x), Math.round(u.y)),
  );
}

/**
 * 짓기 명령: 일꾼이 건물 곁으로 가서 짓는다.
 * queue(Shift) 면 지금 짓는 것을 마친 뒤 하도록 줄 뒤에 세운다.
 */
function orderBuild(world: World, unitIds: readonly number[], building: Building, queue = false): boolean {
  let any = false;
  for (const id of unitIds) {
    const unit = findUnit(world, id);
    if (!unit || unit.hp <= 0 || !canBuild(unit)) continue;
    if (queue && unit.order.type === 'build') {
      unit.buildQueue.push(building.id);
      any = true;
      continue;
    }
    unit.buildQueue = [];
    const current = stepInProgress(unit);
    unit.order = { type: 'build', buildingId: building.id };
    unit.path = current ? [current] : [];
    unit.workSeconds = 0;
    any = true;
  }
  return any;
}

/**
 * 짓는 일꾼 중 하나라도 그 자리 둘레까지 걸어갈 수 있는지.
 * 놓기 전이라 자리 칸은 아직 안 막혀 있으므로, 막힌 것으로 치고 찾는다 (일꾼이 그 안에 서 있으면 그 칸들로 걸어 나올 수 있음).
 */
function canReachFootprint(world: World, builderIds: readonly number[], rect: TileRect): boolean {
  return builderIds.some((id) => {
    const unit = findUnit(world, id);
    if (!unit) return false;
    const here = unitTile(unit);
    const base = walkableFrom(world, here);
    const startsInside = inRect(rect, here.x, here.y);
    const walkable = (x: number, y: number): boolean => (inRect(rect, x, y) ? startsInside : base(x, y));
    return findPathNextToRect(walkable, here, rect) !== null;
  });
}

/**
 * 건물 놓기 (스타 테란식): 놓는 순간 미네랄을 내고 자리를 차지한다. 일꾼이 곁에서 지어야 올라간다.
 * 놓을 수 없거나 미네랄이 모자라면 null.
 */
export function commandBuild(
  world: World,
  unitIds: readonly number[],
  kind: BuildingKind,
  at: Point,
  queue = false,
): Building | null {
  // 지을 수 있는 유닛(지휘관·일꾼)만 짓는다
  unitIds = unitIds.filter((id) => {
    const u = findUnit(world, id);
    return u !== undefined && canBuild(u);
  });
  if (world.outcome !== 'playing' || unitIds.length === 0 || missingRequirement(world, kind) !== null) return null;
  const spec = BUILDINGS[kind];
  if (world.stock.mineral < spec.mineral || !canPlace(world, kind, at, unitIds)) return null;
  // 둘레까지 갈 길이 없으면 미네랄만 나가고 영영 못 짓는다
  if (!canReachFootprint(world, unitIds, { x: at.x, y: at.y, width: spec.width, height: spec.height })) return null;
  world.stock.mineral -= spec.mineral;
  const selfBuild = isFirstCommandCenter(world, kind);
  if (kind === 'commandCenter') world.commandCenterPlaced = true;
  const building = createBuilding(world.nextId++, kind, at, selfBuild);
  addBuilding(world, building);
  if (selfBuild) {
    // 혼자 지어지므로 짓는 유닛은 필요 없다. 자리 안에 서 있던 유닛만 둘레로 걸어 나온다 (stepBuild 가 바로 놓아 줌)
    const inside = unitIds.filter((id) => {
      const u = findUnit(world, id);
      return u !== undefined && inRect(building, unitTile(u).x, unitTile(u).y);
    });
    orderBuild(world, inside, building, queue);
  } else {
    orderBuild(world, unitIds, building, queue);
  }
  return building;
}

/** 이번에 놓을 건물이 판의 첫 사령부인지 (혼자 빨리 지어짐, data/buildings.ts FIRST_COMMAND_CENTER) */
export function isFirstCommandCenter(world: World, kind: BuildingKind): boolean {
  return kind === 'commandCenter' && !world.commandCenterPlaced;
}

/** 생산: 건물 줄 뒤에 유닛을 세운다 (미네랄은 바로 냄). 못 하면 false */
export function commandTrain(world: World, buildingId: number, kind: TrainableKind): boolean {
  if (world.outcome !== 'playing') return false;
  const b = world.buildings.find((x) => x.id === buildingId);
  const cost = UNITS[kind].mineral;
  if (!b || !b.complete || !canTrain(b, kind) || b.trainQueue.length >= PRODUCTION_QUEUE_MAX || world.stock.mineral < cost) {
    return false;
  }
  world.stock.mineral -= cost;
  b.trainQueue.push(kind);
  return true;
}

/** 생산 줄의 마지막 예약을 취소하고 미네랄을 돌려준다 (만들던 것이면 진행도 버림) */
export function commandCancelTrain(world: World, buildingId: number, index?: number): boolean {
  const b = world.buildings.find((x) => x.id === buildingId);
  if (!b) return false;
  const at = index ?? b.trainQueue.length - 1;
  const kind = b.trainQueue[at];
  if (kind === undefined) return false;
  b.trainQueue.splice(at, 1);
  world.stock.mineral += UNITS[kind].mineral;
  // 만들던 맨 앞을 취소하면 진행을 버리고 다음 것을 처음부터
  if (at === 0) {
    b.trainProgress = 0;
    b.trainStarted = false;
  }
  return true;
}

/** 오른쪽 클릭: 자원이면 채집, 짓다 만 건물이면 이어서 짓기, 아니면 이동 (시제품.md 3장) */
export function commandSmart(world: World, unitIds: readonly number[], tile: Point): boolean {
  if (world.outcome !== 'playing') return false;
  // 고른 건물은 집결 지점을 정한다 (자원을 찍으면 일꾼이 나오자마자 캐러 감)
  const buildings = world.buildings.filter((b) => unitIds.includes(b.id));
  if (buildings.length > 0) {
    const n = nodeAt(world, tile.x, tile.y);
    const rally: Rally = n ? { kind: 'node', nodeId: n.id } : { kind: 'point', x: tile.x, y: tile.y };
    for (const b of buildings) b.rally = rally;
  }
  const units = unitIds.map((id) => findUnit(world, id)).filter((u): u is Unit => u !== undefined && u.hp > 0);
  if (units.length === 0) return buildings.length > 0;
  // 괴물·사냥감이면 모두 공격
  const creature = creatureAt(world, tile.x, tile.y);
  if (creature) return commandAttack(world, units.map((u) => u.id), creature.id) || buildings.length > 0;
  // 자원이면 캘 수 있는 유닛만 캐고, 짓다 만 건물이면 짓고, 다친 건물이면 고친다 (지을 수 있는 유닛만). 나머지는 그쪽으로 걸어감
  const node = nodeAt(world, tile.x, tile.y);
  const there = node ? undefined : buildingAt(world, tile.x, tile.y);
  const site = there && !there.complete ? there : undefined;
  const damaged = there && there.complete && there.hp < there.maxHp ? there : undefined;
  const doers = node ? units.filter((u) => canGather(u, node.kind)) : site || damaged ? units.filter(canBuild) : [];
  const walkers = units.filter((u) => !doers.includes(u)).map((u) => u.id);
  const doerIds = doers.map((u) => u.id);
  let any = walkers.length > 0 && commandMove(world, walkers, tile);
  if (node && doerIds.length > 0) any = commandGather(world, doerIds, node.id) || any;
  if (site && doerIds.length > 0) any = orderBuild(world, doerIds, site) || any;
  if (damaged && doerIds.length > 0) any = commandRepair(world, doerIds, damaged.id) || any;
  return any || buildings.length > 0;
}

/** 살아 있는 내 유닛만 (명령 공통) */
function liveUnits(world: World, unitIds: readonly number[]): Unit[] {
  return unitIds.map((id) => findUnit(world, id)).filter((u): u is Unit => u !== undefined && u.hp > 0);
}

/** 하던 일을 비우고 새 명령. 걷던 칸까지는 마저 간다 */
function reorder(unit: Unit, order: Unit['order']): void {
  const current = stepInProgress(unit);
  unit.order = order;
  unit.path = current ? [current] : [];
  unit.buildQueue = [];
  unit.workSeconds = 0;
  unit.engageId = null;
}

/** 공격: 괴물·사냥감 하나를 쫓아가 친다. 내 건물이면 강제 공격 (A 다음 건물 클릭) */
export function commandAttack(world: World, unitIds: readonly number[], targetId: number): boolean {
  if (world.outcome !== 'playing') return false;
  const target = findCreature(world, targetId) ?? world.buildings.find((b) => b.id === targetId);
  if (!target || target.hp <= 0) return false;
  const units = liveUnits(world, unitIds);
  for (const u of units) reorder(u, { type: 'attack', targetId });
  return units.length > 0;
}

/** 공격하며 이동: 가는 길에 만나는 괴물과 싸운다 */
export function commandAttackMove(world: World, unitIds: readonly number[], target: Point): boolean {
  if (world.outcome !== 'playing' || !inBounds(world.map.grid, target.x, target.y)) return false;
  const units = liveUnits(world, unitIds);
  for (const u of units) reorder(u, { type: 'attackMove', target });
  return units.length > 0;
}

/** 수리: 다 지은 내 건물을 고친다 (지휘관·일꾼만, 미네랄이 듦) */
export function commandRepair(world: World, unitIds: readonly number[], buildingId: number): boolean {
  if (world.outcome !== 'playing') return false;
  const b = world.buildings.find((x) => x.id === buildingId);
  if (!b || !b.complete || b.hp >= b.maxHp) return false;
  const units = liveUnits(world, unitIds).filter(canBuild);
  for (const u of units) reorder(u, { type: 'repair', buildingId });
  return units.length > 0;
}
