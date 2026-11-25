import { describe, expect, test } from 'vitest';
import {
  addToGroup,
  assignGroup,
  DOUBLE_TAP_MS,
  isDoubleTap,
  recallGroup,
  slotFromCode,
  type ControlGroups,
} from '../src/view/controlGroups.ts';

const alive = (dead: readonly number[] = []) => (id: number) => !dead.includes(id);

describe('부대 지정', () => {
  test('숫자 키 코드 → 번호 (숫자패드 포함), 다른 키는 null', () => {
    expect(slotFromCode('Digit1')).toBe(1);
    expect(slotFromCode('Digit0')).toBe(0);
    expect(slotFromCode('Numpad5')).toBe(5);
    expect(slotFromCode('KeyS')).toBeNull();
  });

  test('지정하면 덮어쓰고, 원래 묶음은 그대로 둔다', () => {
    const empty: ControlGroups = new Map();
    const g1 = assignGroup(empty, 1, [3, 4]);
    const g2 = assignGroup(g1, 1, [5]);
    expect(empty.size).toBe(0);
    expect(g1.get(1)).toEqual([3, 4]);
    expect(g2.get(1)).toEqual([5]);
  });

  test('빈 선택으로 지정하면 그 번호를 비운다', () => {
    expect(assignGroup(new Map([[2, [7]]]), 2, []).has(2)).toBe(false);
  });

  test('더하기는 겹치지 않게 합친다', () => {
    const g = addToGroup(new Map([[1, [3, 4]]]), 1, [4, 5]);
    expect(g.get(1)).toEqual([3, 4, 5]);
    expect(addToGroup(new Map(), 9, [1]).get(9)).toEqual([1]);
  });

  test('불러오면 죽은 유닛은 빠진다', () => {
    const g = assignGroup(new Map(), 3, [1, 2, 3]);
    expect(recallGroup(g, 3, alive([2]))).toEqual([1, 3]);
    expect(recallGroup(g, 4, alive())).toEqual([]);
  });

  test('같은 번호를 빨리 두 번 누르면 화면 이동', () => {
    expect(isDoubleTap(null, 1, 0)).toBe(false);
    expect(isDoubleTap({ slot: 1, timeMs: 1000 }, 1, 1000 + DOUBLE_TAP_MS)).toBe(true);
    expect(isDoubleTap({ slot: 1, timeMs: 1000 }, 1, 1000 + DOUBLE_TAP_MS + 1)).toBe(false);
    expect(isDoubleTap({ slot: 1, timeMs: 1000 }, 2, 1100)).toBe(false);
  });
});
