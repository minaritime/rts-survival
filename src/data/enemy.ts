import type { BuildingKind } from './buildings.ts';

/**
 * 거울 적 기지 (기획.md 8-2, 8-3). 시간은 초.
 * 적은 지휘관이 없어서 굶지 않는다. 적이 식량을 모으는 까닭은 **내 식량 수급을 방해하려는 것** (2026-11-25 사용자 확정):
 * 덤불을 먼저 비우고, 배급처 곁에 건물을 지어 빼앗고, 내 사령부를 부수면 식량을 한 번에 빼앗아 간다.
 */
export const ENEMY = {
  /** 시작 미네랄 */
  startMineral: 200,
  /** 일꾼을 이만큼까지 뽑는다 */
  workerTarget: 16,
  /** 덤불에서 열매를 따 나르는 일꾼 수 (일꾼이 이보다 많을 때부터) */
  foragers: 2,
  foragersFromWorkers: 8,
  /** 열매를 한 번에 이만큼까지 들고 사령부로 간다 */
  foodPerTrip: 10,
  /** 생각하는 간격 (매 틱 하지 않음) */
  thinkSeconds: 1,
  /** 첫 공격 시각과 첫 공격 기준치(병력 보급) */
  firstAttackSeconds: 7 * 60,
  firstThreshold: 6,
  /** 공격할 때마다 기준치가 이만큼 는다 */
  thresholdStep: 4,
  /** 물러난 뒤 다음 공격까지 최소한 이만큼 모은다 */
  regroupSeconds: 60,
  /** 공격 중 병력이 처음의 이 비율 이하로 줄면 물러난다 */
  retreatRatio: 0.5,
  /** 보급이 이만큼 남으면 보급고를 더 짓는다 */
  supplyMargin: 2,
} as const;

/**
 * 약탈 (2026-11-25 사용자 확정: 건물을 부수면 한 번에).
 * 식량 한도를 주는 내 건물(사령부)이 부서질 때 적 유닛이 곁(radius 칸)에 있으면 내 저장 식량의 이 비율을 빼앗아 간다.
 */
export const RAID = { stealRatio: 0.5, radius: 8 } as const;

/** 적 건설 순서 한 줄: 시각이 되고 미네랄이 있으면 정해진 자리에 짓는다 */
export interface BuildStep {
  readonly kind: BuildingKind;
  readonly at: { readonly x: number; readonly y: number };
  readonly afterSeconds: number;
}
