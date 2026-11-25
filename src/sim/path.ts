import type { Point } from './grid.ts';

/** 칸이 지나갈 수 있는지. 범위 밖이면 false 를 돌려줘야 한다 */
export type Walkable = (x: number, y: number) => boolean;

interface Step {
  readonly dx: number;
  readonly dy: number;
  readonly cost: number;
}

const STEPS_8: readonly Step[] = [
  { dx: 1, dy: 0, cost: 1 },
  { dx: -1, dy: 0, cost: 1 },
  { dx: 0, dy: 1, cost: 1 },
  { dx: 0, dy: -1, cost: 1 },
  { dx: 1, dy: 1, cost: Math.SQRT2 },
  { dx: 1, dy: -1, cost: Math.SQRT2 },
  { dx: -1, dy: 1, cost: Math.SQRT2 },
  { dx: -1, dy: -1, cost: Math.SQRT2 },
];

/** 길찾기가 너무 오래 걸리지 않게 둘러보는 칸 수 상한 */
const MAX_EXPANDED = 20000;

const key = (x: number, y: number): string => `${x},${y}`;

function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

interface Node {
  readonly x: number;
  readonly y: number;
  readonly g: number;
  readonly f: number;
}

/** f 값이 작은 것부터 꺼내는 이진 힙 */
class MinHeap {
  private readonly items: Node[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: Node): void {
    const items = this.items;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent]!.f <= items[i]!.f) break;
      [items[parent], items[i]] = [items[i]!, items[parent]!];
      i = parent;
    }
  }

  pop(): Node | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0 && last !== undefined) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && items[l]!.f < items[smallest]!.f) smallest = l;
        if (r < items.length && items[r]!.f < items[smallest]!.f) smallest = r;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i]!, items[smallest]!];
        i = smallest;
      }
    }
    return top;
  }
}

/**
 * A* 공통 부분. isGoal 을 만족하는 칸에 닿으면 그 칸까지의 길(시작 칸 제외)을 돌려준다.
 * 8방향, 막힌 모서리는 대각선으로 가로지르지 않는다.
 */
function search(
  walkable: Walkable,
  start: Point,
  isGoal: (x: number, y: number) => boolean,
  heuristic: (x: number, y: number) => number,
): Point[] | null {
  if (isGoal(start.x, start.y)) return [];

  const open = new MinHeap();
  const bestG = new Map<string, number>();
  const cameFrom = new Map<string, Point>();
  open.push({ x: start.x, y: start.y, g: 0, f: heuristic(start.x, start.y) });
  bestG.set(key(start.x, start.y), 0);

  let expanded = 0;
  while (open.size > 0 && expanded < MAX_EXPANDED) {
    const cur = open.pop()!;
    if (cur.g > (bestG.get(key(cur.x, cur.y)) ?? Infinity)) continue; // 더 좋은 길로 이미 다녀감
    if (isGoal(cur.x, cur.y)) return rebuild(cameFrom, start, cur);
    expanded++;

    for (const step of STEPS_8) {
      const nx = cur.x + step.dx;
      const ny = cur.y + step.dy;
      if (!walkable(nx, ny)) continue;
      if (step.dx !== 0 && step.dy !== 0 && (!walkable(cur.x + step.dx, cur.y) || !walkable(cur.x, cur.y + step.dy))) {
        continue;
      }
      const g = cur.g + step.cost;
      const k = key(nx, ny);
      if (g >= (bestG.get(k) ?? Infinity)) continue;
      bestG.set(k, g);
      cameFrom.set(k, { x: cur.x, y: cur.y });
      open.push({ x: nx, y: ny, g, f: g + heuristic(nx, ny) });
    }
  }
  return null;
}

function rebuild(cameFrom: ReadonlyMap<string, Point>, start: Point, end: Point): Point[] {
  const path: Point[] = [];
  let cur: Point = { x: end.x, y: end.y };
  while (cur.x !== start.x || cur.y !== start.y) {
    path.push(cur);
    cur = cameFrom.get(key(cur.x, cur.y))!;
  }
  return path.reverse();
}

/** start 에서 goal 칸까지의 길. 갈 수 없으면 null, 제자리면 [] */
export function findPath(walkable: Walkable, start: Point, goal: Point): Point[] | null {
  if (!walkable(goal.x, goal.y)) return null;
  return search(
    walkable,
    start,
    (x, y) => x === goal.x && y === goal.y,
    (x, y) => octile(x, y, goal.x, goal.y),
  );
}

/** 막혀 있는 대상(자원·건물) 바로 옆(8방향) 칸까지의 길. 이미 옆이면 [] */
export function findPathNextTo(walkable: Walkable, start: Point, target: Point): Point[] | null {
  const touching = (x: number, y: number): boolean =>
    Math.max(Math.abs(x - target.x), Math.abs(y - target.y)) === 1;
  return search(walkable, start, touching, (x, y) => Math.max(0, octile(x, y, target.x, target.y) - Math.SQRT2));
}

export interface TileRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 칸이 사각형(건물 자리) 안인지 */
export function inRect(r: TileRect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
}

/** 사각형까지의 칸 거리 (체비셰프). 안이면 0, 바로 옆이면 1 */
export function rectDistance(r: TileRect, x: number, y: number): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.width - 1));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.height - 1));
  return Math.max(dx, dy);
}

/** 사각형(건물) 바로 바깥 둘레(8방향) 칸까지의 길. 이미 둘레면 [] */
export function findPathNextToRect(walkable: Walkable, start: Point, rect: TileRect): Point[] | null {
  return search(
    walkable,
    start,
    (x, y) => rectDistance(rect, x, y) === 1,
    (x, y) => Math.max(0, rectDistance(rect, x, y) - 1),
  );
}

/** 길의 실제 길이 (칸 단위) */
export function pathLength(start: Point, path: readonly Point[]): number {
  let total = 0;
  let prev = start;
  for (const p of path) {
    total += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return total;
}
