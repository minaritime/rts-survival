import type { Point } from '../grid.ts';
import { isWalkable, type World } from '../world.ts';

/** 밀어내기에 쓰는 몸: 자리(x, y)와 겹쳤을 때 방향을 정할 id */
export interface Body {
  readonly id: number;
  x: number;
  y: number;
}

/** 이보다 가까운 몸끼리는 서로 밀어낸다 (한 점에 겹쳐 하나처럼 보이지 않게) */
export const PERSONAL_SPACE = 0.7;
const PUSH_PER_SECOND = 1.5;

/**
 * 몸끼리 살짝 밀어내기 (괴물끼리, 걷지 않는 유닛끼리). 밀린 자리가 절벽·건물이면 밀지 않는다.
 * 원본 배열은 그대로 두고 몸의 자리만 고친다 (sim 은 틱마다 world 를 직접 고침)
 */
export function spreadApart(world: World, bodies: readonly Body[], dt: number): void {
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]!;
      const b = bodies[j]!;
      const gap = Math.hypot(b.x - a.x, b.y - a.y);
      if (gap >= PERSONAL_SPACE) continue;
      const { ux, uy } = pushDirection(a, b, gap);
      // 힘은 실제 거리로 (예전에는 겹친 경우 거리를 1로 바꿔 힘이 0이 되어 영영 안 벌어졌음)
      const push = Math.min((PERSONAL_SPACE - gap) / 2, PUSH_PER_SECOND * dt);
      nudge(world, a, -ux * push, -uy * push);
      nudge(world, b, ux * push, uy * push);
    }
  }
}

/** 유닛 충돌에 쓰는 몸: 걷는 중인지(path) 알아야 한다 */
export interface UnitBody extends Body {
  readonly path: readonly Point[];
}

/**
 * 유닛끼리 충돌 (2026-11-28 사용자 요청).
 * - 걷는 유닛이 서 있는 유닛에 부딪히면 서 있는 쪽이 한 번에 비켜난다 (스타2처럼 밀고 지나감)
 * - 걷는 유닛끼리·서 있는 유닛끼리는 살짝만 밀어낸다 (좁은 길에서 마주 걷다가 서로 막혀 멈추지 않게)
 * 밀린 자리가 절벽·건물이면 밀지 않는다 (그때는 겹쳐 지나간다)
 */
export function collideUnits(world: World, bodies: readonly UnitBody[], dt: number): void {
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]!;
      const b = bodies[j]!;
      const gap = Math.hypot(b.x - a.x, b.y - a.y);
      if (gap >= PERSONAL_SPACE) continue;
      const { ux, uy } = pushDirection(a, b, gap);
      const overlap = PERSONAL_SPACE - gap;
      const aWalks = a.path.length > 0;
      const bWalks = b.path.length > 0;
      if (aWalks !== bWalks) {
        // 서 있는 쪽만 겹친 만큼 비켜난다
        if (aWalks) nudge(world, b, ux * overlap, uy * overlap);
        else nudge(world, a, -ux * overlap, -uy * overlap);
        continue;
      }
      const push = Math.min(overlap / 2, PUSH_PER_SECOND * dt);
      nudge(world, a, -ux * push, -uy * push);
      nudge(world, b, ux * push, uy * push);
    }
  }
}

/** a 에서 b 쪽 단위 벡터. 딱 겹쳤으면 id 로 정한 방향 (같은 판은 늘 같게) */
function pushDirection(a: Body, b: Body, gap: number): { ux: number; uy: number } {
  if (gap >= 1e-6) return { ux: (b.x - a.x) / gap, uy: (b.y - a.y) / gap };
  const angle = ((a.id * 7 + b.id * 13) % 360) * (Math.PI / 180);
  return { ux: Math.cos(angle), uy: Math.sin(angle) };
}

function nudge(world: World, body: Body, dx: number, dy: number): void {
  const x = body.x + dx;
  const y = body.y + dy;
  if (isWalkable(world, Math.round(x), Math.round(y))) {
    body.x = x;
    body.y = y;
  }
}

/** 괴물에 막히면 길목을 건너뛰어야 해서 길을 고칠 수 있는 몸 */
export interface WalkerBody extends Body {
  readonly path: Point[];
}

/**
 * 유닛과 괴물의 충돌 (2026-11-28 사용자: "유닛 간이니 괴물도 포함").
 * 서로 적이라 밀고 지나가지 못한다 (스타2에서 적끼리 비켜 주지 않는 것과 같음).
 * - 서 있는 유닛은 괴물에게 밀리지 않는다. 괴물이 겹친 만큼 물러난다 (떼로 몰려와도 유닛이 밀려나지 않게)
 * - 걷는 유닛이 서 있는 괴물에 막히면 물러나면서 옆으로 미끄러져 돌아간다 (앞에서 멈춰 버리지 않게)
 * - 둘 다 걸으면 겹친 만큼 반씩 물러난다
 */
export function collideUnitsWithMonsters(world: World, units: readonly WalkerBody[], monsters: readonly UnitBody[]): void {
  for (const a of units) {
    for (const b of monsters) {
      const gap = Math.hypot(b.x - a.x, b.y - a.y);
      if (gap >= PERSONAL_SPACE) continue;
      const { ux, uy } = pushDirection(a, b, gap);
      const overlap = PERSONAL_SPACE - gap;
      const aWalks = a.path.length > 0;
      const bWalks = b.path.length > 0;
      if (!aWalks) nudge(world, b, ux * overlap, uy * overlap);
      else if (!bWalks) {
        skipBlockedWaypoint(a, b);
        const { tx, ty } = slideDirection(a, ux, uy);
        nudge(world, a, (-ux + tx) * overlap, (-uy + ty) * overlap);
      } else {
        nudge(world, a, (-ux * overlap) / 2, (-uy * overlap) / 2);
        nudge(world, b, (ux * overlap) / 2, (uy * overlap) / 2);
      }
    }
  }
}

/** 다음 길목 칸을 괴물이 차지하고 있으면 그 칸은 건너뛴다 (그 칸을 향해 계속 밀다가 멈추지 않게). 마지막 칸은 남긴다 */
function skipBlockedWaypoint(walker: WalkerBody, blocker: Body): void {
  const next = walker.path[0]!;
  if (walker.path.length > 1 && Math.hypot(next.x - blocker.x, next.y - blocker.y) < PERSONAL_SPACE) walker.path.shift();
}

/** 막힌 방향(ux, uy)에 수직이면서 가려던 쪽에 가까운 방향. 정면으로 막혔으면 id 로 왼쪽·오른쪽을 정한다 */
function slideDirection(walker: WalkerBody, ux: number, uy: number): { tx: number; ty: number } {
  const next = walker.path[0]!;
  const dot = (next.x - walker.x) * -uy + (next.y - walker.y) * ux;
  const side = Math.abs(dot) > 1e-3 ? Math.sign(dot) : walker.id % 2 === 0 ? 1 : -1;
  return { tx: -uy * side, ty: ux * side };
}
