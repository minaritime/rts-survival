import { BUILDINGS, SUPPLY_MAX, type BuildingKind } from '../../data/buildings.ts';
import { ENEMY, ENEMY_EXPAND, ENEMY_GROW } from '../../data/enemy.ts';
import { UNITS } from '../../data/units.ts';
import type { EnemyPlan } from '../../maps/map3.ts';
import { canPlace, commandBuild, commandGather, commandMove, commandTrain, orderBuild } from '../commands.ts';
import { createBuilding, createTrainedUnit, type ResourceNode, type Unit } from '../entities.ts';
import type { Point } from '../grid.ts';
import { rectDistance } from '../path.ts';
import { between } from '../random.ts';
import { addBuilding, isWalkable, supplyCap, supplyUsed, type EnemyState, type World } from '../world.ts';
import { controlArmy, planFirstAttack, trainSoldiers } from './enemyArmy.ts';
import { allUnitIds, enemyBuildings, enemyUnits } from './enemyQuery.ts';

/**
 * 거울 적 기지의 머리 (기획.md 8-2). 대본 + 상태 기계, 1초마다 생각한다.
 * 1. 일꾼: 사령부마다 16기(최대 40)까지 뽑고, 쉬는 일꾼은 미네랄로. 일꾼이 8기를 넘으면 2기는 덤불 열매를 따 나른다 (내 식량 수급 방해)
 * 2. 건설: 맵 대본(buildOrder)의 시각이 되면 정해진 자리에. 보급이 모자라면 보급고를 더 짓는다
 * 3. 확장: 일꾼이 찼으면 맵의 확장 자리에 사령부 (시작 시각·간격은 시드 난수)
 * 4. 발전: 미네랄이 쌓이면 병영을 더 (최대 3)
 * 5. 병력·공격·수비: enemyArmy.ts. 적은 내 병력을 모른다 (스스로 정한 규모가 모이면 공격)
 */
/** 쉬는 일꾼에게 줄 미네랄은 사령부에서 이 칸 안 */
const MINERAL_RADIUS = 10;

export function setupEnemy(world: World, plan: EnemyPlan): void {
  for (const s of plan.start) {
    const b = createBuilding(world.nextId++, s.kind, s.at, false, 'enemy');
    b.progress = 1;
    b.complete = true;
    b.hp = b.maxHp;
    addBuilding(world, b);
  }
  if (!enemyBuildings(world).some((b) => b.kind === 'commandCenter')) throw new Error('적 기지에 사령부가 없음');
  if (!enemyBuildings(world).some((b) => b.kind === 'turret')) throw new Error('적 기지에 처음 포탑이 없음');
  for (const kind of ['barracks'] as const) {
    for (const b of enemyBuildings(world).filter((x) => x.kind === kind)) b.rally = { kind: 'point', ...plan.rally };
  }
  const enemy = world.enemy;
  if (!enemy) throw new Error('적 상태가 없음');
  // 매판 다르게 (같은 시드면 같은 판)
  planFirstAttack(world, enemy);
  enemy.nextExpandAt = between(world, ENEMY_EXPAND.earliest);
  // 일꾼은 없이 시작한다 (사령부가 뽑는다)
  const guards = freeTilesAround(world, { x: plan.rally.x, y: plan.rally.y, width: 1, height: 1 }, plan.riflemen);
  for (const at of guards) world.units.push(createTrainedUnit(world.nextId++, 'rifleman', at, 'enemy'));
}

/** 사각형 둘레의 빈 칸 count 개 (가까운 고리부터) */
function freeTilesAround(world: World, rect: { x: number; y: number; width: number; height: number }, count: number): Point[] {
  const out: Point[] = [];
  const taken = new Set(world.units.map((u) => `${Math.round(u.x)},${Math.round(u.y)}`));
  for (let ring = 1; ring <= 8 && out.length < count; ring++) {
    for (let y = rect.y - ring; y < rect.y + rect.height + ring && out.length < count; y++) {
      for (let x = rect.x - ring; x < rect.x + rect.width + ring && out.length < count; x++) {
        if (rectDistance(rect, x, y) !== ring || !isWalkable(world, x, y) || taken.has(`${x},${y}`)) continue;
        out.push({ x, y });
        taken.add(`${x},${y}`);
      }
    }
  }
  return out;
}

