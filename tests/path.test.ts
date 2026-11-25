import { describe, expect, test } from 'vitest';
import { findPath, findPathNextTo, pathLength } from '../src/sim/path.ts';
import type { Point } from '../src/sim/grid.ts';

/** 글자 그림으로 지나갈 수 있는 칸을 만든다. '#' 막힘 */
function walkableFrom(rows: readonly string[]): (x: number, y: number) => boolean {
  return (x, y) => y >= 0 && y < rows.length && x >= 0 && x < rows[0]!.length && rows[y]![x] !== '#';
}

const isAdjacent = (a: Point, b: Point): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;

function expectConnected(start: Point, path: readonly Point[]): void {
  let prev = start;
  for (const p of path) {
    expect(isAdjacent(prev, p)).toBe(true);
    prev = p;
  }
}

describe('findPath', () => {
  test('막힘 없으면 대각선으로 곧장 간다', () => {
    const walk = walkableFrom(['....', '....', '....', '....']);
    const path = findPath(walk, { x: 0, y: 0 }, { x: 3, y: 3 });
    expect(path).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
  });

  test('제자리면 빈 길', () => {
    const walk = walkableFrom(['..']);
    expect(findPath(walk, { x: 1, y: 0 }, { x: 1, y: 0 })).toEqual([]);
  });

  test('벽을 돌아간다', () => {
    const walk = walkableFrom([
      '.....',
      '.###.',
      '...#.',
      '.###.',
      '.....',
    ]);
    const start = { x: 2, y: 2 };
    const path = findPath(walk, start, { x: 4, y: 2 });
    expect(path).not.toBeNull();
    expectConnected(start, path!);
    expect(path!.at(-1)).toEqual({ x: 4, y: 2 });
    for (const p of path!) expect(walk(p.x, p.y)).toBe(true);
  });

  test('막힌 모서리를 대각선으로 가로지르지 않는다', () => {
    const walk = walkableFrom(['.#', '#.']);
    expect(findPath(walk, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });

  test('갈 수 없으면 null', () => {
    const walk = walkableFrom(['.#.']);
    expect(findPath(walk, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });

  test('목적지가 막혀 있으면 null', () => {
    const walk = walkableFrom(['..#']);
    expect(findPath(walk, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });

  test('가장 짧은 길을 고른다 (대각선 1.414)', () => {
    const walk = walkableFrom(['......', '......', '......']);
    const path = findPath(walk, { x: 0, y: 0 }, { x: 5, y: 1 })!;
    expect(pathLength({ x: 0, y: 0 }, path)).toBeCloseTo(4 + Math.SQRT2, 5);
  });
});

describe('findPathNextTo', () => {
  test('막힌 대상(자원) 옆 칸까지 간다', () => {
    const walk = walkableFrom(['.....', '..#..', '.....']);
    const start = { x: 0, y: 1 };
    const path = findPathNextTo(walk, start, { x: 2, y: 1 })!;
    expect(isAdjacent(path.at(-1)!, { x: 2, y: 1 })).toBe(true);
    expect(path).toHaveLength(1);
  });

  test('이미 옆이면 빈 길', () => {
    const walk = walkableFrom(['.#']);
    expect(findPathNextTo(walk, { x: 0, y: 0 }, { x: 1, y: 0 })).toEqual([]);
  });

  test('대상 둘레가 다 막혀 있으면 null', () => {
    const walk = walkableFrom(['.....', '.###.', '.###.', '.###.', '.....']);
    expect(findPathNextTo(walk, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
  });
});
