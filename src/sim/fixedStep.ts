/**
 * 화면 프레임 시간을 받아 규칙을 고정 간격으로 몇 번 돌릴지 정한다.
 * 화면이 느리면 한 프레임에 여러 번, 빠르면 0번 돈다.
 */
export interface Stepper {
  /** 흐른 시간(초)을 넣으면 그만큼 step 을 부르고, 부른 횟수를 돌려준다 */
  advance(deltaSeconds: number, step: () => void): number;
  /**
   * 다음 틱까지 얼마나 왔는지 (0 이상 1 미만).
   * 화면은 직전 틱 위치와 지금 틱 위치를 이 비율로 섞어 그려서 20틱이어도 부드럽게 보이게 한다.
   */
  readonly alpha: number;
}

/** 소수점 빼기 오차로 틱 하나를 놓치지 않기 위한 여유 (초) */
const FLOAT_SLACK = 1e-9;

export function createStepper(stepSeconds: number, maxStepsPerCall: number): Stepper {
  if (!(stepSeconds > 0)) throw new Error(`틱 간격이 잘못됨: ${stepSeconds}`);
  if (!Number.isInteger(maxStepsPerCall) || maxStepsPerCall < 1) {
    throw new Error(`한 번에 도는 틱 상한이 잘못됨: ${maxStepsPerCall}`);
  }
  let carried = 0;

  return {
    advance(deltaSeconds, step) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;
      carried += deltaSeconds;
      let steps = 0;
      while (carried + FLOAT_SLACK >= stepSeconds && steps < maxStepsPerCall) {
        step();
        carried = Math.max(0, carried - stepSeconds);
        steps++;
      }
      // 상한에 걸려 밀린 시간은 버린다. 탭을 오래 비웠다 돌아와도 한꺼번에 몰아서 돌지 않게.
      if (steps === maxStepsPerCall) carried = Math.min(carried, stepSeconds);
      return steps;
    },
    get alpha() {
      return Math.min(carried / stepSeconds, 1 - Number.EPSILON);
    },
  };
}
