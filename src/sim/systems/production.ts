import { BUILDINGS } from '../../data/buildings.ts';
import { TUTORIAL_RULES } from '../../data/tutorial.ts';
import { UNITS, type TrainableKind } from '../../data/units.ts';
import { commandGather, commandMove } from '../commands.ts';
import { createTrainedUnit, type Building } from '../entities.ts';
import type { Point } from '../grid.ts';
import { rectDistance } from '../path.ts';
import { isWalkable, supplyCap, supplyUsed, type World } from '../world.ts';

/** 이 건물이 뽑을 수 있는 유닛인지 */
export function canTrain(building: Building, kind: TrainableKind): boolean {
  return (BUILDINGS[building.kind].trains ?? []).includes(kind);
}

/**
 * 나올 칸: 건물 바로 둘레 중 밟을 수 있고 다른 유닛이 없는 칸. 남쪽(화면 아래)부터.
 * 둘레가 다 막혔으면 한 칸씩 넓혀 찾는다.
 */
function spawnTile(world: World, b: Building): Point {
  const taken = new Set(world.units.map((u) => `${Math.round(u.x)},${Math.round(u.y)}`));
  for (let ring = 1; ring <= 6; ring++) {
    const candidates: Point[] = [];
    for (let y = b.y - ring; y < b.y + b.height + ring; y++) {
      for (let x = b.x - ring; x < b.x + b.width + ring; x++) {
        if (rectDistance(b, x, y) !== ring || !isWalkable(world, x, y)) continue;
        candidates.push({ x, y });
      }
    }
    const cx = b.x + (b.width - 1) / 2;
    candidates.sort((p, q) => q.y - p.y || Math.abs(p.x - cx) - Math.abs(q.x - cx));
    const free = candidates.find((p) => !taken.has(`${p.x},${p.y}`)) ?? candidates[0];
    if (free) return free;
  }
  return { x: b.x, y: b.y + b.height };
}

/** 나온 유닛을 집결 지점으로: 일꾼이 자원 집결이면 캐러, 땅이면 그곳으로 */
function sendToRally(world: World, b: Building, unitId: number): void {
  const rally = b.rally;
  if (!rally) return;
  if (rally.kind === 'node') {
    if (world.nodes.some((n) => n.id === rally.nodeId)) commandGather(world, [unitId], rally.nodeId);
    return;
  }
  commandMove(world, [unitId], { x: rally.x, y: rally.y });
}

/**
 * 생산: 다 지은 건물마다 줄 맨 앞 유닛을 만든다.
 * 보급이 모자라면 시작하지 않고 기다린다 (스타처럼 시작할 때 보급을 차지).
 */
export function stepProduction(world: World, dt: number): void {
  for (const b of world.buildings) {
    const kind = b.trainQueue[0];
    if (!b.complete || !kind) continue;
    if (!b.trainStarted) {
      if (supplyUsed(world, b.owner) + UNITS[kind].supply > supplyCap(world, b.owner)) continue;
      b.trainStarted = true;
    }
    const seconds = world.tutorialRules ? TUTORIAL_RULES.trainSeconds : UNITS[kind].trainSeconds;
    b.trainProgress = Math.min(1, b.trainProgress + dt / seconds);
    if (b.trainProgress < 1 - 1e-9) continue;

    const unit = createTrainedUnit(world.nextId++, kind, spawnTile(world, b), b.owner);
    world.units.push(unit);
    if (b.owner === 'player') world.stats.unitsTrained += 1;
    b.trainQueue.shift();
    b.trainProgress = 0;
    b.trainStarted = false;
    sendToRally(world, b, unit.id);
  }
}

/** 보급이 모자라 줄 맨 앞을 시작하지 못하고 있는지 (화면 표시용) */
export function isSupplyBlocked(world: World, b: Building): boolean {
  const kind = b.trainQueue[0];
  return (
    b.complete &&
    kind !== undefined &&
    !b.trainStarted &&
    supplyUsed(world, b.owner) + UNITS[kind].supply > supplyCap(world, b.owner)
  );
}
