import { describe, expect, test } from 'vitest';
import { directionIndex } from '../src/view/assets.ts';

/**
 * 그림 방향 번호는 art/blender/render_sprites.py 와 같아야 한다:
 * 0 동, 1 남동, 2 남, 3 남서, 4 서, 5 북서, 6 북, 7 북동 (화면 기준 시계 방향, 화면 아래가 +y)
 */
describe('directionIndex', () => {
  test.each([
    [1, 0, 0],
    [1, 1, 1],
    [0, 1, 2],
    [-1, 1, 3],
    [-1, 0, 4],
    [-1, -1, 5],
    [0, -1, 6],
    [1, -1, 7],
  ])('(%d, %d) → %d', (dx, dy, expected) => {
    expect(directionIndex(dx, dy)).toBe(expected);
  });

  test('가까운 방향으로 반올림', () => {
    expect(directionIndex(1, 0.3)).toBe(0);
    expect(directionIndex(1, 0.6)).toBe(1);
    expect(directionIndex(-1, -0.01)).toBe(4);
  });
});