export function stepEnemyAi(world: World, now: number): void {
  const enemy = world.enemy;
  if (!enemy || now < enemy.nextThinkAt) return;
  enemy.nextThinkAt = now + ENEMY.thinkSeconds;
  if (enemyBuildings(world).length === 0) return;
  manageWorkers(world);
  resumeAbandoned(world);
  const reserved = planBuilding(world, enemy, now);
  trainUnits(world, enemy, reserved);
  controlArmy(world, enemy, now);
}

// ── 일꾼 ──

function manageWorkers(world: World): void {
  const workers = enemyUnits(world, 'worker');
  const foraging = workers.filter((u) => isForaging(world, u)).length;
  let wantForagers = workers.length >= ENEMY.foragersFromWorkers ? ENEMY.foragers - foraging : 0;
  for (const w of workers) {
    if (w.order.type !== 'idle') continue;
    if (wantForagers > 0) {
      const bush = nearestBush(world, w);
      if (bush && commandGather(world, [w.id], bush.id)) {
        wantForagers -= 1;
        continue;
      }
    }
    const mineral = nearestMineral(world, w);
    if (mineral) commandGather(world, [w.id], mineral.id);
  }
}

function isForaging(world: World, u: Unit): boolean {
  if (u.order.type !== 'gather') return false;
  const id = u.order.nodeId;
  return world.nodes.some((n) => n.id === id && n.kind === 'berry');
}

/** 열매가 있는 덤불 중 가장 가까운 것 */
function nearestBush(world: World, u: Unit): ResourceNode | undefined {
  return world.nodes
    .filter((n) => n.kind === 'berry' && n.amount > 0)
    .sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
}

/** 적 사령부 곁 미네랄 중 이 일꾼에게 가장 가까운 것 */
function nearestMineral(world: World, u: Unit): ResourceNode | undefined {
  const centers = enemyBuildings(world).filter((b) => b.kind === 'commandCenter' && b.complete);
  return world.nodes
    .filter((n) => n.kind === 'mineral' && centers.some((c) => rectDistance(c, n.x, n.y) <= MINERAL_RADIUS))
    .sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
}

/** 미네랄을 캐는 중이고 빈손인 일꾼 중 그 자리에 가장 가까운 것 (짓기에 뺀다) */
function pickBuilder(world: World, at: Point): Unit | undefined {
  return enemyUnits(world, 'worker')
    .filter((u) => u.carry === 0 && (u.order.type === 'idle' || (u.order.type === 'gather' && !isForaging(world, u))))
    .sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y))[0];
}

/** 짓던 일꾼이 죽어 멈춘 건물은 다른 일꾼이 이어 짓는다 */
function resumeAbandoned(world: World): void {
  for (const b of enemyBuildings(world)) {
    if (b.complete) continue;
    const building = world.units.some((u) => u.owner === 'enemy' && u.order.type === 'build' && u.order.buildingId === b.id);
    if (building) continue;
    const worker = pickBuilder(world, { x: b.x, y: b.y });
    if (worker) orderBuild(world, [worker.id], b);
  }
}

// ── 건설 ──

/** 대본 한 줄을 이만큼 못 지으면 건너뛴다 (내 유닛이 자리에 버티고 서 있는 등) */
const STEP_GIVE_UP_SECONDS = 20;

/**
 * 짓기를 하나 시도한다. 미네랄만 모자라 기다리는 중이면 그 값(생산에 쓰지 않고 남겨 둘 양)을 돌려준다.
 * 지을 일꾼이 없거나 자리가 막혀 못 짓는 동안은 미네랄을 묶어 두지 않는다 (생산까지 멈추지 않게)
 */
