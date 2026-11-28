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
  readonly path: readonly unknown[];
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
