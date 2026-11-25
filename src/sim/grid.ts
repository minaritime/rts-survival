/**
 * 칸 지도. 지형(지나갈 수 있는지)만 담는다.
 * 건물·자원처럼 생기고 없어지는 것은 나중에 따로 겹쳐서 본다.
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Grid {
  readonly width: number;
  readonly height: number;
  /** y * width + x 위치. true 면 지나갈 수 있음 */
  readonly passable: readonly boolean[];
}

export function createGrid(
  width: number,
  height: number,
  isOpen: (x: number, y: number) => boolean,
): Grid {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`지도 크기가 잘못됨: ${width} x ${height}`);
  }
  const passable: boolean[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      passable.push(isOpen(x, y));
    }
  }
  return { width, height, passable };
}

export function inBounds(grid: Grid, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < grid.width && y < grid.height;
}

export function tileIndex(grid: Grid, x: number, y: number): number {
  return y * grid.width + x;
}

export function isPassable(grid: Grid, x: number, y: number): boolean {
  return inBounds(grid, x, y) && grid.passable[tileIndex(grid, x, y)] === true;
}

/** 주어진 칸들을 막은 새 지도를 돌려준다 (원본은 그대로). */
export function withBlocked(grid: Grid, blocked: readonly Point[]): Grid {
  const closed = new Set(blocked.filter((p) => inBounds(grid, p.x, p.y)).map((p) => tileIndex(grid, p.x, p.y)));
  return {
    ...grid,
    passable: grid.passable.map((open, i) => open && !closed.has(i)),
  };
}

const STEPS_4: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** 상하좌우로 걸어서 닿을 수 있는 칸의 위치 번호 모음. 시작 칸이 막혀 있으면 빈 모음. */
export function reachableFrom(grid: Grid, start: Point): ReadonlySet<number> {
  const seen = new Set<number>();
  if (!isPassable(grid, start.x, start.y)) return seen;
  const queue: Point[] = [start];
  seen.add(tileIndex(grid, start.x, start.y));
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]!;
    for (const step of STEPS_4) {
      const nx = cur.x + step.x;
      const ny = cur.y + step.y;
      if (!isPassable(grid, nx, ny)) continue;
      const idx = tileIndex(grid, nx, ny);
      if (seen.has(idx)) continue;
      seen.add(idx);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

export function canReach(grid: Grid, from: Point, to: Point): boolean {
  return inBounds(grid, to.x, to.y) && reachableFrom(grid, from).has(tileIndex(grid, to.x, to.y));
}