function planBuilding(world: World, enemy: EnemyState, now: number): number {
  if (needsDepot(world)) {
    const slot = freeSlot(world, 'supplyDepot', enemy.plan.depotSlots) ?? spotNearBase(world, 'supplyDepot');
    if (slot) return Math.max(0, attempt(world, enemy, 'supplyDepot', slot));
  }
  const waiting = followBuildOrder(world, enemy, now);
  if (waiting > 0) return waiting;
  const saving = planExpansion(world, enemy, now);
  return saving > 0 ? saving : planGrowth(world, enemy);
}

/** 대본 한 줄을 시도한다. 미네랄을 모으며 기다리는 중이면 그 값 */
function followBuildOrder(world: World, enemy: EnemyState, now: number): number {
  const step = enemy.plan.buildOrder[enemy.buildIndex];
  if (!step || now < step.afterSeconds) {
    enemy.stepWaitSince = null;
    return 0;
  }
  enemy.stepWaitSince ??= now;
  const outcome = attempt(world, enemy, step.kind, step.at);
  // 미네랄을 모으며 기다리는 것은 괜찮다. 일꾼이 없거나 자리가 안 비는 동안만 포기 시간을 센다
  if (outcome > 0) enemy.stepWaitSince = now;
  // 자리가 내 건물 등으로 막혔거나 너무 오래 못 지었으면 건너뛴다
  const blocked = !canPlace(world, step.kind, step.at, allUnitIds(world));
  if (outcome === BUILT || blocked || now - enemy.stepWaitSince > STEP_GIVE_UP_SECONDS) {
    enemy.buildIndex += 1;
    enemy.stepWaitSince = null;
    return 0;
  }
  return outcome;
}

/**
 * 확장 (기획.md 8-2): 시각이 됐고, 짓는 사령부가 없고, 일꾼이 찼으면 안전한 확장 자리에 사령부.
 * 미네랄이 모자라면 그만큼 남겨 둔다 (병사 생산이 잠시 멈춤)
 */
function planExpansion(world: World, enemy: EnemyState, now: number): number {
  if (now < enemy.nextExpandAt) return 0;
  const centers = enemyBuildings(world).filter((b) => b.kind === 'commandCenter');
  if (centers.some((b) => !b.complete)) return 0;
  if (enemyUnits(world, 'worker').length < workerTarget(world) * ENEMY_EXPAND.workerRatio) return 0;
  // 적은 내 유닛을 모른다: 자리가 비어 있으면 간다 (내가 먼저 지었으면 다음 자리)
  const slot = enemy.plan.expansions.find((p) => canPlace(world, 'commandCenter', p, allUnitIds(world)));
  if (!slot) return 0;
  const outcome = attempt(world, enemy, 'commandCenter', slot);
  if (outcome === BUILT) {
    enemy.nextExpandAt = now + between(world, ENEMY_EXPAND.gap);
    return 0;
  }
  return Math.max(0, outcome);
}

/** 발전: 쓸 미네랄이 쌓였고 병영이 최대보다 적으면 기지 곁에 병영을 더 짓는다 */
function planGrowth(world: World, enemy: EnemyState): number {
  if (enemy.stock.mineral < ENEMY_GROW.surplusMineral) return 0;
  const barracks = enemyBuildings(world).filter((b) => b.kind === 'barracks');
  if (barracks.length >= ENEMY_GROW.maxBarracks || barracks.some((b) => !b.complete)) return 0;
  const slot = spotNearBase(world, 'barracks');
  return slot ? Math.max(0, attempt(world, enemy, 'barracks', slot)) : 0;
}

/** 다 지은 사령부 수에 맞춘 일꾼 목표 */
function workerTarget(world: World): number {
  const bases = enemyBuildings(world).filter((b) => b.kind === 'commandCenter' && b.complete).length;
  return Math.min(ENEMY_EXPAND.maxWorkers, Math.max(1, bases) * ENEMY_EXPAND.workersPerBase);
}

/** attempt 가 지었을 때 돌려주는 값 (남겨 둘 미네랄 0 과 구별) */
const BUILT = -1;

