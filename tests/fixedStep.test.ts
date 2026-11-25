import { describe, expect, test } from 'vitest';
import { createStepper } from '../src/sim/fixedStep.ts';

describe('createStepper', () => {
  test('흐른 시간만큼 고정 간격으로 돌고 남은 시간은 다음으로 넘긴다', () => {
    const stepper = createStepper(0.05, 10);
    let count = 0;
    expect(stepper.advance(0.12, () => count++)).toBe(2);
    expect(stepper.advance(0.03, () => count++)).toBe(1); // 0.02 남은 것 + 0.03
    expect(count).toBe(3);
  });

  test('짧은 프레임에는 0번', () => {
    const stepper = createStepper(0.05, 10);
    expect(stepper.advance(0.01, () => undefined)).toBe(0);
  });

  test('오래 멈췄다 돌아와도 상한까지만 돌고 밀린 시간은 버린다', () => {
    const stepper = createStepper(0.05, 3);
    expect(stepper.advance(10, () => undefined)).toBe(3);
    expect(stepper.advance(0, () => undefined)).toBe(0);
    expect(stepper.advance(0.001, () => undefined)).toBe(1);
  });

  test('이상한 시간 값은 무시', () => {
    const stepper = createStepper(0.05, 3);
    expect(stepper.advance(-1, () => undefined)).toBe(0);
    expect(stepper.advance(Number.NaN, () => undefined)).toBe(0);
    expect(stepper.advance(Number.POSITIVE_INFINITY, () => undefined)).toBe(0);
  });

  test('alpha 는 다음 틱까지 온 비율', () => {
    const stepper = createStepper(0.05, 10);
    expect(stepper.alpha).toBe(0);
    stepper.advance(0.075, () => undefined);
    expect(stepper.alpha).toBeCloseTo(0.5, 6);
    stepper.advance(10, () => undefined); // 상한에 걸려도 1 미만
    expect(stepper.alpha).toBeLessThan(1);
  });

  test('잘못된 설정은 거부', () => {
    expect(() => createStepper(0, 3)).toThrow('틱 간격');
    expect(() => createStepper(0.05, 0)).toThrow('상한');
  });
});
