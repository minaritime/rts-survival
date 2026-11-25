import { describe, expect, test } from 'vitest';
import { TILE_SIZE } from '../src/data/constants.ts';
import { createCommander, type Unit } from '../src/sim/entities.ts';
import { BODY_LIFT, nextSelection, unitAt, unitsInBox } from '../src/view/selection.ts';

const px = (tile: number): number => tile * TILE_SIZE + TILE_SIZE / 2;

function units(): Unit[] {
  return [createCommander(1, { x: 5, y: 5 }), createCommander(2, { x: 6, y: 5 }), createCommander(3, { x: 20, y: 20 })];
}

describe('unitAt (클릭)', () => {
  test('몸 한가운데를 누르면 그 유닛', () => {
    expect(unitAt(units(), { x: px(5), y: px(5) - BODY_LIFT }, 0)?.id).toBe(1);
  });

  test('둘이 가까우면 더 가까운 쪽', () => {
    expect(unitAt(units(), { x: px(6) - 5, y: px(5) - BODY_LIFT }, 0)?.id).toBe(2);
  });

  test('빈 땅이면 없음, 죽은 유닛은 안 고름', () => {
    const list = units();
    expect(unitAt(list, { x: px(12), y: px(12) }, 0)).toBeUndefined();
    list[0]!.hp = 0;
    expect(unitAt(list, { x: px(5), y: px(5) - BODY_LIFT }, 0)).toBeUndefined();
  });
});

describe('unitsInBox (끌어서 고르기)', () => {
  test('상자 안의 유닛만, 끈 방향과 상관없이', () => {
    const a = { x: px(4), y: px(4) };
    const b = { x: px(7), y: px(6) };
    expect(unitsInBox(units(), a, b, 0).map((u) => u.id)).toEqual([1, 2]);
    expect(unitsInBox(units(), b, a, 0).map((u) => u.id)).toEqual([1, 2]);
  });

  test('발은 밖이어도 몸이 상자에 걸치면 고른다', () => {
    const top = { x: px(4), y: px(5) - BODY_LIFT - 2 };
    const bottom = { x: px(7), y: px(5) - 4 };
    expect(unitsInBox(units(), top, bottom, 0)).toHaveLength(2);
  });

  test('죽은 유닛과 상자 밖 유닛은 빠진다', () => {
    const list = units();
    list[1]!.hp = 0;
    expect(unitsInBox(list, { x: 0, y: 0 }, { x: px(8), y: px(8) }, 0).map((u) => u.id)).toEqual([1]);
  });
});

describe('nextSelection', () => {
  test('Shift 없으면 바꾸고, 있으면 더한다', () => {
    const now = new Set([1]);
    expect([...nextSelection(now, [2, 3], false)]).toEqual([2, 3]);
    expect([...nextSelection(now, [2, 1], true)].sort()).toEqual([1, 2]);
    expect(nextSelection(now, [], false).size).toBe(0);
  });
});
