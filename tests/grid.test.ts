import { describe, expect, test } from 'vitest';
import { MAP1_ROWS } from '../src/maps/map1.ts';
import { parseMap } from '../src/sim/mapLoader.ts';
import {
  canReach,
  createGrid,
  inBounds,
  isPassable,
  reachableFrom,
  withBlocked,
  type Point,
} from '../src/sim/grid.ts';

const line = (xs: readonly number[], y: number): Point[] => xs.map((x) => ({ x, y }));
const column = (x: number, ys: readonly number[]): Point[] => ys.map((y) => ({ x, y }));

describe('grid 기본', () => {
  test('잘못된 크기는 거부', () => {
    expect(() => createGrid(0, 5, () => true)).toThrow('크기');
    expect(() => createGrid(3.5, 5, () => true)).toThrow('크기');
  });

  test('범위 밖과 정수가 아닌 칸은 지나갈 수 없음', () => {
    const grid = createGrid(3, 3, () => true);
    expect(inBounds(grid, 3, 0)).toBe(false);
    expect(inBounds(grid, -1, 0)).toBe(false);
    expect(inBounds(grid, 0.5, 0)).toBe(false);
    expect(isPassable(grid, 2, 2)).toBe(true);
    expect(isPassable(grid, 3, 2)).toBe(false);
  });

  test('withBlocked 는 원본을 바꾸지 않는다', () => {
    const grid = createGrid(3, 1, () => true);
    const blocked = withBlocked(grid, [{ x: 1, y: 0 }, { x: 9, y: 9 }]);
    expect(isPassable(blocked, 1, 0)).toBe(false);
    expect(isPassable(grid, 1, 0)).toBe(true);
  });

  test('막힌 칸에서 시작하면 닿는 곳이 없다', () => {
    const grid = createGrid(2, 1, (x) => x === 1);
    expect(reachableFrom(grid, { x: 0, y: 0 }).size).toBe(0);
    expect(canReach(grid, { x: 1, y: 0 }, { x: 5, y: 0 })).toBe(false);
  });
});

describe('1맵 지형 (시제품.md 2장)', () => {
  const map = parseMap(MAP1_ROWS);
  const { grid, features } = map;
  const north = features.entrances.north[0]!;
  const east = features.entrances.east[0]!;
  const meadow = features.hunts[0]!;
  const northChoke = line([26, 27, 28, 29], 12);
  const eastChoke = column(44, [20, 21, 22, 23]);
  const southPassage = line([12, 13], 36);

  test('두 괴물 입구에서 시작 지점까지 갈 수 있다', () => {
    expect(canReach(grid, north, features.start)).toBe(true);
    expect(canReach(grid, east, features.start)).toBe(true);
  });

  test('본진으로 들어오는 길은 북쪽·동쪽 길목뿐', () => {
    const sealed = withBlocked(grid, [...northChoke, ...eastChoke]);
    expect(canReach(sealed, north, features.start)).toBe(false);
    expect(canReach(sealed, east, features.start)).toBe(false);
  });

  test('길목 하나만 열려 있어도 들어온다', () => {
    expect(canReach(withBlocked(grid, northChoke), north, features.start)).toBe(true);
    expect(canReach(withBlocked(grid, eastChoke), east, features.start)).toBe(true);
  });

  test('남쪽 풀밭은 본진의 남쪽 통로로만 간다', () => {
    expect(canReach(grid, features.start, meadow)).toBe(true);
    const sealed = withBlocked(grid, southPassage);
    expect(canReach(sealed, features.start, meadow)).toBe(false);
    expect(canReach(sealed, north, meadow)).toBe(false);
  });

  test('바깥 배급처 2곳은 길목 밖, 본진 배급처는 안', () => {
    const sealed = withBlocked(grid, [...northChoke, ...eastChoke]);
    const insideBase = features.feeders.filter((f) => canReach(sealed, features.start, f));
    expect(insideBase).toEqual([{ x: 10, y: 28 }]);
  });
});