/** 지었으면 BUILT, 미네랄만 모자라면 그 비용, 그 밖(일꾼 없음·자리 막힘)은 0 */
function attempt(world: World, enemy: EnemyState, kind: BuildingKind, at: Point): number {
  const cost = BUILDINGS[kind].mineral;
  if (!canPlace(world, kind, at, allUnitIds(world))) return 0;
  const builder = pickBuilder(world, at);
  if (!builder) return 0;
  if (enemy.stock.mineral < cost) return cost;
  clearFootprint(world, kind, at, builder.id);
  return tryBuild(world, enemy, kind, at, builder) ? BUILT : 0;
}

/** 지을 자리에 서 있는 적 유닛을 둘레로 비킨다 (집결지 곁 자리에 병력이 서 있어 영영 못 짓는 일이 없게) */
function clearFootprint(world: World, kind: BuildingKind, at: Point, builderId: number): void {
  const spec = BUILDINGS[kind];
  const rect = { x: at.x, y: at.y, width: spec.width, height: spec.height };
  const inside = world.units.filter(
    (u) => u.owner === 'enemy' && u.hp > 0 && u.id !== builderId && rectDistance(rect, Math.round(u.x), Math.round(u.y)) === 0,
  );
  if (inside.length === 0) return;
  const spots = freeTilesAround(world, { ...rect, x: rect.x - 1, y: rect.y - 1, width: rect.width + 2, height: rect.height + 2 }, inside.length);
  inside.forEach((u, i) => {
    const spot = spots[i];
    if (spot) commandMove(world, [u.id], spot);
  });
}

/** 보급고 자리가 다 막혔을 때: 적 사령부 둘레에서 놓을 수 있는 곳 */
function spotNearBase(world: World, kind: BuildingKind): Point | undefined {
  const center = enemyBuildings(world).find((b) => b.kind === 'commandCenter');
  if (!center) return undefined;
  for (let ring = 3; ring <= 10; ring++) {
    for (let y = center.y - ring; y <= center.y + center.height + ring; y++) {
      for (let x = center.x - ring; x <= center.x + center.width + ring; x++) {
        if (rectDistance(center, x, y) !== ring) continue;
        if (canPlace(world, kind, { x, y }, allUnitIds(world))) return { x, y };
      }
    }
  }
  return undefined;
}

function tryBuild(world: World, enemy: EnemyState, kind: BuildingKind, at: Point, builder: Unit): boolean {
  const b = commandBuild(world, [builder.id], kind, at);
  if (b && BUILDINGS[kind].trains?.includes('rifleman')) b.rally = { kind: 'point', ...enemy.plan.rally };
  return b !== null;
}

/** 보급이 곧 모자라고, 짓는 보급고도 없으면 true */
function needsDepot(world: World): boolean {
  const cap = supplyCap(world, 'enemy');
  if (cap >= SUPPLY_MAX) return false;
  const building = enemyBuildings(world).some((b) => b.kind === 'supplyDepot' && !b.complete);
  return !building && supplyUsed(world, 'enemy') + ENEMY.supplyMargin >= cap;
}

function freeSlot(world: World, kind: BuildingKind, slots: readonly Point[]): Point | undefined {
  return slots.find((p) => canPlace(world, kind, p, allUnitIds(world)));
}

// ── 생산 ──

/**
 * 일꾼은 목표까지 사령부마다, 병사는 enemyArmy.trainSoldiers 가 정한 만큼.
 * 기다리는 건물 미네랄(reserved)은 남겨 둔다.
 */
function trainUnits(world: World, enemy: EnemyState, reserved: number): void {
  const target = workerTarget(world);
  let workers = enemyUnits(world, 'worker').length;
  for (const b of enemyBuildings(world)) workers += b.trainQueue.filter((k) => k === 'worker').length;
  for (const b of enemyBuildings(world)) {
    if (b.kind !== 'commandCenter' || !b.complete || b.trainQueue.length > 0) continue;
    // 일꾼은 수입이라 남겨 둘 미네랄과 상관없이 뽑는다 (일꾼이 없어 건물을 못 짓는 교착을 막음)
    if (workers < target && enemy.stock.mineral >= UNITS.worker.mineral && commandTrain(world, b.id, 'worker')) workers += 1;
  }
  trainSoldiers(world, enemy, enemy.stock.mineral - reserved);
}
