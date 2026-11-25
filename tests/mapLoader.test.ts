import { describe, expect, test } from 'vitest';
import { MAP1_ROWS } from '../src/maps/map1.ts';
import { parseMap } from '../src/sim/mapLoader.ts';
import { isPassable } from '../src/sim/grid.ts';

describe('parseMap: 1맵', () => {
  const map = parseMap(MAP1_ROWS);

  test('크기는 64 x 48', () => {
    expect(map.grid.width).toBe(64);
    expect(map.grid.height).toBe(48);
  });

  test('시제품.md 2장 배치 개수와 같다', () => {
    const f = map.features;
    expect(f.start).toEqual({ x: 14, y: 24 });
    expect(f.minerals).toHaveLength(8);
    expect(f.feeders).toHaveLength(3);
    expect(f.berries).toHaveLength(10);
    expect(f.debris).toHaveLength(5);
    expect(f.hunts).toHaveLength(6);
    expect(f.entrances.north).toHaveLength(4);
    expect(f.entrances.east).toHaveLength(4);
  });

  test('절벽만 막히고 나머지 표시는 지형상 지나갈 수 있다', () => {
    expect(isPassable(map.grid, 0, 0)).toBe(false);
    expect(isPassable(map.grid, map.features.start.x, map.features.start.y)).toBe(true);
    for (const p of map.features.entrances.north) expect(isPassable(map.grid, p.x, p.y)).toBe(true);
  });
});

describe('parseMap: 잘못된 지도', () => {
  test('빈 지도', () => {
    expect(() => parseMap([])).toThrow('비어');
  });

  test('첫 줄이 빈 문자열', () => {
    expect(() => parseMap([''])).toThrow('비어');
  });

  test('줄 길이가 다름', () => {
    expect(() => parseMap(['S..', '..'])).toThrow('길이');
  });

  test('모르는 글자', () => {
    expect(() => parseMap(['S.x'])).toThrow("'x'");
  });

  test('시작 지점이 없음', () => {
    expect(() => parseMap(['...'])).toThrow('0개');
  });

  test('시작 지점이 둘', () => {
    expect(() => parseMap(['S.S'])).toThrow('2개');
  });
});
